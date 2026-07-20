//! `create_sale_tx`: totals, discounts, tax, stock, and the COGS snapshot.

use super::support::*;
use super::*;

#[tokio::test]
async fn computes_subtotal_total_and_deducts_stock() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 10, ..Default::default() }).await;

    let id = create_sale_tx(&mut tx, simple_sale(None, p, 900_00, 3, "2026-03-10"))
        .await
        .unwrap();

    assert_eq!(money(&mut tx, "SELECT subtotal FROM sales WHERE id=?1", id).await, 2700_00);
    assert_eq!(money(&mut tx, "SELECT total FROM sales WHERE id=?1", id).await, 2700_00);
    assert_eq!(stock_of(&mut tx, p).await, 7);
    assert_eq!(sale_status(&mut tx, id).await, "unpaid");
}

/// A percent discount is basis points and truncates (`subtotal * bp / 10000`).
/// This is the Rust side of the JS/Rust parity pair — `src/lib/sale-math.ts`
/// asserts the same table.
#[tokio::test]
async fn percent_discount_truncates_like_the_client() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 100, ..Default::default() }).await;

    // 1333 centimes @ 15% -> 199.95 centimes -> truncated to 199.
    let mut input = simple_sale(None, p, 1333, 1, "2026-03-10");
    input.discount_type = "percent".into();
    input.discount_value = 1500;
    let id = create_sale_tx(&mut tx, input).await.unwrap();

    assert_eq!(money(&mut tx, "SELECT total FROM sales WHERE id=?1", id).await, 1333 - 199);
}

/// The same product split across two lines must not each pass a full-stock
/// check — quantities are aggregated before validation.
#[tokio::test]
async fn rejects_oversell_split_across_lines() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 5, ..Default::default() }).await;

    let mut input = simple_sale(None, p, 100_00, 3, "2026-03-10");
    input.items.push(SaleItemInput {
        product_id: Some(p),
        variant_id: None,
        description: "Line 2".into(),
        unit_price: 100_00,
        quantity: 3,
        item_discount: 0,
    });

    let err = create_sale_tx(&mut tx, input).await.unwrap_err();
    assert!(err.contains("Not enough stock"), "got: {err}");
    assert_eq!(stock_of(&mut tx, p).await, 5, "stock must be untouched");
}

/// COGS is snapshotted at sale time so a later delivery that overwrites
/// `purchase_price` cannot retroactively change historical margin.
#[tokio::test]
async fn snapshots_unit_cost_so_later_deliveries_do_not_rewrite_margin() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let p = mk_product(
        &mut tx,
        ProductSpec { purchase_price: 300_00, quantity: 10, ..Default::default() },
    )
    .await;
    let id = create_sale_tx(&mut tx, simple_sale(None, p, 900_00, 2, "2026-03-10"))
        .await
        .unwrap();

    record_stock_change_tx(
        &mut tx,
        StockChangeInput {
            product_id: Some(p),
            variant_id: None,
            movement_type: "delivery".into(),
            quantity_change: 5,
            purchase_price: Some(500_00),
            note: None,
            supplier_id: None,
            debt_amount: None,
        },
    )
    .await
    .unwrap();

    let cogs = int(
        &mut tx,
        "SELECT SUM(unit_cost * quantity) FROM sale_items WHERE sale_id=?1",
        id,
    )
    .await;
    assert_eq!(cogs, 600_00, "COGS must use the cost at the time of sale");
}

/// TVA is extracted from the TTC total, not added on top.
#[tokio::test]
async fn extracts_tva_from_the_ttc_total() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "tva_rate", "1900").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 10, ..Default::default() }).await;

    let id = create_sale_tx(&mut tx, simple_sale(None, p, 1190_00, 1, "2026-03-10"))
        .await
        .unwrap();

    let total = money(&mut tx, "SELECT total FROM sales WHERE id=?1", id).await;
    let tax: i64 = sqlx::query_scalar("SELECT tax_amount FROM sales WHERE id=?1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(total, 1190_00, "total stays TTC");
    // 119000 - floor(119000 * 10000 / 11900) = 119000 - 100000
    assert_eq!(tax, 190_00);
}

/// Invoice numbers are gap-free: the fiscal sequence must not skip.
#[tokio::test]
async fn allocates_gap_free_invoice_numbers() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    set_setting(&mut tx, "invoice_prefix", "F").await;
    set_setting(&mut tx, "invoice_padding", "4").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 10, ..Default::default() }).await;

    let a = create_sale_tx(&mut tx, simple_sale(None, p, 100_00, 1, "2026-03-10")).await.unwrap();
    let b = create_sale_tx(&mut tx, simple_sale(None, p, 100_00, 1, "2026-03-10")).await.unwrap();

    let na: String = sqlx::query_scalar("SELECT invoice_number FROM sales WHERE id=?1")
        .bind(a).fetch_one(&mut *tx).await.unwrap();
    let nb: String = sqlx::query_scalar("SELECT invoice_number FROM sales WHERE id=?1")
        .bind(b).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(na, "F0001");
    assert_eq!(nb, "F0002");
}

/// An insurer-covered sale leaves only the patient's share in `balance`.
#[tokio::test]
async fn insurer_coverage_reduces_patient_balance_and_opens_a_claim() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let pat = mk_patient(&mut tx, "Amina").await;
    let payer = mk_payer(&mut tx, "CNAS").await;
    let p = mk_product(&mut tx, ProductSpec { quantity: 10, ..Default::default() }).await;

    let mut input = simple_sale(Some(pat), p, 1000_00, 1, "2026-03-10");
    input.payer_id = Some(payer);
    input.coverage_pct = Some(8000); // 80%
    let id = create_sale_tx(&mut tx, input).await.unwrap();

    assert_eq!(money(&mut tx, "SELECT balance FROM sales WHERE id=?1", id).await, 200_00);
    let covered: i64 = sqlx::query_scalar("SELECT covered_amount FROM claims WHERE sale_id=?1")
        .bind(id).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(covered, 800_00);
}

#[tokio::test]
async fn rejects_an_empty_sale() {
    let pool = test_pool().await;
    let mut tx = begin(&pool).await;
    let mut input = simple_sale(None, 1, 100, 1, "2026-03-10");
    input.items.clear();
    assert_eq!(
        create_sale_tx(&mut tx, input).await.unwrap_err(),
        "A sale needs at least one item"
    );
}
