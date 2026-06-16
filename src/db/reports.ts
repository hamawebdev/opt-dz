import { getDb } from "@/lib/db";

export interface DashboardStats {
  todaySalesTotal: number;
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
  const [todayRows, lowRows, outRows] = await Promise.all([
    db.select<{ cnt: number; total: number }[]>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS total
       FROM sales WHERE date(sale_date) = date('now','localtime')`,
    ),
    db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM products WHERE quantity <= min_stock",
    ),
    db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(balance), 0) AS total FROM sales WHERE balance > 0",
    ),
  ]);
  return {
    todaySalesTotal: todayRows[0]?.total ?? 0,
    todayInvoiceCount: todayRows[0]?.cnt ?? 0,
    lowStockCount: lowRows[0]?.cnt ?? 0,
    outstandingTotal: outRows[0]?.total ?? 0,
  };
}

/** Daily revenue (sum of sale totals) over the last N days, including empty days. */
export async function getRevenueByDay(days = 14): Promise<RevenuePoint[]> {
  const db = await getDb();
  const rows = await db.select<RevenuePoint[]>(
    `SELECT date(sale_date) AS day, COALESCE(SUM(total), 0) AS revenue
     FROM sales
     WHERE date(sale_date) >= date('now','localtime', $1)
     GROUP BY date(sale_date)
     ORDER BY day`,
    [`-${days - 1} days`],
  );
  // Fill gaps so the chart shows a continuous axis.
  const map = new Map(rows.map((r) => [r.day, r.revenue]));
  const out: RevenuePoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, revenue: map.get(key) ?? 0 });
  }
  return out;
}

/** Revenue (sum of sale totals) within an inclusive date range. */
export async function getRevenueInRange(from: string, to: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(total), 0) AS total FROM sales
     WHERE date(sale_date) >= date($1) AND date(sale_date) <= date($2)`,
    [from, to],
  );
  return rows[0]?.total ?? 0;
}

export interface TaxTotals {
  tva: number; // TVA collected (centimes)
  timbre: number; // droit de timbre collected (centimes)
}

/** TVA and timbre collected within an inclusive date range. */
export async function getTaxInRange(from: string, to: string): Promise<TaxTotals> {
  const db = await getDb();
  const rows = await db.select<TaxTotals[]>(
    `SELECT COALESCE(SUM(tax_amount), 0) AS tva, COALESCE(SUM(timbre_amount), 0) AS timbre
     FROM sales
     WHERE date(sale_date) >= date($1) AND date(sale_date) <= date($2)`,
    [from, to],
  );
  return rows[0] ?? { tva: 0, timbre: 0 };
}

/** Top-selling products by units sold within a date range. */
export async function getBestSellers(from: string, to: string, limit = 10): Promise<BestSeller[]> {
  const db = await getDb();
  return db.select<BestSeller[]>(
    `SELECT si.product_id AS product_id,
            si.description AS description,
            SUM(si.quantity) AS units,
            SUM(si.line_total) AS revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE date(s.sale_date) >= date($1) AND date(s.sale_date) <= date($2)
     GROUP BY si.description
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
     WHERE s.balance > 0
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
export async function getDueRecalls(months: number, limit = 50): Promise<RecallRow[]> {
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
export async function getPendingPayments(limit = 6): Promise<SaleWithPatient[]> {
  const db = await getDb();
  return db.select<SaleWithPatient[]>(
    `SELECT s.*, p.full_name AS patient_name
     FROM sales s JOIN patients p ON p.id = s.patient_id
     WHERE s.balance > 0
     ORDER BY s.sale_date DESC
     LIMIT $1`,
    [limit],
  );
}
