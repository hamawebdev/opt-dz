//! `record_payment_tx` / `delete_payment_tx` and the balance they reconcile.

use super::support::*;
use super::*;

async fn sale_with_stock(tx: &mut Transaction<'_, Sqlite>, price: i64) -> (i64, i64) {
    let p = mk_product(tx, ProductSpec { quantity: 100, ..Default::default() }).await;
    let id = create_sale_tx(tx, simple_sale(None, p, price, 1, "2026-03-10")).await.unwrap();
    (p, id)
}

#[tokio::test]
async fn partial_then_full_payment_walks_the_status() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;

    do_payment(&mut tx, id, 400_00, "card", At("2026-03-10 09:00:00")).await.unwrap();
    assert_eq!(sale_status(&mut tx, id).await, "partial");
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 600_00);

    do_payment(&mut tx, id, 600_00, "card", At("2026-03-11 09:00:00")).await.unwrap();
    assert_eq!(sale_status(&mut tx, id).await, "paid");
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 0);
}

#[tokio::test]
async fn rejects_overpayment() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;

    do_payment(&mut tx, id, 900_00, "card", At("2026-03-10 09:00:00")).await.unwrap();
    let err = do_payment(&mut tx, id, 200_00, "card", At("2026-03-10 10:00:00"))
        .await
        .unwrap_err();
    assert!(err.contains("exceeds the amount owed"), "got: {err}");
}

#[tokio::test]
async fn rejects_non_positive_payments() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;
    assert!(record_payment_tx(&mut tx, id, 0, None, None).await.is_err());
    assert!(record_payment_tx(&mut tx, id, -5, None, None).await.is_err());
}

#[tokio::test]
async fn deleting_a_payment_restores_the_balance() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;
    do_payment(&mut tx, id, 1000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();
    assert_eq!(sale_status(&mut tx, id).await, "paid");

    let pid: i64 = sqlx::query_scalar("SELECT id FROM payments WHERE sale_id=?1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    delete_payment_tx(&mut tx, pid, id).await.unwrap();

    assert_eq!(sale_status(&mut tx, id).await, "unpaid");
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 1000_00);
}

/// Droit de timbre is charged only once the sale is settled in cash, and it is
/// added to what is *owed* — it is deliberately not folded into `sales.total`.
/// Reports must therefore never treat `total` as "all the cash this invoice
/// brings in"; that asymmetry is the root of the billed-vs-collected mismatch
/// and is why the P&L reconciles TTC -> HT explicitly.
#[tokio::test]
async fn timbre_applies_on_cash_and_is_excluded_from_total() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "timbre_rate", "100").await; // 1%
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;

    do_payment(&mut tx, id, 500_00, "cash", At("2026-03-10 09:00:00")).await.unwrap();

    let total = money(&mut tx, "SELECT total FROM sales WHERE id=?1", id).await;
    let timbre = int(&mut tx, "SELECT timbre_amount FROM sales WHERE id=?1", id).await;
    let balance = money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await;

    assert_eq!(total, 1000_00, "total stays goods-only");
    assert_eq!(timbre, 10_00, "1% of 1000.00");
    assert_eq!(balance, 510_00, "owed = total + timbre - paid");
}

/// A card-only sale carries no timbre.
#[tokio::test]
async fn no_timbre_without_a_cash_payment() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "timbre_rate", "100").await;
    let (_, id) = sale_with_stock(&mut tx, 1000_00).await;

    do_payment(&mut tx, id, 1000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    assert_eq!(int(&mut tx, "SELECT timbre_amount FROM sales WHERE id=?1", id).await, 0);
    assert_eq!(sale_status(&mut tx, id).await, "paid");
}
