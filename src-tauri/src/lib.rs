use std::collections::HashMap;

use serde::Deserialize;
use specta::Type;
use sqlx::{Row, Sqlite, SqlitePool, Transaction};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};
use tauri_specta::{collect_commands, Builder};

/// Connection-string key the frontend uses (`Database.load("sqlite:app.db")`) and
/// the key tauri-plugin-sql stores its pool under.
const DB_KEY: &str = "sqlite:app.db";

/// Borrows the SQLite pool that tauri-plugin-sql already opened, so our atomic
/// commands write to the exact same database file — no second pool, no path
/// mismatch (the class of bug recorded in identifier-problem.md).
async fn db_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<DbInstances>();
    let map = instances.0.read().await;
    match map.get(DB_KEY) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("database is not initialised yet".into()),
    }
}

// All money values are integer **centimes**. `discount_value` is centimes for an
// amount discount and basis points for a percent discount (1500 = 15.00%).
#[derive(Debug, Deserialize, Type)]
pub struct SaleItemInput {
    pub product_id: Option<i64>,
    /// When set, stock is tracked on this product variant instead of the product.
    pub variant_id: Option<i64>,
    pub description: String,
    pub unit_price: i64,
    pub quantity: i64,
    pub item_discount: i64,
}

#[derive(Debug, Deserialize, Type)]
pub struct CreateSaleInput {
    /// `None` for a walk-in / quick sale with no registered customer.
    pub patient_id: Option<i64>,
    pub prescription_id: Option<i64>,
    pub sale_date: String,
    pub discount_type: String,
    pub discount_value: i64,
    pub notes: Option<String>,
    pub items: Vec<SaleItemInput>,
    pub initial_payment: Option<i64>,
    pub payment_method: Option<String>,
    // Optional third-party payer: insurer covers `coverage_pct` (basis points) of the
    // goods total; the rest is the patient's balance, the covered part becomes a claim.
    pub payer_id: Option<i64>,
    pub coverage_pct: Option<i64>,
}

fn line_total(it: &SaleItemInput) -> i64 {
    (it.unit_price * it.quantity - it.item_discount).max(0)
}

fn status_for(total: i64, paid: i64) -> &'static str {
    if paid <= 0 {
        "unpaid"
    } else if paid >= total {
        "paid"
    } else {
        "partial"
    }
}

/// Droit de timbre due on a cash sale's TTC `total`, from the configured rate/min/max.
/// Kept in one place so create_sale and sync_sale_balance agree. 0 if no total/rate.
async fn compute_timbre(tx: &mut Transaction<'_, Sqlite>, total: i64) -> Result<i64, String> {
    if total <= 0 {
        return Ok(0);
    }
    let rate = setting_i64(tx, "timbre_rate", 0).await?;
    if rate <= 0 {
        return Ok(0);
    }
    let tmin = setting_i64(tx, "timbre_min", 0).await?;
    let tmax = setting_i64(tx, "timbre_max", 0).await?;
    let mut t = ((total as i128 * rate as i128) / 10_000) as i64;
    if t < tmin {
        t = tmin;
    }
    if tmax > 0 && t > tmax {
        t = tmax;
    }
    Ok(t)
}

/// Recomputes timbre/amount_paid/balance/status for a sale — the single place that
/// reconciles a sale's money. Void sales are frozen (left untouched). Droit de timbre
/// is (re)applied only when a cash payment exists against the sale; a 'balance' credit
/// note (a return applied to the invoice rather than refunded) reduces what is owed.
/// Money columns are REAL-affinity integer centimes stored as f64.
async fn sync_sale_balance(tx: &mut Transaction<'_, Sqlite>, sale_id: i64) -> Result<(), String> {
    let row = sqlx::query("SELECT total, status FROM sales WHERE id = ?1")
        .bind(sale_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(());
    };
    let status: String = row.try_get("status").map_err(|e| e.to_string())?;
    if status == "void" {
        return Ok(()); // a voided invoice is immutable
    }
    let total = row.try_get::<f64, _>("total").map_err(|e| e.to_string())?.round() as i64;

    // Timbre applies once the sale has been (partly) settled in cash.
    let has_cash: bool = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM payments WHERE sale_id = ?1 AND lower(method) = 'cash') AS x",
    )
    .bind(sale_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("x")
    .map_err(|e| e.to_string())?
        != 0;
    let timbre = if has_cash { compute_timbre(tx, total).await? } else { 0 };

    let covered: i64 = sqlx::query(
        "SELECT COALESCE((SELECT covered_amount FROM claims WHERE sale_id = ?1), 0) AS c",
    )
    .bind(sale_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("c")
    .map_err(|e| e.to_string())?;

    let balance_credit = sqlx::query(
        "SELECT COALESCE(SUM(total), 0) AS c FROM credit_notes WHERE sale_id = ?1 AND method = 'balance'",
    )
    .bind(sale_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("c")
    .map_err(|e| e.to_string())?;

    let paid = sqlx::query("SELECT COALESCE(SUM(amount), 0.0) AS p FROM payments WHERE sale_id = ?1")
        .bind(sale_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get::<f64, _>("p")
        .map_err(|e| e.to_string())?
        .round() as i64;

    let due = (total + timbre - covered - balance_credit).max(0);
    let balance = (due - paid).max(0);
    let new_status = if due <= 0 { "paid" } else { status_for(due, paid) };
    sqlx::query(
        "UPDATE sales SET timbre_amount = ?1, amount_paid = ?2, balance = ?3, status = ?4 WHERE id = ?5",
    )
    .bind(timbre)
    .bind(paid)
    .bind(balance)
    .bind(new_status)
    .bind(sale_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reads an integer setting (stored as text) within a transaction, or `default`.
async fn setting_i64(tx: &mut Transaction<'_, Sqlite>, key: &str, default: i64) -> Result<i64, String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?1")
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .and_then(|r| r.try_get::<Option<String>, _>("value").ok().flatten())
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(default))
}

/// Reads a text setting within a transaction, or `default`.
async fn setting_str(
    tx: &mut Transaction<'_, Sqlite>,
    key: &str,
    default: &str,
) -> Result<String, String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?1")
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row
        .and_then(|r| r.try_get::<Option<String>, _>("value").ok().flatten())
        .unwrap_or_else(|| default.to_string()))
}

/// Creates a sale, its line items, stock movements and an optional initial payment
/// in a single transaction. Totals are recomputed server-side (the client cannot
/// tamper with them) and stock availability is validated before anything is written.
#[tauri::command]
#[specta::specta]
async fn create_sale(app: AppHandle, input: CreateSaleInput) -> Result<i64, String> {
    if input.items.is_empty() {
        return Err("A sale needs at least one item".into());
    }
    let pool = db_pool(&app).await?;
    // BEGIN IMMEDIATE (here and in every write command) takes the write slot up
    // front, so under WAL a contended writer waits on the busy timeout instead of
    // failing its later read→write lock upgrade with an unretried SQLITE_BUSY.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    // Validate every line up front (the Rust command is the real authority; the UI
    // floor in pos-totals.ts is only a convenience). Rejects negative-quantity lines
    // that would otherwise *increase* stock and reduce revenue.
    for it in &input.items {
        if it.quantity < 1 {
            return Err("Each line must have a quantity of at least 1".into());
        }
        if it.unit_price < 0 {
            return Err("Unit price cannot be negative".into());
        }
        if it.item_discount < 0 || it.item_discount > it.unit_price * it.quantity {
            return Err("Line discount is out of range".into());
        }
    }

    let subtotal: i64 = input.items.iter().map(line_total).sum();
    let discount = if input.discount_type == "percent" {
        ((subtotal as i128 * input.discount_value as i128) / 10_000) as i64
    } else {
        input.discount_value
    };
    let total = (subtotal - discount).max(0);

    // TVA is extracted from the tax-inclusive (TTC) total. Droit de timbre is applied
    // by sync_sale_balance once a cash payment exists; here we only compute a
    // provisional value to cap the optional initial payment.
    let tax_rate = setting_i64(&mut tx, "tva_rate", 0).await?;
    let tax_amount = if tax_rate > 0 && total > 0 {
        let net_ht = ((total as i128 * 10_000) / (10_000 + tax_rate as i128)) as i64;
        total - net_ht
    } else {
        0
    };
    let provisional_timbre = if input.payment_method.as_deref() == Some("cash") {
        compute_timbre(&mut tx, total).await?
    } else {
        0
    };

    // Insurer-covered portion (of goods only) becomes a separate receivable; the
    // patient owes the rest plus any timbre.
    let covered = match input.payer_id {
        Some(_) => {
            let pct = input.coverage_pct.unwrap_or(0).max(0);
            (((total as i128 * pct as i128) / 10_000) as i64).clamp(0, total)
        }
        None => 0,
    };
    let patient_due = (total - covered + provisional_timbre).max(0);
    // Clamp the initial payment so a sale is never created already overpaid.
    let cash_paid = input.initial_payment.unwrap_or(0).clamp(0, patient_due);

    // Allocate a continuous, gap-free invoice number from the running counter.
    let next = setting_i64(&mut tx, "invoice_next", 1).await?;
    let prefix = setting_str(&mut tx, "invoice_prefix", "").await?;
    let padding = setting_i64(&mut tx, "invoice_padding", 6).await?.max(1) as usize;
    let invoice_number = format!("{}{:0>width$}", prefix, next, width = padding);
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('invoice_next', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind((next + 1).to_string())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Aggregate required quantities per product/variant before validating, so the same
    // item split across two lines can't each pass a full-availability check (B2). An
    // early return drops `tx`, which rolls back automatically. Services carry no stock
    // and are recorded so the deduction loop skips them too.
    let mut service_ids: Vec<i64> = Vec::new();
    let mut need_variant: HashMap<i64, i64> = HashMap::new();
    let mut need_product: HashMap<i64, i64> = HashMap::new();
    for it in &input.items {
        if let Some(vid) = it.variant_id {
            *need_variant.entry(vid).or_default() += it.quantity;
            continue;
        }
        if let Some(pid) = it.product_id {
            if service_ids.contains(&pid) {
                continue;
            }
            let item_type: Option<String> = sqlx::query("SELECT item_type FROM products WHERE id = ?1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .map(|r| r.try_get::<String, _>("item_type").unwrap_or_default());
            let Some(item_type) = item_type else {
                return Err(format!("Product #{pid} no longer exists"));
            };
            if item_type == "service" {
                service_ids.push(pid);
                continue;
            }
            *need_product.entry(pid).or_default() += it.quantity;
        }
    }
    for (vid, need) in &need_variant {
        let row = sqlx::query("SELECT quantity FROM product_variants WHERE id = ?1")
            .bind(vid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        let Some(row) = row else {
            return Err(format!("Variant #{vid} no longer exists"));
        };
        let available: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
        if *need > available {
            return Err(format!("Not enough stock for variant: need {need}, have {available}"));
        }
    }
    for (pid, need) in &need_product {
        let row = sqlx::query("SELECT quantity, name FROM products WHERE id = ?1")
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        let Some(row) = row else {
            return Err(format!("Product #{pid} no longer exists"));
        };
        let available: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
        if *need > available {
            let name: String = row.try_get("name").unwrap_or_default();
            return Err(format!("Not enough stock for {name}: need {need}, have {available}"));
        }
    }

    // Insert with placeholder money columns; sync_sale_balance (below) computes the
    // authoritative timbre/amount_paid/balance/status once items + payment are in.
    let sale_id: i64 = sqlx::query(
        "INSERT INTO sales (patient_id, prescription_id, sale_date, subtotal, discount_type,
            discount_value, total, tax_rate, tax_amount, timbre_amount, invoice_number,
            amount_paid, balance, status, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,0,0,'unpaid',?11)",
    )
    .bind(input.patient_id)
    .bind(input.prescription_id)
    .bind(&input.sale_date)
    .bind(subtotal)
    .bind(&input.discount_type)
    .bind(input.discount_value)
    .bind(total)
    .bind(tax_rate)
    .bind(tax_amount)
    .bind(&invoice_number)
    .bind(&input.notes)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    if let Some(payer_id) = input.payer_id {
        sqlx::query(
            "INSERT INTO claims (sale_id, payer_id, covered_amount, status)
             VALUES (?1, ?2, ?3, 'pending')",
        )
        .bind(sale_id)
        .bind(payer_id)
        .bind(covered)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Auto-open a lab job when the sale includes a lens (glasses to be made).
    let has_lens: bool = sqlx::query(
        "SELECT EXISTS(
            SELECT 1 FROM sale_items si JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ?1 AND p.category = 'lens'
         ) AS has_lens",
    )
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("has_lens")
    .map_err(|e| e.to_string())?
        != 0;
    if has_lens {
        sqlx::query(
            "INSERT INTO jobs (sale_id, patient_id, prescription_id, status)
             VALUES (?1, ?2, ?3, 'ordered')",
        )
        .bind(sale_id)
        .bind(input.patient_id)
        .bind(input.prescription_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    for it in &input.items {
        // Snapshot unit cost (COGS) at sale time so margin reports stay correct even
        // after a later delivery overwrites the product/variant purchase price (C4).
        let unit_cost: i64 = if let Some(vid) = it.variant_id {
            sqlx::query(
                "SELECT COALESCE(v.purchase_price, p.purchase_price, 0) AS c
                 FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?1",
            )
            .bind(vid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .and_then(|r| r.try_get::<f64, _>("c").ok())
            .map(|c| c.round() as i64)
            .unwrap_or(0)
        } else if let Some(pid) = it.product_id {
            sqlx::query("SELECT purchase_price AS c FROM products WHERE id = ?1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .and_then(|r| r.try_get::<f64, _>("c").ok())
                .map(|c| c.round() as i64)
                .unwrap_or(0)
        } else {
            0
        };
        sqlx::query(
            "INSERT INTO sale_items
                (sale_id, product_id, variant_id, description, unit_price, quantity, item_discount, line_total, unit_cost)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        )
        .bind(sale_id)
        .bind(it.product_id)
        .bind(it.variant_id)
        .bind(&it.description)
        .bind(it.unit_price)
        .bind(it.quantity)
        .bind(it.item_discount)
        .bind(line_total(it))
        .bind(unit_cost)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(vid) = it.variant_id {
            // Variant-tracked: deduct from the variant and log the movement against it.
            sqlx::query(
                "UPDATE product_variants SET quantity = quantity - ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(it.quantity)
            .bind(vid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note)
                 VALUES (?1, ?2, 'sale', ?3, ?4)",
            )
            .bind(it.product_id)
            .bind(vid)
            .bind(-it.quantity)
            .bind(format!("Sale #{sale_id}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else if let Some(pid) = it.product_id {
            // Services have no stock; skip deduction and movement logging for them.
            if !service_ids.contains(&pid) {
                sqlx::query(
                    "UPDATE products SET quantity = quantity - ?1, updated_at = datetime('now') WHERE id = ?2",
                )
                .bind(it.quantity)
                .bind(pid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
                sqlx::query(
                    "INSERT INTO stock_movements (product_id, type, quantity_change, note)
                     VALUES (?1, 'sale', ?2, ?3)",
                )
                .bind(pid)
                .bind(-it.quantity)
                .bind(format!("Sale #{sale_id}"))
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    if cash_paid > 0 {
        sqlx::query(
            "INSERT INTO payments (sale_id, amount, method, note)
             VALUES (?1, ?2, ?3, 'Initial payment')",
        )
        .bind(sale_id)
        .bind(cash_paid)
        .bind(&input.payment_method)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    // Reconcile timbre/amount_paid/balance/status from what was just written.
    sync_sale_balance(&mut tx, sale_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(sale_id)
}

/// Records a payment against a sale and re-syncs its balance/status atomically.
#[tauri::command]
#[specta::specta]
async fn record_payment(
    app: AppHandle,
    sale_id: i64,
    amount: i64,
    method: Option<String>,
    note: Option<String>,
) -> Result<(), String> {
    if amount <= 0 {
        return Err("Payment amount must be greater than 0".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    // Reject overpayment (B4). The ceiling is the most the patient could owe — goods
    // plus the full possible timbre, minus insurer coverage and any balance credits.
    let row = sqlx::query("SELECT total, status FROM sales WHERE id = ?1")
        .bind(sale_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Sale not found")?;
    let status: String = row.try_get("status").map_err(|e| e.to_string())?;
    if status == "void" {
        return Err("This sale has been voided".into());
    }
    let total = row.try_get::<f64, _>("total").map_err(|e| e.to_string())?.round() as i64;
    let max_timbre = compute_timbre(&mut tx, total).await?;
    let covered: i64 = sqlx::query(
        "SELECT COALESCE((SELECT covered_amount FROM claims WHERE sale_id = ?1), 0) AS c",
    )
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("c")
    .map_err(|e| e.to_string())?;
    let balance_credit: i64 = sqlx::query(
        "SELECT COALESCE(SUM(total), 0) AS c FROM credit_notes WHERE sale_id = ?1 AND method = 'balance'",
    )
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .try_get::<i64, _>("c")
    .map_err(|e| e.to_string())?;
    let already = sqlx::query("SELECT COALESCE(SUM(amount), 0.0) AS p FROM payments WHERE sale_id = ?1")
        .bind(sale_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get::<f64, _>("p")
        .map_err(|e| e.to_string())?
        .round() as i64;
    let max_due = (total + max_timbre - covered - balance_credit).max(0);
    if already + amount > max_due {
        let remaining = (max_due - already).max(0);
        return Err(format!(
            "Payment exceeds the amount owed ({remaining} centimes remaining)"
        ));
    }

    sqlx::query("INSERT INTO payments (sale_id, amount, method, note) VALUES (?1, ?2, ?3, ?4)")
        .bind(sale_id)
        .bind(amount)
        .bind(&method)
        .bind(&note)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sync_sale_balance(&mut tx, sale_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Deletes a payment and re-syncs the sale's balance/status atomically.
#[tauri::command]
#[specta::specta]
async fn delete_payment(app: AppHandle, payment_id: i64, sale_id: i64) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM payments WHERE id = ?1")
        .bind(payment_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sync_sale_balance(&mut tx, sale_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Voids a sale: a fiscally-issued invoice is never deleted (that would break the
/// gap-free TVA sequence). Instead it is marked `status = 'void'` — the row and its
/// invoice number are retained for audit — while stock is restored, any insurer claim
/// is cancelled, and the patient owes nothing. Rejected if the sale already has a
/// credit note (process/undo the return first) or is already void. Recorded payments
/// are left in place as a historical record; refunding them is a separate cash action.
#[tauri::command]
#[specta::specta]
async fn void_sale(app: AppHandle, sale_id: i64, reason: Option<String>) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    let status: String = sqlx::query("SELECT status FROM sales WHERE id = ?1")
        .bind(sale_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Sale not found")?
        .try_get("status")
        .map_err(|e| e.to_string())?;
    if status == "void" {
        return Err("This sale is already void".into());
    }
    let cn_count: i64 = sqlx::query("SELECT COUNT(*) AS c FROM credit_notes WHERE sale_id = ?1")
        .bind(sale_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get("c")
        .map_err(|e| e.to_string())?;
    if cn_count > 0 {
        return Err("This sale has returns — undo or refund those before voiding".into());
    }

    // Restore stock for each line (logging reversing adjustment movements).
    let items =
        sqlx::query("SELECT product_id, variant_id, quantity FROM sale_items WHERE sale_id = ?1")
            .bind(sale_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    for row in &items {
        let pid: Option<i64> = row.try_get("product_id").map_err(|e| e.to_string())?;
        let vid: Option<i64> = row.try_get("variant_id").map_err(|e| e.to_string())?;
        let qty: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
        if let Some(vid) = vid {
            sqlx::query(
                "UPDATE product_variants SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(qty)
            .bind(vid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note)
                 VALUES (?1, ?2, 'adjustment', ?3, ?4)",
            )
            .bind(pid)
            .bind(vid)
            .bind(qty)
            .bind(format!("Voided sale #{sale_id}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else if let Some(pid) = pid {
            sqlx::query(
                "UPDATE products SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(qty)
            .bind(pid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, type, quantity_change, note)
                 VALUES (?1, 'adjustment', ?2, ?3)",
            )
            .bind(pid)
            .bind(qty)
            .bind(format!("Voided sale #{sale_id}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Cancel any insurer claim — a voided invoice is no longer claimable.
    sqlx::query(
        "UPDATE claims SET covered_amount = 0, status = 'rejected' WHERE sale_id = ?1",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Annotate any linked lab job so it isn't silently orphaned.
    sqlx::query(
        "UPDATE jobs SET notes = TRIM(COALESCE(notes, '') || ' [Sale voided]'), updated_at = datetime('now')
         WHERE sale_id = ?1",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE sales SET status = 'void', voided_at = datetime('now'), void_reason = ?1, balance = 0 WHERE id = ?2",
    )
    .bind(&reason)
    .bind(sale_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
pub struct ReturnItemInput {
    pub sale_item_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Deserialize, Type)]
pub struct CreateReturnInput {
    pub sale_id: i64,
    /// 'refund' = cash back to the customer; 'balance' = credit the sale's outstanding balance.
    pub method: String,
    pub notes: Option<String>,
    pub items: Vec<ReturnItemInput>,
}

/// Processes a return as a numbered credit note (avoir): validates returnable quantities,
/// restocks the goods, and credits the customer the **net amount actually borne** for the
/// returned lines — i.e. their share after the global discount and insurer coverage
/// (`line_total × (total − covered) / subtotal`), not the raw line price. A 'refund' is
/// capped at what the customer has paid (use 'balance' for the unpaid portion); a 'balance'
/// credit reduces the sale's outstanding balance via sync_sale_balance. The original
/// invoice is left intact. Insurer-claim reconciliation for returned goods is handled
/// separately on the claims screen. Returns the new credit-note id.
#[tauri::command]
#[specta::specta]
async fn create_return(app: AppHandle, input: CreateReturnInput) -> Result<i64, String> {
    if input.items.is_empty() {
        return Err("Select at least one item to return".into());
    }
    if input.method != "refund" && input.method != "balance" {
        return Err("Invalid return method".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    // Load the sale's net basis: a walk-in has a NULL patient; a void sale can't be returned.
    let sale = sqlx::query(
        "SELECT patient_id, status, subtotal, total, amount_paid,
                COALESCE((SELECT covered_amount FROM claims WHERE sale_id = sales.id), 0) AS covered
         FROM sales WHERE id = ?1",
    )
    .bind(input.sale_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Sale not found")?;
    let patient_id: Option<i64> = sale.try_get("patient_id").map_err(|e| e.to_string())?;
    let sale_status: String = sale.try_get("status").map_err(|e| e.to_string())?;
    if sale_status == "void" {
        return Err("This sale has been voided".into());
    }
    let sale_subtotal = sale.try_get::<f64, _>("subtotal").map_err(|e| e.to_string())?.round() as i64;
    let sale_total = sale.try_get::<f64, _>("total").map_err(|e| e.to_string())?.round() as i64;
    let amount_paid = sale.try_get::<f64, _>("amount_paid").map_err(|e| e.to_string())?.round() as i64;
    let covered: i64 = sale.try_get("covered").map_err(|e| e.to_string())?;
    // Net the patient bears across all goods, as a fraction of subtotal: (total − covered)/subtotal.
    let net_basis = (sale_total - covered).max(0);

    // (sale_item_id, product_id, description, qty, value)
    let mut collected: Vec<(i64, Option<i64>, String, i64, i64)> = Vec::new();
    let mut total: i64 = 0;
    for ri in &input.items {
        if ri.quantity <= 0 {
            continue;
        }
        let row = sqlx::query(
            "SELECT product_id, variant_id, description, quantity, line_total
             FROM sale_items WHERE id = ?1 AND sale_id = ?2",
        )
        .bind(ri.sale_item_id)
        .bind(input.sale_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        let Some(row) = row else {
            return Err(format!("Line {} is not part of this sale", ri.sale_item_id));
        };
        let product_id: Option<i64> = row.try_get("product_id").map_err(|e| e.to_string())?;
        let variant_id: Option<i64> = row.try_get("variant_id").map_err(|e| e.to_string())?;
        let description: String = row.try_get("description").map_err(|e| e.to_string())?;
        let orig_qty: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
        let line_total =
            row.try_get::<f64, _>("line_total").map_err(|e| e.to_string())?.round() as i64;

        let already: i64 = sqlx::query(
            "SELECT COALESCE(SUM(quantity), 0) AS q FROM credit_note_items WHERE sale_item_id = ?1",
        )
        .bind(ri.sale_item_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get::<i64, _>("q")
        .map_err(|e| e.to_string())?;

        if ri.quantity > orig_qty - already {
            return Err(format!(
                "Cannot return {} of \"{description}\": only {} remaining",
                ri.quantity,
                orig_qty - already
            ));
        }

        // Net value the customer is owed for this whole line, then split per unit. Falls
        // back to the raw line value if the sale carried no subtotal (all free-text lines).
        let line_net = if sale_subtotal > 0 {
            ((line_total as i128 * net_basis as i128) / sale_subtotal as i128) as i64
        } else {
            line_total
        };
        let per_unit = if orig_qty > 0 { line_net / orig_qty } else { 0 };
        let value = per_unit * ri.quantity;
        total += value;

        if let Some(vid) = variant_id {
            // Variant-tracked line restocks the variant.
            sqlx::query(
                "UPDATE product_variants SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(ri.quantity)
            .bind(vid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note)
                 VALUES (?1, ?2, 'adjustment', ?3, ?4)",
            )
            .bind(product_id)
            .bind(vid)
            .bind(ri.quantity)
            .bind(format!("Return — sale #{}", input.sale_id))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else if let Some(pid) = product_id {
            sqlx::query(
                "UPDATE products SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(ri.quantity)
            .bind(pid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, type, quantity_change, note)
                 VALUES (?1, 'adjustment', ?2, ?3)",
            )
            .bind(pid)
            .bind(ri.quantity)
            .bind(format!("Return — sale #{}", input.sale_id))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        collected.push((ri.sale_item_id, product_id, description, ri.quantity, value));
    }

    if collected.is_empty() {
        return Err("Nothing to return".into());
    }

    // A cash refund cannot exceed what the customer has actually paid (across this and
    // any prior cash refunds). Direct the unpaid remainder to a 'balance' credit instead.
    if input.method == "refund" {
        let prior_refunds: i64 = sqlx::query(
            "SELECT COALESCE(SUM(total), 0) AS r FROM credit_notes WHERE sale_id = ?1 AND method = 'refund'",
        )
        .bind(input.sale_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .try_get::<i64, _>("r")
        .map_err(|e| e.to_string())?;
        if prior_refunds + total > amount_paid {
            let refundable = (amount_paid - prior_refunds).max(0);
            return Err(format!(
                "Cash refund exceeds paid amount ({refundable} centimes refundable) — apply the rest to the balance instead"
            ));
        }
    }

    // Allocate a sequential avoir (credit-note) number, mirroring invoice numbering.
    let cn_next = setting_i64(&mut tx, "credit_note_next", 1).await?;
    let cn_prefix = setting_str(&mut tx, "credit_note_prefix", "A").await?;
    let cn_padding = setting_i64(&mut tx, "credit_note_padding", 6).await?.max(1) as usize;
    let cn_number = format!("{}{:0>width$}", cn_prefix, cn_next, width = cn_padding);
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('credit_note_next', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind((cn_next + 1).to_string())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let cn_id: i64 = sqlx::query(
        "INSERT INTO credit_notes (sale_id, patient_id, total, method, cn_number, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(input.sale_id)
    .bind(patient_id)
    .bind(total)
    .bind(&input.method)
    .bind(&cn_number)
    .bind(&input.notes)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    for (sale_item_id, product_id, description, qty, value) in &collected {
        sqlx::query(
            "INSERT INTO credit_note_items
                (credit_note_id, sale_item_id, product_id, description, quantity, line_total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(cn_id)
        .bind(sale_item_id)
        .bind(product_id)
        .bind(description)
        .bind(qty)
        .bind(value)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // A 'balance' credit reduces what the customer still owes on the invoice.
    if input.method == "balance" {
        sync_sale_balance(&mut tx, input.sale_id).await?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(cn_id)
}

/// Updates an insurance claim's status. The 'rejected' path re-bills the patient: the
/// previously-covered amount is zeroed and the sale's balance re-synced, so a rejected
/// claim no longer silently disappears from what the patient owes (audit finding E1).
#[tauri::command]
#[specta::specta]
async fn set_claim_status(
    app: AppHandle,
    claim_id: i64,
    status: String,
    claim_ref: Option<String>,
) -> Result<(), String> {
    const ALLOWED: [&str; 5] = ["pending", "submitted", "partial", "paid", "rejected"];
    if !ALLOWED.contains(&status.as_str()) {
        return Err("Invalid claim status".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    let sale_id: i64 = sqlx::query("SELECT sale_id FROM claims WHERE id = ?1")
        .bind(claim_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Claim not found")?
        .try_get("sale_id")
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE claims
           SET status = ?1,
               claim_ref = COALESCE(?2, claim_ref),
               submitted_at = CASE WHEN ?1 IN ('submitted','partial','paid') AND submitted_at IS NULL
                                   THEN datetime('now') ELSE submitted_at END,
               paid_at = CASE WHEN ?1 = 'paid' THEN datetime('now') ELSE paid_at END,
               covered_amount = CASE WHEN ?1 = 'rejected' THEN 0 ELSE covered_amount END
         WHERE id = ?3",
    )
    .bind(&status)
    .bind(&claim_ref)
    .bind(claim_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Rejection zeroes coverage → the patient is re-billed; re-sync the sale balance.
    if status == "rejected" {
        sync_sale_balance(&mut tx, sale_id).await?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Merges a duplicate patient into a surviving one: re-points all of the duplicate's
/// records (sales, prescriptions, jobs, appointments, credit notes, activity, held
/// carts, custom fields) onto `keep_id`, then deletes the now-empty duplicate. Custom
/// fields that would collide (same attribute on both) keep the survivor's value.
#[tauri::command]
#[specta::specta]
async fn merge_patients(app: AppHandle, keep_id: i64, dup_id: i64) -> Result<(), String> {
    if keep_id == dup_id {
        return Err("Cannot merge a patient into itself".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;

    for id in [keep_id, dup_id] {
        let exists = sqlx::query("SELECT 1 AS x FROM patients WHERE id = ?1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err(format!("Patient #{id} not found"));
        }
    }

    for sql in [
        "UPDATE sales SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE prescriptions SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE jobs SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE appointments SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE credit_notes SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE patient_activity SET patient_id = ?1 WHERE patient_id = ?2",
        "UPDATE held_sales SET customer_id = ?1 WHERE customer_id = ?2",
    ] {
        sqlx::query(sql)
            .bind(keep_id)
            .bind(dup_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Custom fields: drop the duplicate's values that collide with the survivor's
    // (UNIQUE(patient_id, attribute_id)), then move the rest across.
    sqlx::query(
        "DELETE FROM patient_attribute_values WHERE patient_id = ?2
         AND attribute_id IN (SELECT attribute_id FROM patient_attribute_values WHERE patient_id = ?1)",
    )
    .bind(keep_id)
    .bind(dup_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE patient_attribute_values SET patient_id = ?1 WHERE patient_id = ?2")
        .bind(keep_id)
        .bind(dup_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // The duplicate now has no references; remove it.
    sqlx::query("DELETE FROM patients WHERE id = ?1")
        .bind(dup_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Atomic stock change (delivery or adjustment) for a product or a variant.
/// Replaces the frontend BEGIN/COMMIT transactions in `src/db/stock.ts`, which
/// were unsafe on the shared pool (each statement lands on an arbitrary pooled
/// connection). The invariant: on-hand quantity never diverges from the
/// movement ledger, and a supplier debt is only booked with its delivery.
#[derive(Debug, Deserialize, Type)]
pub struct StockChangeInput {
    pub product_id: Option<i64>,
    /// When set, stock is tracked on this product variant instead of the product.
    pub variant_id: Option<i64>,
    /// "delivery" or "adjustment" — recorded verbatim in stock_movements.type.
    pub movement_type: String,
    pub quantity_change: i64,
    /// When set, becomes the product/variant's new purchase price (centimes).
    pub purchase_price: Option<i64>,
    pub note: Option<String>,
    pub supplier_id: Option<i64>,
    /// Total purchase cost (centimes) to book as a supplier debt.
    pub debt_amount: Option<i64>,
}

#[tauri::command]
#[specta::specta]
async fn record_stock_change(app: AppHandle, input: StockChangeInput) -> Result<(), String> {
    if !matches!(input.movement_type.as_str(), "delivery" | "adjustment") {
        return Err("movement_type must be 'delivery' or 'adjustment'".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;
    match input.variant_id {
        Some(variant_id) => {
            sqlx::query(
                "UPDATE product_variants SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(input.quantity_change)
            .bind(variant_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            if let Some(price) = input.purchase_price {
                sqlx::query("UPDATE product_variants SET purchase_price = ?1 WHERE id = ?2")
                    .bind(price)
                    .bind(variant_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        None => {
            let product_id = input
                .product_id
                .ok_or("product_id or variant_id is required")?;
            sqlx::query(
                "UPDATE products SET quantity = quantity + ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(input.quantity_change)
            .bind(product_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            if let Some(price) = input.purchase_price {
                sqlx::query("UPDATE products SET purchase_price = ?1 WHERE id = ?2")
                    .bind(price)
                    .bind(product_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    sqlx::query(
        "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(&input.movement_type)
    .bind(input.quantity_change)
    .bind(&input.note)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if let (Some(supplier_id), Some(debt)) = (input.supplier_id, input.debt_amount) {
        if debt > 0 {
            let what = match input.variant_id {
                Some(v) => format!("Delivery: variant #{v}"),
                None => format!(
                    "Delivery: product #{}",
                    input.product_id.unwrap_or_default()
                ),
            };
            sqlx::query(
                "INSERT INTO supplier_ledger (supplier_id, type, amount, note, ref) VALUES (?1, 'purchase', ?2, ?3, ?4)",
            )
            .bind(supplier_id)
            .bind(debt)
            .bind(&input.note)
            .bind(what)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Advances a job's status, stamps delivered_at at 'collected', and records the
/// stage change in job_events (per-stage history, H1) — atomically. Replaces the
/// frontend transaction in `src/db/jobs.ts`.
#[tauri::command]
#[specta::specta]
async fn update_job_status(
    app: AppHandle,
    job_id: i64,
    status: String,
    note: Option<String>,
) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;
    let updated = sqlx::query(
        "UPDATE jobs
            SET status = ?1,
                delivered_at = CASE WHEN ?1 = 'collected' THEN datetime('now') ELSE delivered_at END,
                updated_at = datetime('now')
          WHERE id = ?2",
    )
    .bind(&status)
    .bind(job_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if updated.rows_affected() == 0 {
        return Err("Job not found".into());
    }
    sqlx::query("INSERT INTO job_events (job_id, status, note) VALUES (?1, ?2, ?3)")
        .bind(job_id)
        .bind(&status)
        .bind(&note)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Merges colour `from_id` into `into_id`: re-points every product/variant FK and
/// the denormalized variant colour mirror, moves aliases, then archives the
/// source — atomically (a half-merged colour is the bad state). Replaces the
/// frontend transaction in `src/db/colors.ts`.
#[tauri::command]
#[specta::specta]
async fn merge_color(app: AppHandle, from_id: i64, into_id: i64) -> Result<(), String> {
    if from_id == into_id {
        return Ok(());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE products SET color_id = ?1 WHERE color_id = ?2")
        .bind(into_id)
        .bind(from_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE product_variants
            SET color_id = ?1, color = (SELECT name FROM colors WHERE id = ?1)
          WHERE color_id = ?2",
    )
    .bind(into_id)
    .bind(from_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    // Re-point aliases, ignoring any that would collide with the target's aliases.
    sqlx::query("UPDATE OR IGNORE color_aliases SET color_id = ?1 WHERE color_id = ?2")
        .bind(into_id)
        .bind(from_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE colors SET archived = 1 WHERE id = ?1")
        .bind(from_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Absolute path to the live SQLite file, resolved the same way tauri-plugin-sql
/// resolves `sqlite:app.db` (app config dir + file name).
fn db_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("app.db"))
}

/// One-time SQLite setup, run at app start before the plugin pool exists.
///
/// `journal_mode=WAL` is persistent in the database file, so flipping it once here
/// means every connection tauri-plugin-sql opens later runs in WAL — writers no
/// longer block readers, which is what froze the UI with "database is locked
/// (code 5)" under the default rollback journal.
///
/// This must be a direct one-shot connection rather than a migration (sqlx wraps
/// migrations in a transaction, where journal_mode cannot change) or a URL
/// parameter (the sqlite URL scheme has none for it). The remaining per-connection
/// settings deliberately stay on sqlx defaults: busy_timeout=5s absorbs
/// writer-vs-writer contention, and synchronous=FULL keeps every committed sale
/// durable — the right trade for a money database.
fn init_sqlite_wal(app: &AppHandle) -> Result<(), String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
    use sqlx::{ConnectOptions, Connection};
    let path = db_file_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    tauri::async_runtime::block_on(async move {
        let conn = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .connect()
            .await
            .map_err(|e| e.to_string())?;
        conn.close().await.map_err(|e| e.to_string())
    })
}

/// Writes a consistent snapshot of the live database to `dest_path` (a full path
/// with filename chosen by the frontend) via `VACUUM INTO` — SQLite's online
/// backup: correct even while other connections keep writing (no file copy of a
/// moving target), and the output is compacted. Returns the path.
#[tauri::command]
#[specta::specta]
async fn backup_database(app: AppHandle, dest_path: String) -> Result<String, String> {
    let pool = db_pool(&app).await?;
    // VACUUM INTO refuses to overwrite an existing file.
    if std::path::Path::new(&dest_path).exists() {
        std::fs::remove_file(&dest_path).map_err(|e| e.to_string())?;
    }
    sqlx::query("VACUUM INTO ?1")
        .bind(&dest_path)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(dest_path)
}

/// Restores the database from `src_path`. First copies the current DB to
/// `safety_path` (so a bad restore is reversible), then overwrites the live file and
/// removes the WAL/SHM sidecars so the restored file is authoritative. The frontend
/// relaunches the app afterwards so the new database is reopened cleanly.
#[tauri::command]
#[specta::specta]
async fn restore_database(
    app: AppHandle,
    src_path: String,
    safety_path: String,
) -> Result<(), String> {
    let dest = db_file_path(&app)?;
    let pool = db_pool(&app).await?;
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await;
    if dest.exists() {
        std::fs::copy(&dest, &safety_path).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dest.with_extension("db-wal"));
    let _ = std::fs::remove_file(dest.with_extension("db-shm"));
    Ok(())
}

/// Writes UTF-8 `content` to `dest_path`. Used for CSV exports (the frontend builds
/// the CSV and picks the destination); a Rust command avoids the plugin-fs scope
/// restrictions for arbitrary user-chosen paths.
#[tauri::command]
#[specta::specta]
async fn export_text_file(dest_path: String, content: String) -> Result<(), String> {
    std::fs::write(&dest_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// One line of a thermal receipt. The frontend pre-formats the text (column padding,
/// width) and chooses per-line alignment/emphasis; Rust turns it into ESC/POS bytes.
#[derive(Debug, Deserialize, Type)]
pub struct ReceiptLine {
    pub text: String,
    pub align: String, // "left" | "center" | "right"
    pub bold: bool,
    pub big: bool, // double width + height
}

/// Renders receipt lines to ESC/POS bytes (init, per-line align/bold/size, then a
/// feed and partial cut). Text is emitted as-is (UTF-8); glyphs depend on the
/// printer's active code page.
fn build_escpos(lines: &[ReceiptLine]) -> Vec<u8> {
    let mut b: Vec<u8> = vec![0x1B, 0x40]; // ESC @ — initialize
    for line in lines {
        let align = match line.align.as_str() {
            "center" => 1,
            "right" => 2,
            _ => 0,
        };
        b.extend_from_slice(&[0x1B, 0x61, align]); // ESC a n — alignment
        b.extend_from_slice(&[0x1B, 0x45, line.bold as u8]); // ESC E n — emphasis
        b.extend_from_slice(&[0x1D, 0x21, if line.big { 0x11 } else { 0x00 }]); // GS ! n — size
        b.extend_from_slice(line.text.as_bytes());
        b.push(0x0A); // LF
    }
    // Reset emphasis/size/alignment, feed, partial cut.
    b.extend_from_slice(&[0x1B, 0x45, 0x00, 0x1D, 0x21, 0x00, 0x1B, 0x61, 0x00]);
    b.extend_from_slice(&[0x1B, 0x64, 0x03]); // ESC d 3 — feed 3 lines
    b.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]); // GS V 66 0 — partial cut
    b
}

/// Sends an ESC/POS receipt to `target` — a printer device path (e.g. /dev/usb/lp0)
/// or a raw print queue/file. Connection specifics are environment-dependent and
/// must be configured (and tested) against the actual hardware.
#[tauri::command]
#[specta::specta]
async fn print_receipt(target: String, lines: Vec<ReceiptLine>) -> Result<(), String> {
    if target.trim().is_empty() {
        return Err("No receipt printer configured (set the device path in Settings)".into());
    }
    let bytes = build_escpos(&lines);
    std::fs::write(&target, bytes).map_err(|e| format!("Failed to write to {target}: {e}"))?;
    Ok(())
}

/// A barcode label to print on the thermal/label printer.
#[derive(Debug, Deserialize, Type)]
pub struct LabelInput {
    pub value: String,
    pub format: String, // "ean13" | "code128" | "qrcode"
    pub name: String,
    pub price: String,
    pub sku: String,
}

/// Appends a QR code (model 2) to an ESC/POS buffer via the GS ( k function set.
fn append_qr(b: &mut Vec<u8>, data: &str) {
    // Select model 2.
    b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
    // Module size.
    b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06]);
    // Error correction level M.
    b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]);
    // Store the data.
    let bytes = data.as_bytes();
    let len = (bytes.len() + 3) as u16;
    b.extend_from_slice(&[0x1D, 0x28, 0x6B, (len & 0xFF) as u8, (len >> 8) as u8, 0x31, 0x50, 0x30]);
    b.extend_from_slice(bytes);
    // Print the stored symbol.
    b.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
}

/// Renders a single barcode label to ESC/POS bytes (name, barcode/QR, sku + price).
fn build_label_escpos(input: &LabelInput) -> Vec<u8> {
    let mut b: Vec<u8> = vec![0x1B, 0x40]; // ESC @ — initialize
    b.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
    if !input.name.is_empty() {
        b.extend_from_slice(&[0x1B, 0x45, 0x01]); // bold on
        b.extend_from_slice(input.name.as_bytes());
        b.push(0x0A);
        b.extend_from_slice(&[0x1B, 0x45, 0x00]); // bold off
    }
    b.extend_from_slice(&[0x1D, 0x68, 0x50]); // GS h — barcode height
    b.extend_from_slice(&[0x1D, 0x77, 0x02]); // GS w — module width
    b.extend_from_slice(&[0x1D, 0x48, 0x02]); // GS H — HRI text below
    match input.format.as_str() {
        "qrcode" => append_qr(&mut b, &input.value),
        "code128" => {
            // Code set B (length-prefixed form GS k 73 n d1..dn).
            let data = format!("{{B{}", input.value);
            let bytes = data.as_bytes();
            b.extend_from_slice(&[0x1D, 0x6B, 0x49, bytes.len() as u8]);
            b.extend_from_slice(bytes);
        }
        _ => {
            // EAN-13: only the digits, length-prefixed (GS k 67 n).
            let digits: Vec<u8> = input.value.bytes().filter(u8::is_ascii_digit).collect();
            let n = digits.len().min(13);
            b.extend_from_slice(&[0x1D, 0x6B, 0x43, n as u8]);
            b.extend_from_slice(&digits[..n]);
        }
    }
    b.push(0x0A);
    let mut footer = String::new();
    if !input.sku.is_empty() {
        footer.push_str(&input.sku);
    }
    if !input.price.is_empty() {
        if !footer.is_empty() {
            footer.push_str("  ");
        }
        footer.push_str(&input.price);
    }
    if !footer.is_empty() {
        b.extend_from_slice(footer.as_bytes());
        b.push(0x0A);
    }
    b.extend_from_slice(&[0x1B, 0x61, 0x00]); // reset align
    b.extend_from_slice(&[0x1B, 0x64, 0x02]); // feed 2
    b.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]); // partial cut
    b
}

/// Prints a barcode label to the configured thermal/label printer (`receipt_target`).
#[tauri::command]
#[specta::specta]
async fn print_label(app: AppHandle, input: LabelInput) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let target: String = sqlx::query("SELECT value FROM settings WHERE key = 'receipt_target'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .and_then(|r| r.try_get::<String, _>("value").ok())
        .unwrap_or_default();
    if target.trim().is_empty() {
        return Err("No printer configured (set the device path in Settings)".into());
    }
    let bytes = build_label_escpos(&input);
    std::fs::write(&target, bytes).map_err(|e| format!("Failed to write to {target}: {e}"))?;
    Ok(())
}

/// Build the tauri-specta command registry. Shared by `run()` and the
/// `export_bindings` test so generated TypeScript always matches the app.
///
/// Register your `#[tauri::command] #[specta::specta]` functions here, e.g.
/// `collect_commands![my_command]`.
fn specta_builder() -> Builder {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        create_sale,
        record_payment,
        delete_payment,
        void_sale,
        create_return,
        set_claim_status,
        merge_patients,
        record_stock_change,
        update_job_status,
        merge_color,
        backup_database,
        restore_database,
        export_text_file,
        print_receipt,
        print_label
    ])
}

/// SQLite migrations applied to `sqlite:app.db` on startup.
/// Add migrations here, bumping `version` for each new one.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_schema",
        kind: MigrationKind::Up,
        sql: r#"
            PRAGMA foreign_keys = ON;

            CREATE TABLE patients (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name     TEXT NOT NULL,
                phone         TEXT,
                address       TEXT,
                date_of_birth TEXT,
                national_id   TEXT,
                notes         TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_patients_full_name ON patients(full_name);
            CREATE INDEX idx_patients_phone ON patients(phone);

            CREATE TABLE prescriptions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                exam_date   TEXT NOT NULL DEFAULT (date('now')),
                r_sphere    REAL,
                r_cylinder  REAL,
                r_axis      REAL,
                r_add       REAL,
                r_pd        REAL,
                l_sphere    REAL,
                l_cylinder  REAL,
                l_axis      REAL,
                l_add       REAL,
                l_pd        REAL,
                notes       TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);

            CREATE TABLE products (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                category       TEXT NOT NULL CHECK (category IN ('frame','lens','accessory')),
                name           TEXT NOT NULL,
                brand          TEXT,
                reference      TEXT,
                purchase_price REAL NOT NULL DEFAULT 0,
                selling_price  REAL NOT NULL DEFAULT 0,
                quantity       INTEGER NOT NULL DEFAULT 0,
                min_stock      INTEGER NOT NULL DEFAULT 0,
                supplier       TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_products_category ON products(category);
            CREATE INDEX idx_products_brand ON products(brand);

            CREATE TABLE stock_movements (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                type            TEXT NOT NULL CHECK (type IN ('delivery','sale','adjustment')),
                quantity_change INTEGER NOT NULL,
                note            TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);

            CREATE TABLE sales (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                sale_date       TEXT NOT NULL DEFAULT (datetime('now')),
                subtotal        REAL NOT NULL DEFAULT 0,
                discount_type   TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
                discount_value  REAL NOT NULL DEFAULT 0,
                total           REAL NOT NULL DEFAULT 0,
                amount_paid     REAL NOT NULL DEFAULT 0,
                balance         REAL NOT NULL DEFAULT 0,
                status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','partial','unpaid')),
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_sales_date ON sales(sale_date);
            CREATE INDEX idx_sales_patient ON sales(patient_id);

            CREATE TABLE sale_items (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
                description   TEXT NOT NULL,
                unit_price    REAL NOT NULL DEFAULT 0,
                quantity      INTEGER NOT NULL DEFAULT 1,
                item_discount REAL NOT NULL DEFAULT 0,
                line_total    REAL NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
            CREATE INDEX idx_sale_items_product ON sale_items(product_id);

            CREATE TABLE payments (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                amount  REAL NOT NULL,
                paid_at TEXT NOT NULL DEFAULT (datetime('now')),
                method  TEXT,
                note    TEXT
            );
            CREATE INDEX idx_payments_sale ON payments(sale_id);

            CREATE TABLE settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
            INSERT INTO settings (key, value) VALUES
                ('shop_name', 'My Optical Shop'),
                ('shop_address', ''),
                ('shop_phone', ''),
                ('shop_logo', ''),
                ('currency_symbol', 'DA'),
                ('invoice_footer', 'Thank you for your visit.');
        "#,
        },
        // Convert every monetary column from floating-point dinar to integer
        // centimes (× 100). `discount_value` scales by 100 for both kinds: amount
        // dinars → centimes, and percent (e.g. 15) → basis points (1500). The
        // columns keep their REAL declaration, but only ever hold whole-centime
        // integers, which are exact in f64 far beyond any realistic amount, so no
        // table rebuild is needed. Safe on fresh installs: v1 seeds no money rows,
        // so these UPDATEs touch zero rows.
        Migration {
            version: 2,
            description: "money_to_centimes",
            kind: MigrationKind::Up,
            sql: r#"
            UPDATE products SET
                purchase_price = CAST(ROUND(purchase_price * 100) AS INTEGER),
                selling_price  = CAST(ROUND(selling_price  * 100) AS INTEGER);

            UPDATE sales SET
                subtotal       = CAST(ROUND(subtotal       * 100) AS INTEGER),
                discount_value = CAST(ROUND(discount_value * 100) AS INTEGER),
                total          = CAST(ROUND(total          * 100) AS INTEGER),
                amount_paid    = CAST(ROUND(amount_paid    * 100) AS INTEGER),
                balance        = CAST(ROUND(balance        * 100) AS INTEGER);

            UPDATE sale_items SET
                unit_price    = CAST(ROUND(unit_price    * 100) AS INTEGER),
                item_discount = CAST(ROUND(item_discount * 100) AS INTEGER),
                line_total    = CAST(ROUND(line_total    * 100) AS INTEGER);

            UPDATE payments SET
                amount = CAST(ROUND(amount * 100) AS INTEGER);
        "#,
        },
        // Integrity invariants enforced by the database itself: auto-maintain
        // updated_at on edits, and never let product stock go negative (a backstop
        // behind the create_sale validation).
        Migration {
            version: 3,
            description: "integrity_triggers",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TRIGGER trg_products_updated_at
            AFTER UPDATE ON products FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE products SET updated_at = datetime('now') WHERE id = NEW.id;
            END;

            CREATE TRIGGER trg_patients_updated_at
            AFTER UPDATE ON patients FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE patients SET updated_at = datetime('now') WHERE id = NEW.id;
            END;

            CREATE TRIGGER trg_products_no_negative_stock
            BEFORE UPDATE OF quantity ON products FOR EACH ROW
            WHEN NEW.quantity < 0
            BEGIN
                SELECT RAISE(ABORT, 'Stock cannot go below zero');
            END;
        "#,
        },
        // Algeria compliance: TVA (extracted from TTC prices), droit de timbre on
        // cash sales, and a continuous, gap-free invoice number allocated inside the
        // create_sale transaction. Rates/min/max/prefix live in `settings` so they
        // stay editable. Existing sales are backfilled with a zero-padded id and keep
        // tax 0 (they predate TVA tracking).
        Migration {
            version: 4,
            description: "tva_timbre_invoice_numbering",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE sales ADD COLUMN tax_rate INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE sales ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE sales ADD COLUMN timbre_amount INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE sales ADD COLUMN invoice_number TEXT;

            UPDATE sales SET invoice_number = printf('%06d', id) WHERE invoice_number IS NULL;
            CREATE UNIQUE INDEX idx_sales_invoice_number ON sales(invoice_number);

            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('tva_rate', '1900'),
                ('timbre_rate', '100'),
                ('timbre_min', '500'),
                ('timbre_max', '0'),
                ('invoice_prefix', ''),
                ('invoice_padding', '6');
            INSERT OR IGNORE INTO settings (key, value)
                SELECT 'invoice_next', CAST(COALESCE(MAX(id), 0) + 1 AS TEXT) FROM sales;
        "#,
        },
        // Third-party payers (CNAS/CASNOS/mutuelle…) and per-sale insurance claims.
        // One claim per sale; the covered amount is a separate receivable and is NOT
        // part of sales.balance (which stays the patient's portion).
        Migration {
            version: 5,
            description: "payers_and_claims",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE payers (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                name                 TEXT NOT NULL,
                type                 TEXT,
                default_coverage_pct INTEGER NOT NULL DEFAULT 0,
                notes                TEXT,
                created_at           TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_payers_name ON payers(name);

            CREATE TABLE claims (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id        INTEGER NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
                payer_id       INTEGER NOT NULL REFERENCES payers(id) ON DELETE RESTRICT,
                covered_amount INTEGER NOT NULL DEFAULT 0,
                status         TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','submitted','partial','paid','rejected')),
                claim_ref      TEXT,
                paid_amount    INTEGER NOT NULL DEFAULT 0,
                submitted_at   TEXT,
                paid_at        TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_claims_status ON claims(status);
            CREATE INDEX idx_claims_payer ON claims(payer_id);
        "#,
        },
        // Richer prescriptions: lens type, prism + base and segment height per eye,
        // prescriber, and an expiry date (feeds recalls). All optional.
        Migration {
            version: 6,
            description: "richer_prescriptions",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE prescriptions ADD COLUMN lens_type TEXT;
            ALTER TABLE prescriptions ADD COLUMN r_prism REAL;
            ALTER TABLE prescriptions ADD COLUMN r_base TEXT;
            ALTER TABLE prescriptions ADD COLUMN r_seg_height REAL;
            ALTER TABLE prescriptions ADD COLUMN l_prism REAL;
            ALTER TABLE prescriptions ADD COLUMN l_base TEXT;
            ALTER TABLE prescriptions ADD COLUMN l_seg_height REAL;
            ALTER TABLE prescriptions ADD COLUMN prescriber TEXT;
            ALTER TABLE prescriptions ADD COLUMN expiry_date TEXT;
        "#,
        },
        // Lab job tracking: a glasses order flows ordered → at lab → edging → ready
        // → collected. Auto-created by create_sale when a sale includes a lens line.
        Migration {
            version: 7,
            description: "lab_jobs",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE jobs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id         INTEGER REFERENCES sales(id) ON DELETE SET NULL,
                patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                lab             TEXT,
                status          TEXT NOT NULL DEFAULT 'ordered'
                                 CHECK (status IN ('ordered','at_lab','edging','ready','collected')),
                expected_ready  TEXT,
                delivered_at    TEXT,
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_jobs_status ON jobs(status);
            CREATE INDEX idx_jobs_patient ON jobs(patient_id);
        "#,
        },
        // Returns: a credit note (with line items) preserves the original sale, while
        // restocking returned goods. Store-credit returns accrue to patients.store_credit,
        // redeemable on future sales.
        Migration {
            version: 8,
            description: "returns_credit_notes",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE patients ADD COLUMN store_credit INTEGER NOT NULL DEFAULT 0;

            CREATE TABLE credit_notes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id    INTEGER REFERENCES sales(id) ON DELETE SET NULL,
                patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                total      INTEGER NOT NULL DEFAULT 0,
                method     TEXT NOT NULL CHECK (method IN ('refund','store_credit')),
                notes      TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_credit_notes_sale ON credit_notes(sale_id);
            CREATE INDEX idx_credit_notes_patient ON credit_notes(patient_id);

            CREATE TABLE credit_note_items (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
                sale_item_id   INTEGER REFERENCES sale_items(id) ON DELETE SET NULL,
                product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
                description    TEXT NOT NULL,
                quantity       INTEGER NOT NULL,
                line_total     INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_credit_note_items_cn ON credit_note_items(credit_note_id);
            CREATE INDEX idx_credit_note_items_si ON credit_note_items(sale_item_id);
        "#,
        },
        // Catalog overhaul, part 1: managed taxonomy (categories/brands/suppliers) with a
        // per-supplier ledger, plus new product columns. `item_type` distinguishes stocked
        // products from non-physical services. `category` stays NOT NULL (frame/lens/accessory
        // = the optical "type" driving lab jobs); services store the 'accessory' placeholder
        // and are always scoped out by `item_type='product'` in the UI. Brands/suppliers are
        // backfilled from the old free-text columns, which are kept as a denormalized mirror.
        Migration {
            version: 9,
            description: "catalog_taxonomy_and_product_columns",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                archived   INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_categories_name ON categories(name);

            CREATE TABLE brands (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                archived   INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_brands_name ON brands(name);

            CREATE TABLE suppliers (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                phone      TEXT,
                email      TEXT,
                address    TEXT,
                notes      TEXT,
                archived   INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_suppliers_name ON suppliers(name);

            -- Signed running ledger per supplier (centimes): purchases/debts are POSITIVE
            -- (we owe more), payments are NEGATIVE (we owe less); balance = SUM(amount).
            CREATE TABLE supplier_ledger (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
                type        TEXT NOT NULL CHECK (type IN ('purchase','payment','debt','adjustment')),
                amount      INTEGER NOT NULL DEFAULT 0,
                note        TEXT,
                ref         TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_supplier_ledger_supplier ON supplier_ledger(supplier_id);

            -- New product columns (all additive; existing rows stay valid).
            ALTER TABLE products ADD COLUMN item_type TEXT NOT NULL DEFAULT 'product'
                CHECK (item_type IN ('product','service'));
            ALTER TABLE products ADD COLUMN barcode TEXT;
            ALTER TABLE products ADD COLUMN expiry_date TEXT;
            ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
            ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL;
            ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

            CREATE UNIQUE INDEX idx_products_barcode ON products(barcode)
                WHERE barcode IS NOT NULL AND barcode <> '';
            CREATE INDEX idx_products_item_type ON products(item_type);
            CREATE INDEX idx_products_expiry ON products(expiry_date);

            -- Backfill managed brands/suppliers from the legacy free-text columns.
            INSERT INTO brands (name)
                SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand <> '';
            UPDATE products SET brand_id = (SELECT id FROM brands WHERE brands.name = products.brand)
                WHERE brand IS NOT NULL AND brand <> '';

            INSERT INTO suppliers (name)
                SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND supplier <> '';
            UPDATE products SET supplier_id = (SELECT id FROM suppliers WHERE suppliers.name = products.supplier)
                WHERE supplier IS NOT NULL AND supplier <> '';

            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('expiry_warn_days', '30'),
                ('receipt_config', ''),
                ('label_config', '');
        "#,
        },
        // Catalog overhaul, part 2: custom/dynamic product attributes (EAV). Admins
        // define attributes and assign each to a fixed type (frame/lens/accessory), a
        // managed category, or globally. Ships built-in Gender + "Suitable for" tags
        // and seeded Frame/Lens optical templates so the catalog is useful immediately.
        Migration {
            version: 10,
            description: "custom_attributes_eav",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE attribute_definitions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                key           TEXT NOT NULL UNIQUE,
                label         TEXT NOT NULL,
                field_type    TEXT NOT NULL CHECK (field_type IN ('text','number','select','multiselect')),
                unit          TEXT,
                options       TEXT,            -- JSON array for (multi)select
                is_filterable INTEGER NOT NULL DEFAULT 1,
                is_builtin    INTEGER NOT NULL DEFAULT 0,
                sort_order    INTEGER NOT NULL DEFAULT 0,
                archived      INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE attribute_targets (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                attribute_id INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
                target_kind  TEXT NOT NULL CHECK (target_kind IN ('type','category','global')),
                target_value TEXT             -- 'frame'|'lens'|'accessory', a category id, or NULL for global
            );
            CREATE INDEX idx_attribute_targets_attr ON attribute_targets(attribute_id);

            CREATE TABLE product_attribute_values (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                attribute_id  INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
                value_text    TEXT,
                value_num     REAL,
                value_options TEXT,            -- JSON array for multiselect
                UNIQUE (product_id, attribute_id)
            );
            CREATE INDEX idx_pav_product ON product_attribute_values(product_id);
            CREATE INDEX idx_pav_attr ON product_attribute_values(attribute_id, value_text);

            -- Built-in merchandising tags (global).
            INSERT INTO attribute_definitions (key, label, field_type, options, is_builtin, sort_order) VALUES
                ('gender', 'Gender', 'select', '["men","women","unisex","kids"]', 1, 1),
                ('suitable_for', 'Suitable for', 'multiselect', '["reading","distance","computer","driving","sport","sun"]', 1, 2);
            INSERT INTO attribute_targets (attribute_id, target_kind, target_value)
                SELECT id, 'global', NULL FROM attribute_definitions WHERE key IN ('gender','suitable_for');

            -- Seeded Frame template (type = frame).
            INSERT INTO attribute_definitions (key, label, field_type, unit, options, sort_order) VALUES
                ('frame_material', 'Frame material', 'select', NULL, '["acetate","metal","TR90","titanium","wood","mixed"]', 10),
                ('frame_shape', 'Frame shape', 'select', NULL, '["round","square","rectangle","oval","aviator","cat-eye","geometric","browline"]', 11),
                ('frame_rim', 'Rim type', 'select', NULL, '["full-rim","semi-rimless","rimless"]', 12),
                ('frame_color', 'Color', 'text', NULL, NULL, 13),
                ('eye_size', 'Eye size', 'number', 'mm', NULL, 14),
                ('bridge', 'Bridge', 'number', 'mm', NULL, 15),
                ('temple', 'Temple', 'number', 'mm', NULL, 16);
            INSERT INTO attribute_targets (attribute_id, target_kind, target_value)
                SELECT id, 'type', 'frame' FROM attribute_definitions
                WHERE key IN ('frame_material','frame_shape','frame_rim','frame_color','eye_size','bridge','temple');

            -- Seeded Lens template (type = lens).
            INSERT INTO attribute_definitions (key, label, field_type, unit, options, sort_order) VALUES
                ('lens_material', 'Lens material', 'select', NULL, '["CR-39","polycarbonate","Trivex","high-index 1.67","high-index 1.74"]', 20),
                ('lens_index', 'Index', 'number', NULL, NULL, 21),
                ('lens_diameter', 'Diameter', 'number', 'mm', NULL, 22),
                ('base_curve', 'Base curve', 'number', NULL, NULL, 23),
                ('coatings', 'Coatings', 'multiselect', NULL, '["AR","blue-light","photochromic","polarized","scratch-resistant","UV"]', 24);
            INSERT INTO attribute_targets (attribute_id, target_kind, target_value)
                SELECT id, 'type', 'lens' FROM attribute_definitions
                WHERE key IN ('lens_material','lens_index','lens_diameter','base_curve','coatings');
        "#,
        },
        // Catalog overhaul, part 3: product variants (color/size). A product is either
        // "simple" (stock on the product) or "variant" (stock per variant row). Sale
        // items / stock movements / credit notes gain an optional variant_id.
        Migration {
            version: 11,
            description: "product_variants",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE product_variants (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                label          TEXT,
                color          TEXT,
                size           TEXT,
                sku            TEXT,
                barcode        TEXT,
                quantity       INTEGER NOT NULL DEFAULT 0,
                min_stock      INTEGER NOT NULL DEFAULT 0,
                selling_price  INTEGER,   -- nullable override (centimes)
                purchase_price INTEGER,
                archived       INTEGER NOT NULL DEFAULT 0,
                created_at     TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_variants_product ON product_variants(product_id);
            CREATE UNIQUE INDEX idx_variants_barcode ON product_variants(barcode)
                WHERE barcode IS NOT NULL AND barcode <> '';

            CREATE TRIGGER trg_variants_updated_at
            AFTER UPDATE ON product_variants FOR EACH ROW
            WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE product_variants SET updated_at = datetime('now') WHERE id = NEW.id;
            END;

            CREATE TRIGGER trg_variants_no_negative_stock
            BEFORE UPDATE OF quantity ON product_variants FOR EACH ROW
            WHEN NEW.quantity < 0
            BEGIN
                SELECT RAISE(ABORT, 'Stock cannot go below zero');
            END;

            ALTER TABLE sale_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
            ALTER TABLE stock_movements ADD COLUMN variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
            ALTER TABLE credit_note_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
        "#,
        },
        // Catalog overhaul, part 4: product photos. Image bytes live on disk under the
        // app config dir; only the relative path is stored here.
        Migration {
            version: 12,
            description: "product_images",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE product_images (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
                path       TEXT NOT NULL,
                is_primary INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_product_images_product ON product_images(product_id);
        "#,
        },
        // Client-management overhaul, part 1: richer patient profile.
        // Human-readable client code (backfilled), a default third-party payer +
        // coverage carried onto each new sale's claim, insurance policy number,
        // and extra contact fields. `photo` holds a base64 data-URI (same approach
        // as the shop logo). The client-code sequence lives in the settings table.
        Migration {
            version: 13,
            description: "patient_profile_fields",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE patients ADD COLUMN code TEXT;
            ALTER TABLE patients ADD COLUMN default_payer_id INTEGER REFERENCES payers(id) ON DELETE SET NULL;
            ALTER TABLE patients ADD COLUMN default_coverage_pct INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE patients ADD COLUMN insurance_policy_no TEXT;
            ALTER TABLE patients ADD COLUMN email TEXT;
            ALTER TABLE patients ADD COLUMN phone2 TEXT;
            ALTER TABLE patients ADD COLUMN photo TEXT;

            UPDATE patients SET code = printf('P-%04d', id) WHERE code IS NULL OR code = '';
            CREATE UNIQUE INDEX idx_patients_code ON patients(code) WHERE code IS NOT NULL AND code <> '';

            INSERT OR IGNORE INTO settings(key, value)
                SELECT 'client_code_next', CAST(COALESCE(MAX(id), 0) + 1 AS TEXT) FROM patients;
        "#,
        },
        // Client-management overhaul, part 2: custom client fields. Reuses the product
        // EAV engine — admins target an attribute to 'patient' and it renders on the
        // client form and as a list facet. `attribute_targets` is rebuilt (nothing FKs
        // to it) to widen its CHECK; a built-in "Tags" multiselect ships seeded.
        Migration {
            version: 14,
            description: "patient_custom_fields",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE attribute_targets_new (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                attribute_id INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
                target_kind  TEXT NOT NULL CHECK (target_kind IN ('type','category','global','patient')),
                target_value TEXT
            );
            INSERT INTO attribute_targets_new (id, attribute_id, target_kind, target_value)
                SELECT id, attribute_id, target_kind, target_value FROM attribute_targets;
            DROP TABLE attribute_targets;
            ALTER TABLE attribute_targets_new RENAME TO attribute_targets;
            CREATE INDEX idx_attribute_targets_attr ON attribute_targets(attribute_id);

            CREATE TABLE patient_attribute_values (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                attribute_id  INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
                value_text    TEXT,
                value_num     REAL,
                value_options TEXT,            -- JSON array for multiselect
                UNIQUE (patient_id, attribute_id)
            );
            CREATE INDEX idx_patient_av_patient ON patient_attribute_values(patient_id);
            CREATE INDEX idx_patient_av_attr ON patient_attribute_values(attribute_id, value_text);

            -- Built-in client tags (admin-editable; targeted at patients).
            INSERT INTO attribute_definitions (key, label, field_type, options, is_builtin, sort_order) VALUES
                ('client_tags', 'Tags', 'multiselect', '["VIP","Lentilles","Assuré","À rappeler"]', 1, 100);
            INSERT INTO attribute_targets (attribute_id, target_kind, target_value)
                SELECT id, 'patient', NULL FROM attribute_definitions WHERE key = 'client_tags';
        "#,
        },
        // Client-management overhaul, part 3: appointments (on-site optometry). The
        // optometrist is free text (no staff table, matching prescriptions.prescriber).
        // A completed exam can link the prescription it produced.
        Migration {
            version: 15,
            description: "appointments",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE appointments (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                starts_at       TEXT NOT NULL,            -- 'YYYY-MM-DD HH:MM'
                duration_min    INTEGER NOT NULL DEFAULT 30,
                optometrist     TEXT,
                reason          TEXT,
                status          TEXT NOT NULL DEFAULT 'booked'
                                CHECK (status IN ('booked','arrived','done','no_show','cancelled')),
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_appt_patient ON appointments(patient_id);
            CREATE INDEX idx_appt_starts ON appointments(starts_at);
        "#,
        },
        // Client-management overhaul, part 4: a light per-client activity timeline.
        // Single-user app, so no actor is recorded — just typed, timestamped events.
        Migration {
            version: 16,
            description: "patient_activity",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE patient_activity (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                type        TEXT NOT NULL,   -- created|edited|sale|payment|appointment|prescription
                description TEXT,
                ref_id      INTEGER,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_activity_patient ON patient_activity(patient_id, created_at);
        "#,
        },
        // Drops the store-credit feature: returns are now always cash refunds, so patients no
        // longer carry a redeemable balance. Any outstanding balance is discarded. The
        // credit_notes.method CHECK (v8) is left intact — it still permits 'refund', the only
        // value written now — and historic 'store_credit' rows remain as harmless records.
        Migration {
            version: 17,
            description: "drop_store_credit",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE patients DROP COLUMN store_credit;
        "#,
        },
        // Catalog overhaul, part 5: centralized colour vocabulary. Replaces the two
        // uncontrolled free-text colour fields (product_variants.color and the EAV
        // `frame_color` attribute) with a single admin-managed lookup table referenced
        // by FK. Carries bilingual (FR/AR) labels + a hex swatch for the low-literacy UX.
        // Existing free-text values are auto-mapped via an alias table; anything that
        // doesn't match lands in `color_import_review` for a one-time admin cleanup.
        Migration {
            version: 18,
            description: "colors",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE colors (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,          -- canonical / admin label (e.g. "Black")
                name_fr     TEXT,                   -- French display ("Noir")
                name_ar     TEXT,                   -- Arabic display ("أسود")
                hex         TEXT,                   -- '#RRGGBB' swatch; NULL = no single colour
                is_builtin  INTEGER NOT NULL DEFAULT 0,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                archived    INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            -- No two *active* colours may share a canonical name (DB-level dedup guard).
            CREATE UNIQUE INDEX idx_colors_name ON colors(name COLLATE NOCASE) WHERE archived = 0;

            CREATE TRIGGER trg_colors_updated_at
            AFTER UPDATE ON colors FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
            BEGIN
                UPDATE colors SET updated_at = datetime('now') WHERE id = NEW.id;
            END;

            -- Synonyms (lowercased): power migration auto-mapping, ongoing search, and merges.
            CREATE TABLE color_aliases (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                color_id  INTEGER NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
                alias     TEXT NOT NULL
            );
            CREATE UNIQUE INDEX idx_color_aliases_norm ON color_aliases(alias COLLATE NOCASE);

            -- FK references replacing the two free-text fields. Legacy text columns are
            -- kept in place: products has none (colour was EAV), product_variants.color
            -- is retained as a denormalized mirror written from color_id going forward.
            ALTER TABLE products         ADD COLUMN color_id INTEGER REFERENCES colors(id) ON DELETE SET NULL;
            ALTER TABLE product_variants ADD COLUMN color_id INTEGER REFERENCES colors(id) ON DELETE SET NULL;
            CREATE INDEX idx_products_color ON products(color_id);
            CREATE INDEX idx_variants_color ON product_variants(color_id);

            -- Seed a curated canonical palette (covers the seeded French catalogue).
            INSERT INTO colors (name, name_fr, name_ar, hex, is_builtin, sort_order) VALUES
                ('Black','Noir','أسود','#1A1A1A',1,1),
                ('White','Blanc','أبيض','#FFFFFF',1,2),
                ('Gray','Gris','رمادي','#808080',1,3),
                ('Gunmetal','Gunmetal','رمادي داكن','#2A3439',1,4),
                ('Silver','Argenté','فضي','#C0C0C0',1,5),
                ('Gold','Doré','ذهبي','#C9A227',1,6),
                ('Brown','Marron','بني','#5A3A22',1,7),
                ('Havana','Havane','بني فاتح','#6F4E37',1,8),
                ('Tortoise','Écaille','عقيق','#7A4B2B',1,9),
                ('Burgundy','Bordeaux','خمري','#6E1423',1,10),
                ('Blue','Bleu','أزرق','#2244AA',1,11),
                ('Red','Rouge','أحمر','#B11226',1,12),
                ('Green','Vert','أخضر','#1E7D32',1,13),
                ('Pink','Rose','وردي','#E26A8D',1,14),
                ('Transparent','Transparent','شفاف',NULL,1,15),
                ('Multicolor','Multicolore','متعدد الألوان',NULL,1,16);

            -- Aliases (lowercased). Includes EN/FR/AR + finishes + common variants.
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'black' AS alias UNION ALL SELECT 'noir' UNION ALL SELECT 'أسود'
                UNION ALL SELECT 'noir mat' UNION ALL SELECT 'noir brillant'
                UNION ALL SELECT 'matte black' UNION ALL SELECT 'matt black'
                UNION ALL SELECT 'black matt' UNION ALL SELECT 'dark black' UNION ALL SELECT 'blk'
              ) a WHERE c.name = 'Black';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'white' AS alias UNION ALL SELECT 'blanc' UNION ALL SELECT 'أبيض'
              ) a WHERE c.name = 'White';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'gray' AS alias UNION ALL SELECT 'grey' UNION ALL SELECT 'gris' UNION ALL SELECT 'رمادي'
              ) a WHERE c.name = 'Gray';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'gunmetal' AS alias UNION ALL SELECT 'gun metal' UNION ALL SELECT 'canon de fusil'
              ) a WHERE c.name = 'Gunmetal';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'silver' AS alias UNION ALL SELECT 'argent' UNION ALL SELECT 'argenté'
                UNION ALL SELECT 'argente' UNION ALL SELECT 'فضي'
              ) a WHERE c.name = 'Silver';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'gold' AS alias UNION ALL SELECT 'doré' UNION ALL SELECT 'dore'
                UNION ALL SELECT 'or' UNION ALL SELECT 'ذهبي'
              ) a WHERE c.name = 'Gold';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'brown' AS alias UNION ALL SELECT 'marron' UNION ALL SELECT 'بني'
              ) a WHERE c.name = 'Brown';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'havana' AS alias UNION ALL SELECT 'havane'
              ) a WHERE c.name = 'Havana';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'tortoise' AS alias UNION ALL SELECT 'tortoiseshell'
                UNION ALL SELECT 'écaille' UNION ALL SELECT 'ecaille' UNION ALL SELECT 'عقيق'
              ) a WHERE c.name = 'Tortoise';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'burgundy' AS alias UNION ALL SELECT 'bordeaux' UNION ALL SELECT 'bordo' UNION ALL SELECT 'خمري'
              ) a WHERE c.name = 'Burgundy';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'blue' AS alias UNION ALL SELECT 'bleu' UNION ALL SELECT 'أزرق'
              ) a WHERE c.name = 'Blue';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'red' AS alias UNION ALL SELECT 'rouge' UNION ALL SELECT 'أحمر'
              ) a WHERE c.name = 'Red';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'green' AS alias UNION ALL SELECT 'vert' UNION ALL SELECT 'أخضر'
              ) a WHERE c.name = 'Green';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'pink' AS alias UNION ALL SELECT 'rose' UNION ALL SELECT 'وردي'
              ) a WHERE c.name = 'Pink';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'transparent' AS alias UNION ALL SELECT 'clear' UNION ALL SELECT 'crystal'
                UNION ALL SELECT 'cristal' UNION ALL SELECT 'شفاف'
              ) a WHERE c.name = 'Transparent';
            INSERT INTO color_aliases (color_id, alias)
              SELECT c.id, a.alias FROM colors c JOIN (
                SELECT 'multicolor' AS alias UNION ALL SELECT 'multicolore' UNION ALL SELECT 'متعدد الألوان'
              ) a WHERE c.name = 'Multicolor';

            -- Backfill VARIANT colours from the free-text column via alias match.
            UPDATE product_variants
            SET color_id = (SELECT ca.color_id FROM color_aliases ca
                            WHERE ca.alias = lower(trim(product_variants.color)))
            WHERE color IS NOT NULL AND trim(color) <> '';

            -- Backfill PRODUCT colours from the EAV `frame_color` values via alias match.
            UPDATE products
            SET color_id = (
                SELECT ca.color_id
                FROM product_attribute_values pav
                JOIN attribute_definitions d ON d.id = pav.attribute_id AND d.key = 'frame_color'
                JOIN color_aliases ca ON ca.alias = lower(trim(pav.value_text))
                WHERE pav.product_id = products.id)
            WHERE color_id IS NULL;

            -- Queue every still-unmapped non-empty raw value for one-time admin review.
            CREATE TABLE color_import_review (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                source      TEXT NOT NULL,          -- 'product' | 'variant'
                source_id   INTEGER NOT NULL,
                raw_value   TEXT NOT NULL,
                resolved    INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO color_import_review (source, source_id, raw_value)
                SELECT 'variant', id, color FROM product_variants
                WHERE color_id IS NULL AND color IS NOT NULL AND trim(color) <> '';
            INSERT INTO color_import_review (source, source_id, raw_value)
                SELECT 'product', pav.product_id, pav.value_text
                FROM product_attribute_values pav
                JOIN attribute_definitions d ON d.id = pav.attribute_id AND d.key = 'frame_color'
                WHERE pav.value_text IS NOT NULL AND trim(pav.value_text) <> ''
                  AND (SELECT color_id FROM products p WHERE p.id = pav.product_id) IS NULL;

            -- Retire the EAV colour field. Stored values are kept for audit; archived
            -- definitions no longer render in the dynamic product form.
            UPDATE attribute_definitions SET archived = 1 WHERE key = 'frame_color';
        "#,
        },
        // Quick Sale / walk-in POS: a sale (and its auto lab job / return credit note)
        // no longer requires a patient. SQLite can't drop a NOT NULL constraint in place,
        // so each affected table is rebuilt with patient_id nullable.
        //
        // IMPORTANT: with foreign keys enabled, `DROP TABLE sales` performs an implicit
        // DELETE of every row, which fires ON DELETE actions on the children — CASCADE
        // would wipe sale_items/payments/claims and SET NULL would clear jobs/credit_notes
        // sale_id. We therefore snapshot those children into temp tables *before* the drop
        // and restore the originals afterwards. `defer_foreign_keys` lets the intermediate
        // states exist inside the transaction; integrity is re-checked (and passes, since
        // all ids are preserved) at commit. Also adds `held_sales` (parked carts that
        // survive restarts) and `product_favorites`.
        Migration {
            version: 19,
            description: "walkin_sales_held_carts_favorites",
            kind: MigrationKind::Up,
            sql: r#"
            PRAGMA defer_foreign_keys = ON;

            -- Snapshot children that the sales drop would cascade-delete or null out.
            CREATE TEMP TABLE _v19_si  AS SELECT * FROM sale_items;
            CREATE TEMP TABLE _v19_pay AS SELECT * FROM payments;
            CREATE TEMP TABLE _v19_clm AS SELECT * FROM claims;
            CREATE TEMP TABLE _v19_job AS SELECT * FROM jobs;
            CREATE TEMP TABLE _v19_cn  AS SELECT * FROM credit_notes;
            CREATE TEMP TABLE _v19_cni AS SELECT * FROM credit_note_items;

            -- Rebuild `sales` with a nullable patient_id (walk-in sales have no patient).
            -- Column set mirrors the live schema: v1 base + tva/timbre/invoice columns.
            CREATE TABLE sales_new (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id      INTEGER REFERENCES patients(id) ON DELETE RESTRICT,
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                sale_date       TEXT NOT NULL DEFAULT (datetime('now')),
                subtotal        REAL NOT NULL DEFAULT 0,
                discount_type   TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
                discount_value  REAL NOT NULL DEFAULT 0,
                total           REAL NOT NULL DEFAULT 0,
                amount_paid     REAL NOT NULL DEFAULT 0,
                balance         REAL NOT NULL DEFAULT 0,
                status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','partial','unpaid')),
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                tax_rate        INTEGER NOT NULL DEFAULT 0,
                tax_amount      INTEGER NOT NULL DEFAULT 0,
                timbre_amount   INTEGER NOT NULL DEFAULT 0,
                invoice_number  TEXT
            );
            INSERT INTO sales_new SELECT
                id, patient_id, prescription_id, sale_date, subtotal, discount_type,
                discount_value, total, amount_paid, balance, status, notes, created_at,
                tax_rate, tax_amount, timbre_amount, invoice_number
              FROM sales;
            DROP TABLE sales;
            ALTER TABLE sales_new RENAME TO sales;
            CREATE INDEX idx_sales_date ON sales(sale_date);
            CREATE INDEX idx_sales_patient ON sales(patient_id);
            CREATE UNIQUE INDEX idx_sales_invoice_number ON sales(invoice_number);

            -- Restore the children the sales drop emptied via CASCADE.
            INSERT INTO sale_items SELECT * FROM _v19_si;
            INSERT INTO payments   SELECT * FROM _v19_pay;
            INSERT INTO claims     SELECT * FROM _v19_clm;

            -- Rebuild `jobs` with a nullable patient_id (walk-in lens orders), restoring
            -- from the pre-drop snapshot so the original sale_id is preserved.
            DROP TABLE jobs;
            CREATE TABLE jobs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id         INTEGER REFERENCES sales(id) ON DELETE SET NULL,
                patient_id      INTEGER REFERENCES patients(id) ON DELETE CASCADE,
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                lab             TEXT,
                status          TEXT NOT NULL DEFAULT 'ordered'
                                 CHECK (status IN ('ordered','at_lab','edging','ready','collected')),
                expected_ready  TEXT,
                delivered_at    TEXT,
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO jobs SELECT * FROM _v19_job;
            CREATE INDEX idx_jobs_status ON jobs(status);
            CREATE INDEX idx_jobs_patient ON jobs(patient_id);

            -- Rebuild `credit_notes` with a nullable patient_id (walk-in returns); its
            -- items were cascade-emptied by the drop, so restore them too.
            DROP TABLE credit_notes;
            CREATE TABLE credit_notes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id    INTEGER REFERENCES sales(id) ON DELETE SET NULL,
                patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
                total      INTEGER NOT NULL DEFAULT 0,
                method     TEXT NOT NULL CHECK (method IN ('refund','store_credit')),
                notes      TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO credit_notes SELECT * FROM _v19_cn;
            CREATE INDEX idx_credit_notes_sale ON credit_notes(sale_id);
            CREATE INDEX idx_credit_notes_patient ON credit_notes(patient_id);
            INSERT INTO credit_note_items SELECT * FROM _v19_cni;

            DROP TABLE _v19_si;
            DROP TABLE _v19_pay;
            DROP TABLE _v19_clm;
            DROP TABLE _v19_job;
            DROP TABLE _v19_cn;
            DROP TABLE _v19_cni;

            -- Parked carts. The cart is stored as a JSON snapshot (a mid-edit draft, not a
            -- normalized order); restoring just rehydrates the client store. Holding never
            -- touches stock — stock is validated/deducted only at real checkout.
            CREATE TABLE held_sales (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                label       TEXT,
                customer_id INTEGER REFERENCES patients(id) ON DELETE SET NULL, -- NULL = walk-in
                payload     TEXT NOT NULL,            -- JSON cart snapshot
                item_count  INTEGER NOT NULL DEFAULT 0,
                total       REAL NOT NULL DEFAULT 0,  -- centimes, denormalized for the chip strip
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_held_sales_updated ON held_sales(updated_at);

            -- Starred products surfaced as a quick-filter in the POS catalog.
            CREATE TABLE product_favorites (
                product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "#,
        },
        // Fiscal compliance: issued invoices become immutable. `sales.status` gains
        // a 'void' value (a cancelled-but-retained invoice keeps its number), and
        // credit notes gain a sequential avoir number plus a 'balance' method (apply
        // the credit to the sale's outstanding balance instead of refunding cash).
        // `sale_items.unit_cost` snapshots COGS at sale time so margin reports don't
        // drift when a product's purchase price is later overwritten. Both CHECK
        // changes need a table rebuild (v19's defer_foreign_keys + snapshot pattern).
        Migration {
            version: 20,
            description: "fiscal_void_and_avoir_numbering",
            kind: MigrationKind::Up,
            sql: r#"
            PRAGMA defer_foreign_keys = ON;

            -- Snapshot children the sales/credit_notes rebuilds would cascade/null.
            CREATE TEMP TABLE _v20_si  AS SELECT * FROM sale_items;
            CREATE TEMP TABLE _v20_pay AS SELECT * FROM payments;
            CREATE TEMP TABLE _v20_clm AS SELECT * FROM claims;
            CREATE TEMP TABLE _v20_cn  AS SELECT * FROM credit_notes;
            CREATE TEMP TABLE _v20_cni AS SELECT * FROM credit_note_items;
            CREATE TEMP TABLE _v20_job AS SELECT * FROM jobs;

            -- Rebuild `sales` to widen the status CHECK and add the void columns.
            CREATE TABLE sales_new (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id      INTEGER REFERENCES patients(id) ON DELETE RESTRICT,
                prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
                sale_date       TEXT NOT NULL DEFAULT (datetime('now')),
                subtotal        REAL NOT NULL DEFAULT 0,
                discount_type   TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
                discount_value  REAL NOT NULL DEFAULT 0,
                total           REAL NOT NULL DEFAULT 0,
                amount_paid     REAL NOT NULL DEFAULT 0,
                balance         REAL NOT NULL DEFAULT 0,
                status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','partial','unpaid','void')),
                notes           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                tax_rate        INTEGER NOT NULL DEFAULT 0,
                tax_amount      INTEGER NOT NULL DEFAULT 0,
                timbre_amount   INTEGER NOT NULL DEFAULT 0,
                invoice_number  TEXT,
                voided_at       TEXT,
                void_reason     TEXT
            );
            INSERT INTO sales_new (id, patient_id, prescription_id, sale_date, subtotal,
                discount_type, discount_value, total, amount_paid, balance, status, notes,
                created_at, tax_rate, tax_amount, timbre_amount, invoice_number)
              SELECT id, patient_id, prescription_id, sale_date, subtotal, discount_type,
                discount_value, total, amount_paid, balance, status, notes, created_at,
                tax_rate, tax_amount, timbre_amount, invoice_number
              FROM sales;
            DROP TABLE sales;
            ALTER TABLE sales_new RENAME TO sales;
            CREATE INDEX idx_sales_date ON sales(sale_date);
            CREATE INDEX idx_sales_patient ON sales(patient_id);
            CREATE UNIQUE INDEX idx_sales_invoice_number ON sales(invoice_number);

            -- Restore the children cascade-emptied by the sales drop.
            INSERT INTO sale_items SELECT * FROM _v20_si;
            INSERT INTO payments   SELECT * FROM _v20_pay;
            INSERT INTO claims     SELECT * FROM _v20_clm;

            -- Rebuild `credit_notes` to widen the method CHECK and add avoir numbering.
            DROP TABLE credit_notes;
            CREATE TABLE credit_notes (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id    INTEGER REFERENCES sales(id) ON DELETE SET NULL,
                patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
                total      INTEGER NOT NULL DEFAULT 0,
                method     TEXT NOT NULL CHECK (method IN ('refund','store_credit','balance')),
                cn_number  TEXT,
                notes      TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO credit_notes (id, sale_id, patient_id, total, method, notes, created_at)
              SELECT id, sale_id, patient_id, total, method, notes, created_at FROM _v20_cn;
            -- Backfill a sequential avoir number for historic credit notes.
            UPDATE credit_notes SET cn_number = printf('A%06d', id) WHERE cn_number IS NULL;
            CREATE INDEX idx_credit_notes_sale ON credit_notes(sale_id);
            CREATE INDEX idx_credit_notes_patient ON credit_notes(patient_id);
            CREATE UNIQUE INDEX idx_credit_notes_number ON credit_notes(cn_number)
                WHERE cn_number IS NOT NULL AND cn_number <> '';
            INSERT INTO credit_note_items SELECT * FROM _v20_cni;

            -- The sales drop SET NULL'd jobs.sale_id; restore the original linkage.
            UPDATE jobs SET sale_id = (SELECT sale_id FROM _v20_job j WHERE j.id = jobs.id);

            DROP TABLE _v20_si;
            DROP TABLE _v20_pay;
            DROP TABLE _v20_clm;
            DROP TABLE _v20_cn;
            DROP TABLE _v20_cni;
            DROP TABLE _v20_job;

            -- COGS snapshot per sale line (centimes), captured at create_sale time.
            ALTER TABLE sale_items ADD COLUMN unit_cost INTEGER NOT NULL DEFAULT 0;

            -- Avoir (credit-note) numbering counter + format, mirroring invoice settings.
            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('credit_note_prefix', 'A'),
                ('credit_note_padding', '6');
            INSERT OR IGNORE INTO settings (key, value)
                SELECT 'credit_note_next', CAST(COALESCE(MAX(id), 0) + 1 AS TEXT) FROM credit_notes;
        "#,
        },
        // Inventory integrity: products can be archived (soft-deleted) instead of hard
        // deleted, so a discontinued item's stock-movement history and sales links are
        // preserved. Archived products are hidden from catalogs/POS by default.
        Migration {
            version: 21,
            description: "product_archive",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE products ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX idx_products_archived ON products(archived);
        "#,
        },
        // Clients & clinical: patients and prescriptions become soft-deletable (so
        // medical records are never destroyed by a cascade), and prescriptions gain
        // contact-lens fields (base curve + diameter per eye).
        Migration {
            version: 22,
            description: "patient_rx_soft_delete_and_contact_lens",
            kind: MigrationKind::Up,
            sql: r#"
            ALTER TABLE patients ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX idx_patients_archived ON patients(archived);

            ALTER TABLE prescriptions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE prescriptions ADD COLUMN r_bc REAL;
            ALTER TABLE prescriptions ADD COLUMN l_bc REAL;
            ALTER TABLE prescriptions ADD COLUMN r_dia REAL;
            ALTER TABLE prescriptions ADD COLUMN l_dia REAL;
        "#,
        },
        // Lightweight accountability + lab-stage history + auto-backup settings.
        // Staff carry a role and an optional hashed PIN (verified in the app for
        // protected actions); the active staff is chosen in the shell — there is no
        // login wall. The audit_log is append-only (who/what/when), with a
        // denormalized staff_name so records survive staff removal.
        Migration {
            version: 23,
            description: "staff_audit_job_events",
            kind: MigrationKind::Up,
            sql: r#"
            CREATE TABLE staff (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                role       TEXT NOT NULL DEFAULT 'staff'
                           CHECK (role IN ('owner','optometrist','optician','cashier','staff')),
                pin_hash   TEXT,
                active     INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO staff (name, role) VALUES ('Owner', 'owner');

            CREATE TABLE audit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
                staff_name TEXT,
                action     TEXT NOT NULL,
                entity     TEXT,
                entity_id  INTEGER,
                detail     TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_audit_created ON audit_log(created_at);

            CREATE TABLE job_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                status     TEXT NOT NULL,
                note       TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_job_events_job ON job_events(job_id);

            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('manager_pin_hash', ''),
                ('discount_pin_threshold', '2000'),
                ('auto_backup_enabled', '0'),
                ('auto_backup_interval_days', '1'),
                ('auto_backup_keep', '14'),
                ('last_auto_backup', '');
        "#,
        },
    ]
}

/// Writes the typed TypeScript client to `src/lib/bindings.ts`.
/// Only compiled in debug builds; the `@ts-nocheck` header keeps the
/// generated file out of the project's lint/type-check.
#[cfg(debug_assertions)]
fn export_bindings(builder: &Builder) {
    builder
        .export(
            specta_typescript::Typescript::default()
                // i64 ids/centimes stay within JS safe-integer range, so export them
                // as `number` (matching the TS row types) rather than `bigint`.
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("// @ts-nocheck\n/* eslint-disable */\n"),
            "../src/lib/bindings.ts",
        )
        .expect("failed to export typescript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Linux, WebKitGTK feeds keyboard input through GTK's input-method (IM)
    // module. When the session advertises ibus (XMODIFIERS=@im=ibus) but the
    // process can't reach the ibus daemon socket, GTK selects the ibus module,
    // fails to connect ("Unable to connect to ibus"), then queues every keystroke
    // waiting for ibus until the queue overflows and the events are dropped
    // ("Events queue growing too big, will start to drop"). The visible result is
    // that text fields focus but accept no typed characters.
    //
    // Pin GTK to its built-in "simple" input context, which needs no daemon and
    // passes keystrokes straight through (Latin, French and Arabic via the system
    // keyboard layout all work). Only do this when the user hasn't chosen an IM
    // module themselves, so anyone who relies on a real IME can still override it
    // by exporting GTK_IM_MODULE. Must run before Tauri initializes GTK.
    #[cfg(target_os = "linux")]
    {
        let unset = match std::env::var_os("GTK_IM_MODULE") {
            Some(value) => value.is_empty(),
            None => true,
        };
        if unset {
            std::env::set_var("GTK_IM_MODULE", "gtk-im-context-simple");
        }
    }

    let builder = specta_builder();

    // Regenerate TypeScript bindings on every dev build.
    #[cfg(debug_assertions)]
    export_bindings(&builder);

    let mut app = tauri::Builder::default();

    // Desktop-only plugins. `single_instance` must be registered first.
    #[cfg(desktop)]
    {
        use tauri::Manager;
        app = app
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_process::init());
    }

    app.plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:app.db", migrations())
                .build(),
        )
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            // If WAL can't be enabled the app must still start; it just keeps
            // yesterday's locking behaviour.
            if let Err(e) = init_sqlite_wal(app.handle()) {
                eprintln!("warning: could not enable WAL journal mode: {e}");
            }
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generates `src/lib/bindings.ts`. Run with `cargo test export_bindings`.
    #[test]
    fn export_bindings() {
        super::export_bindings(&specta_builder());
    }

    #[test]
    fn escpos_has_init_and_cut() {
        let lines = vec![ReceiptLine {
            text: "Opt DZ".into(),
            align: "center".into(),
            bold: true,
            big: true,
        }];
        let bytes = build_escpos(&lines);
        assert_eq!(&bytes[0..2], &[0x1B, 0x40], "starts with ESC @ init");
        assert!(
            bytes.windows(2).any(|w| w == [0x1B, 0x61]),
            "contains an alignment command"
        );
        assert!(
            bytes.windows(4).any(|w| w == [0x1D, 0x56, 0x42, 0x00]),
            "ends with a partial cut"
        );
        assert!(
            bytes.windows(6).any(|w| w == "Opt DZ".as_bytes()),
            "contains the line text"
        );
    }
}
