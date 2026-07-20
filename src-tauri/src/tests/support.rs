//! Test fixtures.
//!
//! Two rules make these tests trustworthy:
//!
//! 1. Anything that moves money or stock goes through the **real** `*_tx`
//!    function, never a hand-written INSERT. A fixture that reimplements
//!    `create_sale` would test the fixture, not the app.
//! 2. Every timestamp is **mandatory and explicit**. The commands take their
//!    timestamps from column defaults (`datetime('now')`), so fixtures
//!    post-stamp the row afterwards. Making the argument required means
//!    wall-clock time can never leak into an assertion.

use super::*;

/// A UTC timestamp, exactly as the schema stores it: `YYYY-MM-DD HH:MM:SS`.
///
/// Reports bucket these by *local* day, so a value like `2026-01-31 23:30:00`
/// UTC is deliberately 2026-02-01 in Algiers — that asymmetry is what the
/// date-boundary tests exist to pin.
#[derive(Clone, Copy, Debug)]
pub struct At(pub &'static str);

pub struct ProductSpec {
    pub name: &'static str,
    pub category: &'static str,
    pub purchase_price: i64,
    pub selling_price: i64,
    pub quantity: i64,
    pub min_stock: i64,
    pub item_type: &'static str,
}

impl Default for ProductSpec {
    fn default() -> Self {
        Self {
            name: "Frame",
            category: "frame",
            purchase_price: 300_00,
            selling_price: 900_00,
            quantity: 100,
            min_stock: 2,
            item_type: "product",
        }
    }
}

pub async fn mk_product(tx: &mut Transaction<'_, Sqlite>, spec: ProductSpec) -> i64 {
    sqlx::query(
        "INSERT INTO products (category, name, purchase_price, selling_price, quantity, min_stock, item_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(spec.category)
    .bind(spec.name)
    .bind(spec.purchase_price as f64)
    .bind(spec.selling_price as f64)
    .bind(spec.quantity)
    .bind(spec.min_stock)
    .bind(spec.item_type)
    .execute(&mut **tx)
    .await
    .unwrap()
    .last_insert_rowid()
}

pub async fn mk_variant(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    quantity: i64,
    purchase_price: Option<i64>,
    selling_price: Option<i64>,
) -> i64 {
    sqlx::query(
        "INSERT INTO product_variants (product_id, label, quantity, min_stock, purchase_price, selling_price)
         VALUES (?1, 'v', ?2, 1, ?3, ?4)",
    )
    .bind(product_id)
    .bind(quantity)
    .bind(purchase_price)
    .bind(selling_price)
    .execute(&mut **tx)
    .await
    .unwrap()
    .last_insert_rowid()
}

pub async fn mk_patient(tx: &mut Transaction<'_, Sqlite>, name: &str) -> i64 {
    sqlx::query("INSERT INTO patients (full_name) VALUES (?1)")
        .bind(name)
        .execute(&mut **tx)
        .await
        .unwrap()
        .last_insert_rowid()
}

pub async fn mk_payer(tx: &mut Transaction<'_, Sqlite>, name: &str) -> i64 {
    sqlx::query("INSERT INTO payers (name) VALUES (?1)")
        .bind(name)
        .execute(&mut **tx)
        .await
        .unwrap()
        .last_insert_rowid()
}

pub async fn set_setting(tx: &mut Transaction<'_, Sqlite>, key: &str, value: &str) {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(&mut **tx)
    .await
    .unwrap();
}

/// A single-line sale of `qty` × `unit_price`, with no discount.
pub fn simple_sale(
    patient_id: Option<i64>,
    product_id: i64,
    unit_price: i64,
    qty: i64,
    sale_date: &str,
) -> CreateSaleInput {
    CreateSaleInput {
        patient_id,
        prescription_id: None,
        sale_date: sale_date.to_string(),
        discount_type: "amount".into(),
        discount_value: 0,
        notes: None,
        items: vec![SaleItemInput {
            product_id: Some(product_id),
            variant_id: None,
            description: "Line".into(),
            unit_price,
            quantity: qty,
            item_discount: 0,
        }],
        initial_payment: None,
        payment_method: None,
        payer_id: None,
        coverage_pct: None,
    }
}

/// Records a payment through the real command, then pins `paid_at`.
pub async fn do_payment(
    tx: &mut Transaction<'_, Sqlite>,
    sale_id: i64,
    amount: i64,
    method: &str,
    at: At,
) -> Result<(), String> {
    record_payment_tx(tx, sale_id, amount, Some(method.into()), None).await?;
    sqlx::query(
        "UPDATE payments SET paid_at = ?1
          WHERE id = (SELECT MAX(id) FROM payments WHERE sale_id = ?2)",
    )
    .bind(at.0)
    .bind(sale_id)
    .execute(&mut **tx)
    .await
    .unwrap();
    Ok(())
}

/// Processes a return through the real command, then pins `created_at`.
pub async fn do_return(
    tx: &mut Transaction<'_, Sqlite>,
    sale_id: i64,
    method: &str,
    items: Vec<ReturnItemInput>,
    at: At,
) -> Result<i64, String> {
    let cn_id = create_return_tx(
        tx,
        CreateReturnInput {
            sale_id,
            method: method.into(),
            notes: None,
            items,
        },
    )
    .await?;
    sqlx::query("UPDATE credit_notes SET created_at = ?1 WHERE id = ?2")
        .bind(at.0)
        .bind(cn_id)
        .execute(&mut **tx)
        .await
        .unwrap();
    Ok(cn_id)
}

/// Reads a **REAL-affinity** money column (integer centimes stored as f64).
/// Use [`int`] for the newer columns that are declared `INTEGER`
/// (`tax_amount`, `timbre_amount`, `unit_cost`, `credit_notes.total`).
pub async fn money(tx: &mut Transaction<'_, Sqlite>, sql: &str, id: i64) -> i64 {
    let v: f64 = sqlx::query_scalar(sql).bind(id).fetch_one(&mut **tx).await.unwrap();
    v.round() as i64
}

/// Reads an `INTEGER`-declared column.
pub async fn int(tx: &mut Transaction<'_, Sqlite>, sql: &str, id: i64) -> i64 {
    sqlx::query_scalar(sql).bind(id).fetch_one(&mut **tx).await.unwrap()
}

pub async fn sale_status(tx: &mut Transaction<'_, Sqlite>, sale_id: i64) -> String {
    sqlx::query_scalar("SELECT status FROM sales WHERE id = ?1")
        .bind(sale_id)
        .fetch_one(&mut **tx)
        .await
        .unwrap()
}

pub async fn stock_of(tx: &mut Transaction<'_, Sqlite>, product_id: i64) -> i64 {
    sqlx::query_scalar("SELECT quantity FROM products WHERE id = ?1")
        .bind(product_id)
        .fetch_one(&mut **tx)
        .await
        .unwrap()
}
