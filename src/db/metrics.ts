/**
 * The single source of truth for every financial figure in the app.
 *
 * Before this module existed, "revenue", "collected" and "outstanding" were each
 * computed three or four different ways across the dashboard, the reports page
 * and the sales list — so the same shop, the same day, showed different numbers
 * depending on which screen you were looking at. Every report now derives from
 * the definitions here, and `tests/integration/cross-report-consistency.test.ts`
 * asserts they agree.
 *
 * ## Conventions
 *
 * **Money** is integer centimes everywhere. Columns added before migration v20
 * are declared `REAL` but only ever hold whole centimes, so anything that could
 * produce a fraction is rounded back to an integer before it leaves this module.
 *
 * **Dates.** Two different things are stored, and conflating them is what caused
 * the off-by-one-day bugs:
 *
 * | Column | Stored as | Predicate |
 * |---|---|---|
 * | `sales.sale_date` | local `YYYY-MM-DD` (the POS writes the till's day) | {@link SALE_DAY} |
 * | `payments.paid_at`, `credit_notes.created_at`, … | UTC `YYYY-MM-DD HH:MM:SS` | {@link utcDay} |
 *
 * Algeria is UTC+1, so a payment taken at 00:30 local is stored as 23:30 the
 * *previous* UTC day. Filtering it without `'localtime'` reports the takings on
 * the wrong day. Never write a date predicate by hand — use the helpers.
 *
 * **Accrual vs cash.** `revenue*` is accrual, by invoice date, net of all credit
 * notes. `collected` is cash, by payment date. They are different numbers on
 * purpose and are labelled distinctly in the UI ("Facturé" vs "Encaissé").
 *
 * **Tax.** TVA is *contained in* `sales.total` (extracted, not added), while
 * droit de timbre is *not* in `total` at all — it is added to what the customer
 * owes. Both are collected on behalf of the state, so the P&L works in HT.
 */
import { getDb } from "@/lib/db";

/** An inclusive range of local calendar days, both `YYYY-MM-DD`. */
export interface Period {
  from: string;
  to: string;
  /**
   * Optional: restrict every figure to one customer. Used by the sales list,
   * where filtering to a patient must narrow the money as well as the rows —
   * otherwise the header would report the whole shop's takings beside a single
   * customer's invoices.
   *
   * Walk-in sales have a null `patient_id` and so are excluded when set.
   */
  patientId?: number | null;
}

/**
 * `AND <col> = $n` when the period is scoped to a patient, else empty.
 * Pushes the id onto `params` so callers keep their placeholder numbering.
 */
function patientClause(p: Period, col: string, params: unknown[]): string {
  if (!p.patientId) return "";
  params.push(p.patientId);
  return ` AND ${col} = $${params.length}`;
}

// ---------------------------------------------------------------------------
// Date predicates
// ---------------------------------------------------------------------------

/**
 * Local day of a **UTC timestamp** column (`paid_at`, `created_at`, …).
 * The `'localtime'` modifier is what makes an Algiers 00:30 payment count
 * against the day the till actually saw it.
 */
export const utcDay = (col: string): string => `date(${col}, 'localtime')`;

/**
 * Local day of `sales.sale_date`, which the POS already writes as a local
 * date-only string — applying `'localtime'` to it a second time would shift it
 * backwards by an hour and drop early-morning sales into the previous day.
 */
export const SALE_DAY = (alias = "") => `date(${alias ? `${alias}.` : ""}sale_date)`;

/** `col BETWEEN from AND to` for a UTC timestamp column, using $n placeholders. */
export const utcDayBetween = (col: string, a: number, b: number): string =>
  `${utcDay(col)} >= date($${a}) AND ${utcDay(col)} <= date($${b})`;

/** `sale_date BETWEEN from AND to`. */
export const saleDayBetween = (alias: string, a: number, b: number): string =>
  `${SALE_DAY(alias)} >= date($${a}) AND ${SALE_DAY(alias)} <= date($${b})`;

/** Excludes voided invoices — they are fiscally retained but carry no money. */
export const LIVE_SALE = (alias = "s") => `${alias}.status <> 'void'`;

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------

/**
 * TVA contained in a credit note, derived from the linked sale's *historical*
 * rate. Credit notes carry no tax breakdown of their own.
 *
 * Both operands are `INTEGER`-declared, so `/` is integer division and matches
 * the Rust `net_ht = total * 10000 / (10000 + rate)` truncation exactly. If
 * either column ever becomes `REAL` this silently turns into float division —
 * `credit_note_tva_matches_the_rust_truncation` is the guard against that.
 */
const CN_TVA = `CASE WHEN s.tax_rate > 0
                     THEN cn.total - (cn.total * 10000) / (10000 + s.tax_rate)
                     ELSE 0 END`;

// ---------------------------------------------------------------------------
// Revenue (accrual)
// ---------------------------------------------------------------------------

export interface RevenueTotals {
  /** Invoiced goods, TTC, net of all credit notes. */
  ttc: number;
  /** Revenue excluding TVA — the figure the P&L is built on. */
  ht: number;
  /** TVA contained in the above, net of refunded TVA. */
  tva: number;
  /** Droit de timbre billed. Not part of revenue; collected for the state. */
  timbre: number;
  /** Credit notes issued in the period, TTC, all methods. */
  refunds: number;
  /** Gross invoiced before credit notes, TTC. */
  grossTtc: number;
  salesCount: number;
}

/**
 * Revenue for a period, on the agreed definition: **accrual, net of all credit
 * notes regardless of refund method**.
 *
 * A credit note reverses a sale whether the customer got cash back, or the
 * amount was written off their balance — in both cases the shop did not keep
 * that revenue, so both reduce it.
 */
export async function getRevenue(p: Period): Promise<RevenueTotals> {
  const db = await getDb();
  const saleParams: unknown[] = [p.from, p.to];
  const cnParams: unknown[] = [p.from, p.to];
  const [saleRows, cnRows] = await Promise.all([
    db.select<{ cnt: number; ttc: number; tva: number; timbre: number }[]>(
      `SELECT COUNT(*) AS cnt,
              CAST(COALESCE(SUM(s.total), 0) AS INTEGER) AS ttc,
              CAST(COALESCE(SUM(s.tax_amount), 0) AS INTEGER) AS tva,
              CAST(COALESCE(SUM(s.timbre_amount), 0) AS INTEGER) AS timbre
         FROM sales s
        WHERE ${LIVE_SALE()} AND ${saleDayBetween("s", 1, 2)}
              ${patientClause(p, "s.patient_id", saleParams)}`,
      saleParams,
    ),
    db.select<{ total: number; tva: number }[]>(
      `SELECT CAST(COALESCE(SUM(cn.total), 0) AS INTEGER) AS total,
              CAST(COALESCE(SUM(${CN_TVA}), 0) AS INTEGER) AS tva
         FROM credit_notes cn
         LEFT JOIN sales s ON s.id = cn.sale_id
        WHERE ${utcDayBetween("cn.created_at", 1, 2)}
              ${patientClause(p, "cn.patient_id", cnParams)}`,
      cnParams,
    ),
  ]);

  const s = saleRows[0] ?? { cnt: 0, ttc: 0, tva: 0, timbre: 0 };
  const cn = cnRows[0] ?? { total: 0, tva: 0 };

  const ttc = s.ttc - cn.total;
  const tva = s.tva - cn.tva;
  return {
    ttc,
    ht: ttc - tva,
    tva,
    timbre: s.timbre,
    refunds: cn.total,
    grossTtc: s.ttc,
    salesCount: s.cnt,
  };
}

// ---------------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------------

/**
 * Money that actually moved through the till in the period: payments received,
 * less cash paid back out.
 *
 * Only `method = 'refund'` credit notes move cash — a `'balance'` credit note
 * reduces what is owed without any money changing hands, so it must not appear
 * here (it is already reflected in revenue).
 */
export async function getCollected(p: Period): Promise<number> {
  const db = await getDb();
  const params: unknown[] = [p.from, p.to];
  const payerScope = p.patientId
    ? ` AND EXISTS (SELECT 1 FROM sales s WHERE s.id = payments.sale_id
                     ${patientClause(p, "s.patient_id", params)})`
    : "";
  const cnScope = patientClause(p, "patient_id", params);
  const rows = await db.select<{ total: number }[]>(
    `SELECT CAST(
              COALESCE((SELECT SUM(amount) FROM payments
                         WHERE ${utcDayBetween("paid_at", 1, 2)}${payerScope}), 0)
            - COALESCE((SELECT SUM(total) FROM credit_notes
                         WHERE method = 'refund'
                           AND ${utcDayBetween("created_at", 1, 2)}${cnScope}), 0)
            AS INTEGER) AS total`,
    params,
  );
  return rows[0]?.total ?? 0;
}

export interface DayPoint {
  day: string;
  amount: number;
}

/** Cash per local day. Sparse — days with no movement are absent. */
export async function getCollectedByDay(p: Period): Promise<DayPoint[]> {
  const db = await getDb();
  return db.select<DayPoint[]>(
    `SELECT day, CAST(SUM(amt) AS INTEGER) AS amount FROM (
       SELECT ${utcDay("paid_at")} AS day, amount AS amt FROM payments
        WHERE ${utcDayBetween("paid_at", 1, 2)}
       UNION ALL
       SELECT ${utcDay("created_at")} AS day, -total FROM credit_notes
        WHERE method = 'refund' AND ${utcDayBetween("created_at", 1, 2)}
     )
     GROUP BY day ORDER BY day`,
    [p.from, p.to],
  );
}

/** Accrual revenue (TTC, net of credit notes) per local day. Sparse. */
export async function getRevenueByDay(p: Period): Promise<DayPoint[]> {
  const db = await getDb();
  return db.select<DayPoint[]>(
    `SELECT day, CAST(SUM(amt) AS INTEGER) AS amount FROM (
       SELECT ${SALE_DAY("s")} AS day, s.total AS amt
         FROM sales s WHERE ${LIVE_SALE()} AND ${saleDayBetween("s", 1, 2)}
       UNION ALL
       SELECT ${utcDay("cn.created_at")} AS day, -cn.total
         FROM credit_notes cn WHERE ${utcDayBetween("cn.created_at", 1, 2)}
     )
     GROUP BY day ORDER BY day`,
    [p.from, p.to],
  );
}

// ---------------------------------------------------------------------------
// Cost of goods sold
// ---------------------------------------------------------------------------

/**
 * COGS for the period, from the `unit_cost` snapshot taken at sale time, less
 * the cost of goods returned in the period.
 *
 * Using the snapshot rather than the product's current `purchase_price` is what
 * keeps historical margin stable when a later delivery changes the cost price.
 */
export async function getCogs(p: Period): Promise<number> {
  const db = await getDb();
  const params: unknown[] = [p.from, p.to];
  const soldScope = patientClause(p, "s.patient_id", params);
  const returnScope = patientClause(p, "cn.patient_id", params);
  const rows = await db.select<{ sold: number; returned: number }[]>(
    `SELECT
       CAST(COALESCE((
         SELECT SUM(si.unit_cost * si.quantity)
           FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE ${LIVE_SALE()} AND ${saleDayBetween("s", 1, 2)}${soldScope}
       ), 0) AS INTEGER) AS sold,
       CAST(COALESCE((
         SELECT SUM(si.unit_cost * cni.quantity)
           FROM credit_note_items cni
           JOIN credit_notes cn ON cn.id = cni.credit_note_id
           JOIN sale_items si ON si.id = cni.sale_item_id
          WHERE ${utcDayBetween("cn.created_at", 1, 2)}${returnScope}
       ), 0) AS INTEGER) AS returned`,
    params,
  );
  const r = rows[0] ?? { sold: 0, returned: 0 };
  return r.sold - r.returned;
}

// ---------------------------------------------------------------------------
// Receivables
// ---------------------------------------------------------------------------

export interface DebtTotals {
  /** Still unpaid at the end of the period, from invoices raised in it. */
  amount: number;
  /** How many of those invoices were still unpaid. */
  count: number;
}

/**
 * Debt created by invoices raised in the period, measured **as at the end of
 * the period**.
 *
 * Deliberately *not* `SUM(sales.balance)`: `balance` is a live column, so a
 * payment received today would retroactively shrink last January's reported
 * debt, and the same closed period would report a different number every time
 * it was opened. This derives from immutable facts — the invoice, and the
 * payments that existed by the period's end — so a closed period is stable
 * forever.
 */
export async function getPeriodDebt(p: Period): Promise<DebtTotals> {
  const db = await getDb();
  const debtParams: unknown[] = [p.from, p.to];
  const rows = await db.select<{ amount: number; count: number }[]>(
    `WITH due AS (
       SELECT s.id,
              s.total + s.timbre_amount
              - COALESCE((SELECT c.covered_amount FROM claims c WHERE c.sale_id = s.id), 0)
              - COALESCE((SELECT SUM(cn.total) FROM credit_notes cn
                           WHERE cn.sale_id = s.id AND cn.method = 'balance'
                             AND ${utcDay("cn.created_at")} <= date($2)), 0)
              - COALESCE((SELECT SUM(pm.amount) FROM payments pm
                           WHERE pm.sale_id = s.id
                             AND ${utcDay("pm.paid_at")} <= date($2)), 0) AS owed
         FROM sales s
        WHERE ${LIVE_SALE()} AND ${saleDayBetween("s", 1, 2)}
              ${patientClause(p, "s.patient_id", debtParams)}
     )
     SELECT CAST(COALESCE(SUM(CASE WHEN owed > 0 THEN owed ELSE 0 END), 0) AS INTEGER) AS amount,
            COALESCE(SUM(CASE WHEN owed > 0 THEN 1 ELSE 0 END), 0) AS count
       FROM due`,
    debtParams,
  );
  return rows[0] ?? { amount: 0, count: 0 };
}

export interface ReceivablesNow {
  /** Owed by customers right now. */
  patients: number;
  /** Owed by insurers right now (submitted or pending claims). */
  insurers: number;
}

/**
 * Live accounts receivable — a point-in-time figure, not a period one.
 *
 * Insurer-covered amounts are subtracted from `sales.balance` when the sale is
 * created, so they are invisible in the customer balance. They are still money
 * owed to the shop, so they are reported here as a separate line rather than
 * silently vanishing.
 */
export async function getReceivablesNow(): Promise<ReceivablesNow> {
  const db = await getDb();
  const rows = await db.select<ReceivablesNow[]>(
    `SELECT
       CAST(COALESCE((SELECT SUM(balance) FROM sales
                       WHERE balance > 0 AND status <> 'void'), 0) AS INTEGER) AS patients,
       CAST(COALESCE((SELECT SUM(c.covered_amount - c.paid_amount)
                        FROM claims c JOIN sales s ON s.id = c.sale_id
                       WHERE s.status <> 'void'
                         AND c.status NOT IN ('rejected', 'paid')
                         AND c.covered_amount > c.paid_amount), 0) AS INTEGER) AS insurers`,
  );
  return rows[0] ?? { patients: 0, insurers: 0 };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * The one definition of "low stock", shared by the dashboard count, the stock
 * list and the notifications badge.
 *
 * Variant-tracked products are low when *any* live variant is at or below its
 * own threshold; simple products use their own quantity. The parent row's
 * `quantity` is not a variant sum, so it must not be consulted for variant
 * products. Services and archived rows never count.
 */
export const LOW_STOCK_IDS = `
  SELECT p.id AS product_id FROM products p
   WHERE p.item_type = 'product' AND p.archived = 0
     AND NOT EXISTS (SELECT 1 FROM product_variants v
                      WHERE v.product_id = p.id AND v.archived = 0)
     AND p.quantity <= p.min_stock
  UNION
  SELECT v.product_id FROM product_variants v
    JOIN products p ON p.id = v.product_id
   WHERE p.item_type = 'product' AND p.archived = 0 AND v.archived = 0
     AND v.quantity <= v.min_stock`;

export async function getLowStockCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM (${LOW_STOCK_IDS})`,
  );
  return rows[0]?.cnt ?? 0;
}

export interface InventoryValuation {
  productCount: number;
  totalUnits: number;
  /** Money tied up in stock at cost — "stock investment". */
  totalCost: number;
  /** Retail value if everything sold at list price. */
  totalValue: number;
  /** Unrealised margin: `totalValue - totalCost`. Not profit. */
  potentialMargin: number;
}

/**
 * Whole-inventory valuation at **latest cost** (the current `purchase_price`),
 * which is what the shop has tied up in stock today.
 *
 * This is deliberately not the same basis as COGS: realised margin uses the
 * `unit_cost` snapshot from the moment of sale, so the two figures answer
 * different questions and are never expected to reconcile.
 *
 * Negative on-hand (from a data glitch) is clamped to zero so it cannot
 * subtract from the money totals. `MAX(a, b)` here is SQLite's two-argument
 * scalar max, not the aggregate.
 */
export async function getInventoryValuation(): Promise<InventoryValuation> {
  const db = await getDb();
  const rows = await db.select<Omit<InventoryValuation, "potentialMargin">[]>(
    `WITH agg AS (
       SELECT
         (SELECT COUNT(*) FROM product_variants v
           WHERE v.product_id = p.id AND v.archived = 0) AS vcount,
         (SELECT COALESCE(SUM(MAX(v.quantity, 0)), 0) FROM product_variants v
           WHERE v.product_id = p.id AND v.archived = 0) AS vunits,
         (SELECT COALESCE(SUM(MAX(v.quantity, 0) * COALESCE(v.purchase_price, p.purchase_price)), 0)
            FROM product_variants v
           WHERE v.product_id = p.id AND v.archived = 0) AS vcost,
         (SELECT COALESCE(SUM(MAX(v.quantity, 0) * COALESCE(v.selling_price, p.selling_price)), 0)
            FROM product_variants v
           WHERE v.product_id = p.id AND v.archived = 0) AS vvalue,
         MAX(p.quantity, 0) AS punits,
         p.purchase_price AS pcost,
         p.selling_price AS pprice
       FROM products p
      WHERE p.archived = 0 AND p.item_type = 'product'
     )
     SELECT COUNT(*) AS productCount,
            CAST(COALESCE(SUM(CASE WHEN vcount > 0 THEN vunits ELSE punits END), 0) AS INTEGER) AS totalUnits,
            CAST(COALESCE(SUM(CASE WHEN vcount > 0 THEN vcost  ELSE punits * pcost  END), 0) AS INTEGER) AS totalCost,
            CAST(COALESCE(SUM(CASE WHEN vcount > 0 THEN vvalue ELSE punits * pprice END), 0) AS INTEGER) AS totalValue
       FROM agg`,
  );
  const r = rows[0] ?? { productCount: 0, totalUnits: 0, totalCost: 0, totalValue: 0 };
  return { ...r, potentialMargin: r.totalValue - r.totalCost };
}

// ---------------------------------------------------------------------------
// Expenses and profit & loss
// ---------------------------------------------------------------------------

export interface ExpenseLine {
  category: string;
  amount: number;
}

/** Operating expenses in the period, by category. */
export async function getExpensesByCategory(p: Period): Promise<ExpenseLine[]> {
  const db = await getDb();
  return db.select<ExpenseLine[]>(
    `SELECT category, CAST(COALESCE(SUM(amount), 0) AS INTEGER) AS amount
       FROM expenses
      WHERE date(expense_date) >= date($1) AND date(expense_date) <= date($2)
      GROUP BY category
      ORDER BY amount DESC`,
    [p.from, p.to],
  );
}

export async function getExpensesTotal(p: Period): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT CAST(COALESCE(SUM(amount), 0) AS INTEGER) AS total
       FROM expenses
      WHERE date(expense_date) >= date($1) AND date(expense_date) <= date($2)`,
    [p.from, p.to],
  );
  return rows[0]?.total ?? 0;
}

/** Stock bought from suppliers in the period. Cash-flow context, *not* a P&L line. */
export async function getStockPurchased(p: Period): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT CAST(COALESCE(SUM(amount), 0) AS INTEGER) AS total
       FROM supplier_ledger
      WHERE type IN ('purchase', 'debt')
        AND ${utcDayBetween("created_at", 1, 2)}`,
    [p.from, p.to],
  );
  return rows[0]?.total ?? 0;
}

export interface ProfitAndLoss {
  /** Invoiced TTC, net of credit notes — ties back to the invoices. */
  revenueTtc: number;
  tva: number;
  timbre: number;
  /** Revenue excluding TVA. The basis for everything below. */
  revenueHt: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  expenseLines: ExpenseLine[];
  netProfit: number;
  /** Not deducted — inventory hits the P&L as COGS when it sells. */
  stockPurchased: number;
  /** Cash actually received in the period, for comparison against accrual. */
  collected: number;
}

/**
 * Profit & loss for a period, stated **HT** (excluding TVA).
 *
 *     revenue HT − COGS = gross margin − operating expenses = net profit
 *
 * TVA and droit de timbre are excluded: both are collected on behalf of the
 * state and were never the shop's money. `revenueTtc`/`tva`/`timbre` are
 * returned so the UI can show the TTC→HT reconciliation, because staff
 * recognise the TTC figure from the invoices they issued.
 *
 * Stock purchases are **not** deducted. Buying inventory converts cash into an
 * asset; the cost reaches the P&L as COGS when that stock is sold. Deducting
 * both would double-count it. It is reported alongside for cash awareness.
 */
export async function getProfitAndLoss(p: Period): Promise<ProfitAndLoss> {
  const [revenue, cogs, expenseLines, expenses, stockPurchased, collected] =
    await Promise.all([
      getRevenue(p),
      getCogs(p),
      getExpensesByCategory(p),
      getExpensesTotal(p),
      getStockPurchased(p),
      getCollected(p),
    ]);

  const grossMargin = revenue.ht - cogs;
  return {
    revenueTtc: revenue.ttc,
    tva: revenue.tva,
    timbre: revenue.timbre,
    revenueHt: revenue.ht,
    cogs,
    grossMargin,
    expenses,
    expenseLines,
    netProfit: grossMargin - expenses,
    stockPurchased,
    collected,
  };
}
