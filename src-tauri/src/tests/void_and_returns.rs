//! `void_sale_tx` and `create_return_tx` — the two ways money leaves an invoice.

use super::support::*;
use super::*;

async fn paid_sale(tx: &mut Transaction<'_, Sqlite>, price: i64, qty: i64) -> (i64, i64, i64) {
    let p = mk_product(tx, ProductSpec { quantity: 100, ..Default::default() }).await;
    let id = create_sale_tx(tx, simple_sale(None, p, price, qty, "2026-03-10")).await.unwrap();
    let item: i64 = sqlx::query_scalar("SELECT id FROM sale_items WHERE sale_id=?1")
        .bind(id)
        .fetch_one(&mut **tx)
        .await
        .unwrap();
    (p, id, item)
}

#[tokio::test]
async fn voiding_restores_stock_and_zeroes_the_balance() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (p, id, _) = paid_sale(&mut tx, 500_00, 3).await;
    assert_eq!(stock_of(&mut tx, p).await, 97);

    void_sale_tx(&mut tx, id, Some("mistake".into())).await.unwrap();

    assert_eq!(sale_status(&mut tx, id).await, "void");
    assert_eq!(stock_of(&mut tx, p).await, 100, "stock restored");
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 0);
}

/// The invoice row and its fiscal number survive a void — deleting it would
/// break the gap-free TVA sequence.
#[tokio::test]
async fn voiding_keeps_the_invoice_number() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, _) = paid_sale(&mut tx, 500_00, 1).await;
    void_sale_tx(&mut tx, id, None).await.unwrap();

    let n: Option<String> = sqlx::query_scalar("SELECT invoice_number FROM sales WHERE id=?1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert!(n.is_some_and(|s| !s.is_empty()), "invoice number retained for audit");
}

#[tokio::test]
async fn cannot_void_twice_or_void_a_returned_sale() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 500_00, 2).await;

    do_payment(&mut tx, id, 1000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();
    do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    let err = void_sale_tx(&mut tx, id, None).await.unwrap_err();
    assert!(err.contains("has returns"), "got: {err}");

    let (_, other, _) = paid_sale(&mut tx, 100_00, 1).await;
    void_sale_tx(&mut tx, other, None).await.unwrap();
    assert!(void_sale_tx(&mut tx, other, None).await.unwrap_err().contains("already void"));
}

/// A voided sale is frozen: `sync_sale_balance` must leave it alone, so nothing
/// can resurrect a void invoice back into the receivables.
#[tokio::test]
async fn a_voided_sale_is_immutable() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, _) = paid_sale(&mut tx, 500_00, 1).await;
    void_sale_tx(&mut tx, id, None).await.unwrap();

    sync_sale_balance(&mut tx, id).await.unwrap();

    assert_eq!(sale_status(&mut tx, id).await, "void");
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 0);
}

#[tokio::test]
async fn return_restocks_and_credits_the_net_borne_amount() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (p, id, item) = paid_sale(&mut tx, 500_00, 4).await;
    do_payment(&mut tx, id, 2000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    let cn = do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 2 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    assert_eq!(stock_of(&mut tx, p).await, 98, "2 of 4 returned to stock");
    assert_eq!(int(&mut tx, "SELECT total FROM credit_notes WHERE id=?1", cn).await, 1000_00);
}

/// Returning more than was sold — across several credit notes — must be refused.
#[tokio::test]
async fn cannot_return_more_than_remains() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 500_00, 2).await;
    do_payment(&mut tx, id, 1000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 2 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    let err = do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-12 09:00:00"),
    )
    .await
    .unwrap_err();
    assert!(err.contains("only 0 remaining"), "got: {err}");
}

/// A cash refund can never exceed what the customer actually handed over.
#[tokio::test]
async fn cash_refund_is_capped_at_the_amount_paid() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 1000_00, 2).await;
    do_payment(&mut tx, id, 500_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    let err = do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 2 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap_err();
    assert!(err.contains("exceeds paid amount"), "got: {err}");
}

/// A 'balance' credit note reduces what is still owed rather than paying cash out.
#[tokio::test]
async fn balance_credit_reduces_what_is_owed() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 1000_00, 2).await;
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 2000_00);

    do_return(
        &mut tx,
        id,
        "balance",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 1000_00);
}

#[tokio::test]
async fn cannot_return_against_a_voided_sale() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 500_00, 1).await;
    void_sale_tx(&mut tx, id, None).await.unwrap();

    let err = do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap_err();
    assert!(err.contains("voided"), "got: {err}");
}

/// Credit-note numbers are sequential, like invoice numbers.
#[tokio::test]
async fn allocates_sequential_credit_note_numbers() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let (_, id, item) = paid_sale(&mut tx, 500_00, 2).await;
    do_payment(&mut tx, id, 1000_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    let a = do_return(&mut tx, id, "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }], At("2026-03-11 09:00:00")).await.unwrap();
    let b = do_return(&mut tx, id, "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }], At("2026-03-12 09:00:00")).await.unwrap();

    let na: String = sqlx::query_scalar("SELECT cn_number FROM credit_notes WHERE id=?1")
        .bind(a).fetch_one(&mut *tx).await.unwrap();
    let nb: String = sqlx::query_scalar("SELECT cn_number FROM credit_notes WHERE id=?1")
        .bind(b).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(na, "A000001");
    assert_eq!(nb, "A000002");
}

/// Returns of variant-tracked lines must record which variant came back.
/// `credit_note_items.variant_id` exists (migration v11) but `create_return`
/// never populated it, so variant-level return reporting silently saw nothing
/// and the restocked variant could not be traced from the credit note.
#[tokio::test]
async fn return_records_the_variant_it_restocked() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 0, ..Default::default() }).await;
    let v = mk_variant(&mut tx, p, 10, Some(300_00), Some(900_00)).await;

    let mut input = simple_sale(None, p, 900_00, 2, "2026-03-10");
    input.items[0].variant_id = Some(v);
    let id = create_sale_tx(&mut tx, input).await.unwrap();
    let item: i64 = sqlx::query_scalar("SELECT id FROM sale_items WHERE sale_id=?1")
        .bind(id).fetch_one(&mut *tx).await.unwrap();
    do_payment(&mut tx, id, 1800_00, "card", At("2026-03-10 09:00:00")).await.unwrap();

    let cn = do_return(
        &mut tx,
        id,
        "refund",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }],
        At("2026-03-11 09:00:00"),
    )
    .await
    .unwrap();

    let vq: i64 = sqlx::query_scalar("SELECT quantity FROM product_variants WHERE id=?1")
        .bind(v).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(vq, 9, "the variant is restocked");

    let recorded: Option<i64> =
        sqlx::query_scalar("SELECT variant_id FROM credit_note_items WHERE credit_note_id=?1")
            .bind(cn).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(recorded, Some(v), "the credit note must record the variant");
}
