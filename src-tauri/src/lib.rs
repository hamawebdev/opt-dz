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
    pub patient_id: i64,
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

/// Recomputes amount_paid/balance/status for a sale from the sum of its payments.
/// Money columns are REAL-affinity (integer centimes stored as f64), so values are
/// read as f64 and rounded back to integer centimes.
async fn sync_sale_balance(tx: &mut Transaction<'_, Sqlite>, sale_id: i64) -> Result<(), String> {
    // The patient owes goods (TTC) + timbre, minus the insurer-covered amount and
    // minus what they've already paid.
    let row = sqlx::query(
        "SELECT s.total + s.timbre_amount
                - COALESCE((SELECT covered_amount FROM claims WHERE sale_id = s.id), 0) AS due,
                COALESCE(SUM(p.amount), 0.0) AS paid
         FROM sales s LEFT JOIN payments p ON p.sale_id = s.id
         WHERE s.id = ?1 GROUP BY s.id",
    )
    .bind(sale_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(());
    };
    let due = row.try_get::<f64, _>("due").map_err(|e| e.to_string())?.round() as i64;
    let paid = row.try_get::<f64, _>("paid").map_err(|e| e.to_string())?.round() as i64;
    let balance = (due - paid).max(0);
    sqlx::query("UPDATE sales SET amount_paid = ?1, balance = ?2, status = ?3 WHERE id = ?4")
        .bind(paid)
        .bind(balance)
        .bind(status_for(due, paid))
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
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let subtotal: i64 = input.items.iter().map(line_total).sum();
    let discount = if input.discount_type == "percent" {
        ((subtotal as i128 * input.discount_value as i128) / 10_000) as i64
    } else {
        input.discount_value
    };
    let total = (subtotal - discount).max(0);

    // TVA is extracted from the tax-inclusive (TTC) total; droit de timbre is added
    // on cash sales. Rates/min/max come from `settings`, read inside the txn.
    let tax_rate = setting_i64(&mut tx, "tva_rate", 0).await?;
    let tax_amount = if tax_rate > 0 && total > 0 {
        let net_ht = ((total as i128 * 10_000) / (10_000 + tax_rate as i128)) as i64;
        total - net_ht
    } else {
        0
    };
    let timbre_amount = if input.payment_method.as_deref() == Some("cash") {
        let rate = setting_i64(&mut tx, "timbre_rate", 0).await?;
        if rate <= 0 {
            0
        } else {
            let tmin = setting_i64(&mut tx, "timbre_min", 0).await?;
            let tmax = setting_i64(&mut tx, "timbre_max", 0).await?;
            let mut t = ((total as i128 * rate as i128) / 10_000) as i64;
            if t < tmin {
                t = tmin;
            }
            if tmax > 0 && t > tmax {
                t = tmax;
            }
            t
        }
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
    let patient_due = total - covered + timbre_amount;
    let cash_paid = input.initial_payment.unwrap_or(0).clamp(0, patient_due);
    let paid = cash_paid;
    let balance = (patient_due - paid).max(0);

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

    // Validate stock before mutating anything; an early return drops `tx`, which
    // rolls back automatically. Services carry no stock, so they are skipped here
    // and recorded (below) so the deduction loop doesn't touch them either.
    let mut service_ids: Vec<i64> = Vec::new();
    for it in &input.items {
        // Variant-tracked line: validate against the variant's own stock.
        if let Some(vid) = it.variant_id {
            let row = sqlx::query("SELECT quantity FROM product_variants WHERE id = ?1")
                .bind(vid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            let Some(row) = row else {
                return Err(format!("Variant #{vid} no longer exists"));
            };
            let available: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
            if it.quantity > available {
                return Err(format!(
                    "Not enough stock for variant: need {}, have {available}",
                    it.quantity
                ));
            }
            continue;
        }
        if let Some(pid) = it.product_id {
            let row = sqlx::query("SELECT quantity, name, item_type FROM products WHERE id = ?1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            let Some(row) = row else {
                return Err(format!("Product #{pid} no longer exists"));
            };
            let item_type: String = row.try_get("item_type").unwrap_or_default();
            if item_type == "service" {
                service_ids.push(pid);
                continue;
            }
            let available: i64 = row.try_get("quantity").map_err(|e| e.to_string())?;
            if it.quantity > available {
                let name: String = row.try_get("name").unwrap_or_default();
                return Err(format!(
                    "Not enough stock for {name}: need {}, have {available}",
                    it.quantity
                ));
            }
        }
    }

    let sale_id: i64 = sqlx::query(
        "INSERT INTO sales (patient_id, prescription_id, sale_date, subtotal, discount_type,
            discount_value, total, tax_rate, tax_amount, timbre_amount, invoice_number,
            amount_paid, balance, status, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
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
    .bind(timbre_amount)
    .bind(&invoice_number)
    .bind(paid)
    .bind(balance)
    .bind(status_for(patient_due, paid))
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
        sqlx::query(
            "INSERT INTO sale_items
                (sale_id, product_id, variant_id, description, unit_price, quantity, item_discount, line_total)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )
        .bind(sale_id)
        .bind(it.product_id)
        .bind(it.variant_id)
        .bind(&it.description)
        .bind(it.unit_price)
        .bind(it.quantity)
        .bind(it.item_discount)
        .bind(line_total(it))
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
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
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
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM payments WHERE id = ?1")
        .bind(payment_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sync_sale_balance(&mut tx, sale_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Restores stock for a sale's items (logging adjustment movements) and deletes the
/// sale (cascading items/payments) in a single transaction.
#[tauri::command]
#[specta::specta]
async fn delete_sale(app: AppHandle, sale_id: i64) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
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
            .bind(format!("Reversed sale #{sale_id}"))
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
            .bind(format!("Reversed sale #{sale_id}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    sqlx::query("DELETE FROM sales WHERE id = ?1")
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
    pub method: String, // always "refund"
    pub notes: Option<String>,
    pub items: Vec<ReturnItemInput>,
}

/// Processes a return as a credit note: validates returnable quantities (against what
/// was sold minus already-returned), restocks the goods, and records the credit note
/// and its items as a cash refund. The original sale is left intact. Returns the new
/// credit-note id.
#[tauri::command]
#[specta::specta]
async fn create_return(app: AppHandle, input: CreateReturnInput) -> Result<i64, String> {
    if input.items.is_empty() {
        return Err("Select at least one item to return".into());
    }
    if input.method != "refund" {
        return Err("Invalid return method".into());
    }
    let pool = db_pool(&app).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let patient_id: i64 = sqlx::query("SELECT patient_id FROM sales WHERE id = ?1")
        .bind(input.sale_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .and_then(|r| r.try_get::<i64, _>("patient_id").ok())
        .ok_or("Sale not found")?;

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

        let per_unit = if orig_qty > 0 { line_total / orig_qty } else { 0 };
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

    let cn_id: i64 = sqlx::query(
        "INSERT INTO credit_notes (sale_id, patient_id, total, method, notes)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(input.sale_id)
    .bind(patient_id)
    .bind(total)
    .bind(&input.method)
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

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(cn_id)
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

/// Checkpoints the WAL so the `.db` file is self-contained, then copies it to
/// `dest_path` (a full path with filename chosen by the frontend). Returns the path.
#[tauri::command]
#[specta::specta]
async fn backup_database(app: AppHandle, dest_path: String) -> Result<String, String> {
    let src = db_file_path(&app)?;
    let pool = db_pool(&app).await?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    std::fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;
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
        delete_sale,
        create_return,
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
