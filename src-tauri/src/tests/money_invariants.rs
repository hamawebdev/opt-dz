//! Properties that must hold for *every* sale, whatever sequence of events it
//! went through. These are the guards against silent money corruption.

use super::support::*;
use super::*;

/// `sync_sale_balance` is the single authority for a sale's money, so running it
/// again must never change anything. If it were not idempotent, any command that
/// re-syncs (payment, return, claim rejection) could drift the balance.
#[tokio::test]
async fn sync_sale_balance_is_idempotent() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "timbre_rate", "100").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 100, ..Default::default() }).await;
    let id = create_sale_tx(&mut tx, simple_sale(None, p, 1234_56, 3, "2026-03-10"))
        .await
        .unwrap();
    do_payment(&mut tx, id, 1000_00, "cash", At("2026-03-10 09:00:00")).await.unwrap();

    let before = (
        money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await,
        money(&mut tx, "SELECT amount_paid FROM sales WHERE id=?1", id).await,
        int(&mut tx, "SELECT timbre_amount FROM sales WHERE id=?1", id).await,
        sale_status(&mut tx, id).await,
    );

    for _ in 0..5 {
        sync_sale_balance(&mut tx, id).await.unwrap();
    }

    let after = (
        money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await,
        money(&mut tx, "SELECT amount_paid FROM sales WHERE id=?1", id).await,
        int(&mut tx, "SELECT timbre_amount FROM sales WHERE id=?1", id).await,
        sale_status(&mut tx, id).await,
    );

    assert_eq!(before, after, "re-syncing must be a no-op");
}

/// Money columns are declared `REAL` but only ever hold whole centimes. A long
/// run of awkward amounts must not accumulate any floating-point drift.
#[tokio::test]
async fn many_payments_accumulate_no_float_drift() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 1000, ..Default::default() }).await;
    // 333 payments of 3.33 exactly settles 1108.89.
    let id = create_sale_tx(&mut tx, simple_sale(None, p, 1108_89, 1, "2026-03-10"))
        .await
        .unwrap();

    for i in 0..333 {
        do_payment(&mut tx, id, 3_33, "card", At("2026-03-10 09:00:00"))
            .await
            .unwrap_or_else(|e| panic!("payment {i} failed: {e}"));
    }

    let paid = money(&mut tx, "SELECT amount_paid FROM sales WHERE id=?1", id).await;
    let balance = money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await;
    assert_eq!(paid, 1108_89, "exact to the centime after 333 payments");
    assert_eq!(balance, 0);
    assert_eq!(sale_status(&mut tx, id).await, "paid");
}

/// Balance is never negative and never exceeds what could possibly be owed,
/// across a messy but realistic lifecycle.
#[tokio::test]
async fn balance_stays_within_bounds_through_a_messy_lifecycle() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "timbre_rate", "100").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 100, ..Default::default() }).await;
    let id = create_sale_tx(&mut tx, simple_sale(None, p, 700_00, 4, "2026-03-10"))
        .await
        .unwrap();
    let item: i64 = sqlx::query_scalar("SELECT id FROM sale_items WHERE sale_id=?1")
        .bind(id).fetch_one(&mut *tx).await.unwrap();

    do_payment(&mut tx, id, 1000_00, "cash", At("2026-03-10 09:00:00")).await.unwrap();
    do_return(&mut tx, id, "balance",
        vec![ReturnItemInput { sale_item_id: item, quantity: 1 }], At("2026-03-11 09:00:00"))
        .await.unwrap();
    do_payment(&mut tx, id, 500_00, "card", At("2026-03-12 09:00:00")).await.unwrap();

    let total = money(&mut tx, "SELECT total FROM sales WHERE id=?1", id).await;
    let timbre = int(&mut tx, "SELECT timbre_amount FROM sales WHERE id=?1", id).await;
    let balance = money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await;

    assert!(balance >= 0, "balance must never go negative, got {balance}");
    assert!(
        balance <= total + timbre,
        "balance {balance} exceeds the maximum conceivable due {}",
        total + timbre
    );
}

/// A rejected insurance claim re-bills the patient: the previously covered
/// amount must reappear in what they owe rather than silently vanishing.
#[tokio::test]
async fn rejecting_a_claim_rebills_the_patient() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let pat = mk_patient(&mut tx, "Yacine").await;
    let payer = mk_payer(&mut tx, "CNAS").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 10, ..Default::default() }).await;

    let mut input = simple_sale(Some(pat), p, 1000_00, 1, "2026-03-10");
    input.payer_id = Some(payer);
    input.coverage_pct = Some(8000);
    let id = create_sale_tx(&mut tx, input).await.unwrap();
    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 200_00);

    let claim: i64 = sqlx::query_scalar("SELECT id FROM claims WHERE sale_id=?1")
        .bind(id).fetch_one(&mut *tx).await.unwrap();
    set_claim_status_tx(&mut tx, claim, "rejected".into(), None).await.unwrap();

    assert_eq!(
        money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await,
        1000_00,
        "the whole amount returns to the patient"
    );
}
