import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/format";

export interface DashboardStats {
  todaySalesTotal: number; // billed today (non-void), centimes
  todayCollected: number; // cash actually collected today, centimes
  todayInvoiceCount: number;
  lowStockCount: number;
  outstandingTotal: number;
}

export interface RevenuePoint {
  day: string; // YYYY-MM-DD
  revenue: number;
}

export interface BestSeller {
  product_id: number | null;
  description: string;
  units: number;
  revenue: number;
}

export interface OutstandingRow {
  patient_id: number;
  patient_name: string;
  sales_count: number;
  outstanding: number;
}

/** Headline figures for the dashboard home screen. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDb();
  const [todayRows, collectedRows, lowRows, outRows] = await Promise.all([
    // Billed today: non-void invoices dated today (local day).
    db.select<{ cnt: number; total: number }[]>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS total
       FROM sales
       WHERE status <> 'void' AND date(sale_date) = date('now','localtime')`,
    ),
    // Collected today: cash actually taken today (by payment date), minus cash refunds.
    db.select<{ total: number }[]>(
      `SELECT COALESCE((SELECT SUM(amount) FROM payments WHERE date(paid_at) = date('now','localtime')), 0)
            - COALESCE((SELECT SUM(total) FROM credit_notes
                        WHERE method = 'refund' AND date(created_at) = date('now','localtime')), 0)
            AS total`,
    ),
    // Low stock: variant products with any low variant, OR simple products at/below
    // their threshold. Services and archived products are excluded.
    db.select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT p.id FROM products p
         WHERE p.item_type = 'product' AND p.archived = 0
           AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0)
           AND p.quantity <= p.min_stock
         UNION
         SELECT v.product_id FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE p.item_type = 'product' AND p.archived = 0 AND v.archived = 0
           AND v.quantity <= v.min_stock
       )`,
    ),
    db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(balance), 0) AS total FROM sales WHERE balance > 0 AND status <> 'void'",
    ),
  ]);
  return {
    todaySalesTotal: todayRows[0]?.total ?? 0,
    todayCollected: collectedRows[0]?.total ?? 0,
    todayInvoiceCount: todayRows[0]?.cnt ?? 0,
    lowStockCount: lowRows[0]?.cnt ?? 0,
    outstandingTotal: outRows[0]?.total ?? 0,
  };
}

/** Daily revenue over the last N days, net of returns and excluding void invoices,
 * including empty days. */
export async function getRevenueByDay(days = 14): Promise<RevenuePoint[]> {
  const db = await getDb();
  const rows = await db.select<RevenuePoint[]>(
    `SELECT day, COALESCE(SUM(amt), 0) AS revenue FROM (
       SELECT date(sale_date) AS day, total AS amt
         FROM sales
         WHERE status <> 'void' AND date(sale_date) >= date('now','localtime', $1)
       UNION ALL
       SELECT date(created_at) AS day, -total AS amt
         FROM credit_notes
         WHERE date(created_at) >= date('now','localtime', $1)
     )
     GROUP BY day
     ORDER BY day`,
    [`-${days - 1} days`],
  );
  // Fill gaps so the chart shows a continuous axis (local-day keys, matching SQL).
  const map = new Map(rows.map((r) => [r.day, r.revenue]));
  const out: RevenuePoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = todayISO(d);
    out.push({ day: key, revenue: map.get(key) ?? 0 });
  }
  return out;
}

/** Revenue within an inclusive date range, net of returns and excluding void invoices. */
export async function getRevenueInRange(
  from: string,
  to: string,
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT
       COALESCE((SELECT SUM(total) FROM sales
                 WHERE status <> 'void' AND date(sale_date) >= date($1) AND date(sale_date) <= date($2)), 0)
     - COALESCE((SELECT SUM(total) FROM credit_notes
                 WHERE date(created_at) >= date($1) AND date(created_at) <= date($2)), 0)
       AS total`,
    [from, to],
  );
  return rows[0]?.total ?? 0;
}

export interface TaxTotals {
  tva: number; // TVA collected (centimes)
  timbre: number; // droit de timbre collected (centimes)
}

/** TVA and timbre collected within an inclusive date range. */
export async function getTaxInRange(
  from: string,
  to: string,
): Promise<TaxTotals> {
  const db = await getDb();
  const rows = await db.select<TaxTotals[]>(
    `SELECT COALESCE(SUM(tax_amount), 0) AS tva, COALESCE(SUM(timbre_amount), 0) AS timbre
     FROM sales
     WHERE status <> 'void' AND date(sale_date) >= date($1) AND date(sale_date) <= date($2)`,
    [from, to],
  );
  return rows[0] ?? { tva: 0, timbre: 0 };
}

/** Top-selling products by units sold within a date range. */
export async function getBestSellers(
  from: string,
  to: string,
  limit = 10,
): Promise<BestSeller[]> {
  const db = await getDb();
  // Group by product_id (free-text lines fall back to their description), net of
  // returns, excluding void invoices. Fully-returned products drop out (units <= 0).
  return db.select<BestSeller[]>(
    `SELECT MAX(product_id) AS product_id, MIN(description) AS description,
            SUM(units) AS units, SUM(revenue) AS revenue
     FROM (
       SELECT si.product_id, si.description, si.quantity AS units, si.line_total AS revenue,
              COALESCE(CAST(si.product_id AS TEXT), 'd:' || si.description) AS gk
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status <> 'void' AND date(s.sale_date) >= date($1) AND date(s.sale_date) <= date($2)
       UNION ALL
       SELECT cni.product_id, cni.description, -cni.quantity, -cni.line_total,
              COALESCE(CAST(cni.product_id AS TEXT), 'd:' || cni.description)
         FROM credit_note_items cni JOIN credit_notes cn ON cn.id = cni.credit_note_id
         WHERE date(cn.created_at) >= date($1) AND date(cn.created_at) <= date($2)
     )
     GROUP BY gk
     HAVING SUM(units) > 0
     ORDER BY units DESC, revenue DESC
     LIMIT $3`,
    [from, to, limit],
  );
}

/** Patients with an outstanding balance, largest first. */
export async function getOutstandingBalances(): Promise<OutstandingRow[]> {
  const db = await getDb();
  return db.select<OutstandingRow[]>(
    `SELECT s.patient_id AS patient_id,
            p.full_name AS patient_name,
            COUNT(*) AS sales_count,
            SUM(s.balance) AS outstanding
     FROM sales s JOIN patients p ON p.id = s.patient_id
     WHERE s.balance > 0 AND s.status <> 'void'
     GROUP BY s.patient_id
     ORDER BY outstanding DESC`,
  );
}

import type { SaleWithPatient } from "@/types";

export interface RecallRow {
  patient_id: number;
  patient_name: string;
  phone: string | null;
  last_exam: string;
  expiry_date: string | null;
}

/**
 * Patients due for a recall: their most recent exam is older than `months` months,
 * or that prescription's expiry date has passed. Oldest first.
 */
export async function getDueRecalls(
  months: number,
  limit = 50,
): Promise<RecallRow[]> {
  const db = await getDb();
  return db.select<RecallRow[]>(
    `WITH latest AS (
       SELECT patient_id, MAX(exam_date) AS last_exam
       FROM prescriptions GROUP BY patient_id
     )
     SELECT p.id AS patient_id, p.full_name AS patient_name, p.phone AS phone,
            l.last_exam AS last_exam, rx.expiry_date AS expiry_date
     FROM latest l
     JOIN patients p ON p.id = l.patient_id
     JOIN prescriptions rx ON rx.patient_id = l.patient_id AND rx.exam_date = l.last_exam
     WHERE date(l.last_exam) <= date('now', $1)
        OR (rx.expiry_date IS NOT NULL AND date(rx.expiry_date) < date('now'))
     GROUP BY p.id
     ORDER BY l.last_exam ASC
     LIMIT $2`,
    [`-${months} months`, limit],
  );
}

/** Recent unpaid/partial sales for the dashboard "pending payments" list. */
export async function getPendingPayments(
  limit = 6,
): Promise<SaleWithPatient[]> {
  const db = await getDb();
  // LEFT JOIN so walk-in sales with a balance are not hidden (audit finding D4).
  return db.select<SaleWithPatient[]>(
    `SELECT s.*, p.full_name AS patient_name
     FROM sales s LEFT JOIN patients p ON p.id = s.patient_id
     WHERE s.balance > 0 AND s.status <> 'void'
     ORDER BY s.sale_date DESC
     LIMIT $1`,
    [limit],
  );
}
