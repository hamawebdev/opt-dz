//! `record_stock_change_tx`: on-hand quantity must never diverge from the ledger.

use super::support::*;
use super::*;

fn delivery(product_id: Option<i64>, variant_id: Option<i64>, qty: i64) -> StockChangeInput {
    StockChangeInput {
        product_id,
        variant_id,
        movement_type: "delivery".into(),
        quantity_change: qty,
        purchase_price: None,
        note: None,
        supplier_id: None,
        debt_amount: None,
    }
}

#[tokio::test]
async fn delivery_raises_stock_and_logs_a_movement() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 5, ..Default::default() }).await;

    record_stock_change_tx(&mut tx, delivery(Some(p), None, 20)).await.unwrap();

    assert_eq!(stock_of(&mut tx, p).await, 25);
    let logged = int(
        &mut tx,
        "SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id=?1",
        p,
    )
    .await;
    assert_eq!(logged, 20);
}

/// The on-hand quantity must equal the sum of the ledger across a realistic mix
/// of deliveries, sales, returns and manual adjustments. This is the invariant
/// that inventory valuation and stock-investment reporting both rest on.
#[tokio::test]
async fn on_hand_always_equals_the_movement_ledger() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 0, ..Default::default() }).await;

    record_stock_change_tx(&mut tx, delivery(Some(p), None, 50)).await.unwrap();

    let sale = create_sale_tx(&mut tx, simple_sale(None, p, 900_00, 4, "2026-03-10"))
        .await
        .unwrap();
    let item: i64 = sqlx::query_scalar("SELECT id FROM sale_items WHERE sale_id=?1")
        .bind(sale).fetch_one(&mut *tx).await.unwrap();
    do_payment(&mut tx, sale, 3600_00, "card", At("2026-03-10 09:00:00")).await.unwrap();
    do_return(
        &mut tx,
        sale,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    let mut adj = delivery(Some(p), None, -3);
    adj.movement_type = "adjustment".into();
    record_stock_change_tx(&mut tx, adj).await.unwrap();

    let on_hand = stock_of(&mut tx, p).await;
    let ledger = int(
        &mut tx,
        "SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements WHERE product_id=?1",
        p,
    )
    .await;
    assert_eq!(on_hand, 44, "50 delivered - 4 sold + 1 returned - 3 adjusted");
    assert_eq!(on_hand, ledger, "on-hand must never diverge from the ledger");
}

/// The schema trigger refuses to drive stock negative, whatever the caller asks.
#[tokio::test]
async fn stock_cannot_go_negative() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 2, ..Default::default() }).await;

    let mut adj = delivery(Some(p), None, -5);
    adj.movement_type = "adjustment".into();
    let err = record_stock_change_tx(&mut tx, adj).await.unwrap_err();
    assert!(err.contains("below zero"), "got: {err}");
}

#[tokio::test]
async fn variant_delivery_tracks_the_variant_not_the_product() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 0, ..Default::default() }).await;
    let v = mk_variant(&mut tx, p, 3, Some(200_00), Some(600_00)).await;

    record_stock_change_tx(&mut tx, delivery(Some(p), Some(v), 7)).await.unwrap();

    let vq: i64 = sqlx::query_scalar("SELECT quantity FROM product_variants WHERE id=?1")
        .bind(v).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(vq, 10);
    assert_eq!(stock_of(&mut tx, p).await, 0, "the parent product is untouched");
}

/// A supplier debt is only ever booked together with its delivery.
#[tokio::test]
async fn delivery_books_the_supplier_debt_atomically() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 0, ..Default::default() }).await;
    let s: i64 = sqlx::query("INSERT INTO suppliers (name) VALUES ('Luxottica')")
        .execute(&mut *tx).await.unwrap().last_insert_rowid();

    let mut d = delivery(Some(p), None, 10);
    d.supplier_id = Some(s);
    d.debt_amount = Some(3000_00);
    record_stock_change_tx(&mut tx, d).await.unwrap();

    let bal = int(
        &mut tx,
        "SELECT COALESCE(SUM(amount),0) FROM supplier_ledger WHERE supplier_id=?1",
        s,
    )
    .await;
    assert_eq!(bal, 3000_00, "purchases are positive: we owe more");
}

#[tokio::test]
async fn rejects_an_unknown_movement_type() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec::default()).await;
    let mut bad = delivery(Some(p), None, 1);
    bad.movement_type = "shrinkage".into();
    assert!(record_stock_change_tx(&mut tx, bad).await.is_err());
}
