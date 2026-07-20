/**
 * Report queries for the dashboard and reports pages.
 *
 * Every monetary figure here delegates to `@/db/metrics`, which owns the one
 * definition of each metric. This module only shapes those numbers for the
 * screens. If you find yourself writing a `SUM(...)` over money in this file,
 * it belongs in `metrics.ts` instead — that is exactly how the dashboard and
 * the reports page drifted apart in the first place.
 */
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/format";
import {
  LOW_STOCK_IDS,
  SALE_DAY,
  getCollected,
  getLowStockCount,
  getReceivablesNow,
  getRevenue,
  getRevenueByDay as metricsRevenueByDay,
  getCollectedByDay as metricsCollectedByDay,
  getPeriodDebt,
  saleDayBetween,
  utcDayBetween,
  type Period,
} from "@/db/metrics";

export interface DashboardStats {
  todaySalesTotal: number; // billed today (non-void), net of today's credit notes
  todayCollected: number; // cash actually collected today
  todayInvoiceCount: number;
  lowStockCount: number;
  outstandingTotal: number; // owed by customers right now
  insurerReceivable: number; // owed by insurers right now
}

/**
 * Headline figures for the dashboard home screen.
 *
 * `today` is an explicit parameter rather than SQLite's `date('now')` so the
 * figure is reproducible: a hardcoded clock cannot be pinned by a test, which
 * left the dashboard the one screen no test could verify.
 */
export async function getDashboardStats(
  today: string = todayISO(),
): Promise<DashboardStats> {
  const p: Period = { from: today, to: today };
  const [revenue, collected, lowStockCount, receivable] = await Promise.all([
    getRevenue(p),
    getCollected(p),
    getLowStockCount(),
    getReceivablesNow(),
  ]);
  return {
    todaySalesTotal: revenue.ttc,
    todayCollected: collected,
    todayInvoiceCount: revenue.salesCount,
    lowStockCount,
    outstandingTotal: receivable.patients,
    insurerReceivable: receivable.insurers,
  };
}

export interface RevenuePoint {
  day: string; // YYYY-MM-DD
  revenue: number;
}

/** Daily revenue over the last N days, including empty days. */
export async function getRevenueByDay(
  days = 14,
  today: string = todayISO(),
): Promise<RevenuePoint[]> {
  const end = new Date(`${today}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  const rows = await metricsRevenueByDay({ from: todayISO(start), to: today });
  const map = new Map(rows.map((r) => [r.day, r.amount]));

  // Fill gaps so the chart shows a continuous axis.
  const out: RevenuePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = todayISO(d);
    out.push({ day: key, revenue: map.get(key) ?? 0 });
  }
  return out;
}

export interface ReportOverview {
  collected: number; // cash received in the period, less cash refunds
  billed: number; // accrual revenue TTC, net of all credit notes
  salesCount: number;
  avgSale: number; // gross billed / salesCount, 0 when no sales
  refunds: number; // credit notes issued in the period (all methods)
  newDebt: number; // still unpaid at period end, from invoices raised in it
  newDebtCount: number;
}

/**
 * Headline KPIs for the reports page over an inclusive local-day range.
 *
 * `collected` is cash by payment date; `billed` is accrual by invoice date. The
 * two deliberately differ — and note they can never be reconciled by simple
 * subtraction, because droit de timbre is collected as cash but is not part of
 * `sales.total`. The P&L reconciliation block is where that is spelled out.
 */
export async function getReportOverview(
  from: string,
  to: string,
): Promise<ReportOverview> {
  const p: Period = { from, to };
  const [revenue, collected, debt] = await Promise.all([
    getRevenue(p),
    getCollected(p),
    getPeriodDebt(p),
  ]);
  return {
    collected,
    billed: revenue.ttc,
    salesCount: revenue.salesCount,
    avgSale: revenue.salesCount
      ? Math.round(revenue.grossTtc / revenue.salesCount)
      : 0,
    refunds: revenue.refunds,
    newDebt: debt.amount,
    newDebtCount: debt.count,
  };
}

export interface CollectedPoint {
  day: string; // local YYYY-MM-DD
  collected: number;
}

/** Money collected per local day. Sparse; the chart zero-fills. */
export async function getCollectedByDay(
  from: string,
  to: string,
): Promise<CollectedPoint[]> {
  const rows = await metricsCollectedByDay({ from, to });
  return rows.map((r) => ({ day: r.day, collected: r.amount }));
}

export interface TaxTotals {
  tva: number; // TVA collected (centimes), net of refunded TVA
  timbre: number; // droit de timbre billed (centimes)
}

/**
 * TVA and timbre within an inclusive date range.
 *
 * TVA is net of refunds: credit notes carry no tax breakdown, so the refunded
 * TVA is extracted from the avoir total via the linked sale's historical rate.
 * Timbre stays gross — stamp duty is owed on the original invoice and is not
 * given back when goods are returned.
 */
export async function getTaxInRange(
  from: string,
  to: string,
): Promise<TaxTotals> {
  const r = await getRevenue({ from, to });
  return { tva: r.tva, timbre: r.timbre };
}

export interface BestSeller {
  product_id: number | null;
  description: string;
  units: number;
  revenue: number;
}

/** Top-selling products by units sold within a date range, net of returns. */
export async function getBestSellers(
  from: string,
  to: string,
  limit = 10,
): Promise<BestSeller[]> {
  const db = await getDb();
  // Grouped by product_id, with free-text lines falling back to their
  // description. Credit notes are joined back to their sale so lines belonging
  // to a voided invoice are excluded on both sides of the UNION — counting the
  // return without its sale would drive units negative.
  return db.select<BestSeller[]>(
    `SELECT MAX(product_id) AS product_id, MIN(description) AS description,
            SUM(units) AS units, CAST(SUM(revenue) AS INTEGER) AS revenue
     FROM (
       SELECT si.product_id, si.description, si.quantity AS units, si.line_total AS revenue,
              COALESCE(CAST(si.product_id AS TEXT), 'd:' || si.description) AS gk
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.status <> 'void' AND ${saleDayBetween("s", 1, 2)}
       UNION ALL
       SELECT cni.product_id, cni.description, -cni.quantity, -cni.line_total,
              COALESCE(CAST(cni.product_id AS TEXT), 'd:' || cni.description)
         FROM credit_note_items cni
         JOIN credit_notes cn ON cn.id = cni.credit_note_id
         LEFT JOIN sales s ON s.id = cn.sale_id
        WHERE (s.id IS NULL OR s.status <> 'void')
          AND ${utcDayBetween("cn.created_at", 1, 2)}
     )
     GROUP BY gk
     HAVING SUM(units) > 0
     ORDER BY units DESC, revenue DESC
     LIMIT $3`,
    [from, to, limit],
  );
}

export interface OutstandingRow {
  patient_id: number | null; // null = walk-in sales (grouped into one row)
  patient_name: string | null;
  sales_count: number;
  outstanding: number;
}

/**
 * Customers with an outstanding balance right now, largest first.
 *
 * This is a live point-in-time view, not a period figure — it answers "who owes
 * me money today". LEFT JOIN keeps walk-in sales (null patient) visible.
 */
export async function getOutstandingBalances(): Promise<OutstandingRow[]> {
  const db = await getDb();
  return db.select<OutstandingRow[]>(
    `SELECT s.patient_id AS patient_id,
            p.full_name AS patient_name,
            COUNT(*) AS sales_count,
            CAST(SUM(s.balance) AS INTEGER) AS outstanding
     FROM sales s LEFT JOIN patients p ON p.id = s.patient_id
     WHERE s.balance > 0 AND s.status <> 'void'
     GROUP BY s.patient_id
     ORDER BY outstanding DESC`,
  );
}

/** Products at or below their stock threshold — same definition as the badge. */
export async function getLowStockProductIds(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ product_id: number }[]>(LOW_STOCK_IDS);
  return rows.map((r) => r.product_id);
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
  // LEFT JOIN so walk-in sales with a balance are not hidden.
  return db.select<SaleWithPatient[]>(
    `SELECT s.*, p.full_name AS patient_name
     FROM sales s LEFT JOIN patients p ON p.id = s.patient_id
     WHERE s.balance > 0 AND s.status <> 'void'
     ORDER BY ${SALE_DAY("s")} DESC, s.id DESC
     LIMIT $1`,
    [limit],
  );
}
