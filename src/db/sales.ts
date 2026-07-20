import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import {
  getCogs,
  getCollected,
  getPeriodDebt,
  getRevenue,
  type Period,
} from "@/db/metrics";
import type { DiscountType, SaleItem, SaleWithPatient } from "@/types";

// All money values below are integer **centimes**. `discount_value` is centimes when
// `discount_type === 'amount'`, and **basis points** when `discount_type === 'percent'`
// (e.g. 1500 = 15.00%). See src/lib/format.ts for the dinar<->centimes boundary.
export interface SaleItemInput {
  product_id: number | null;
  variant_id?: number | null;
  description: string;
  unit_price: number; // centimes
  quantity: number;
  item_discount: number; // centimes off this line
}

export interface CreateSaleInput {
  patient_id: number | null; // null for a walk-in / quick sale (no customer)
  prescription_id: number | null;
  sale_date: string;
  discount_type: DiscountType;
  discount_value: number;
  notes?: string | null;
  items: SaleItemInput[];
  initial_payment?: number; // optional first payment
  payment_method?: string | null;
  payer_id?: number | null; // optional third-party payer
  coverage_pct?: number | null; // insurer coverage, basis points
}

export interface SaleListFilters {
  patientId?: number | null;
  from?: string | null; // inclusive date (YYYY-MM-DD)
  to?: string | null; // inclusive date (YYYY-MM-DD)
}

// The pure money math lives in `@/lib/sale-math` so it can be tested without
// pulling in the Tauri SQL plugin. Re-exported here for existing call sites.
export { computeTotals, lineTotal } from "@/lib/sale-math";

/**
 * Creates a sale atomically via the Rust `create_sale` command: it recomputes the
 * totals server-side (the client cannot tamper with them), validates stock, and
 * writes the sale + items + stock movements + optional initial payment in one
 * transaction. Returns the new sale id.
 */
export async function createSale(input: CreateSaleInput): Promise<number> {
  return unwrap(
    await commands.createSale({
      patient_id: input.patient_id,
      prescription_id: input.prescription_id,
      sale_date: input.sale_date,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      notes: input.notes ?? null,
      items: input.items.map((it) => ({
        ...it,
        variant_id: it.variant_id ?? null,
      })),
      initial_payment: input.initial_payment ?? null,
      payment_method: input.payment_method ?? null,
      payer_id: input.payer_id ?? null,
      coverage_pct: input.coverage_pct ?? null,
    }),
  );
}

/** Shared WHERE fragments (aliased `s`) for the sales list, its items column and
 * its KPI header, so all three always agree on what is being shown. */
function saleFilterParts(filters: SaleListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.patientId) {
    params.push(filters.patientId);
    where.push(`s.patient_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`date(s.sale_date) >= date($${params.length})`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`date(s.sale_date) <= date($${params.length})`);
  }
  return { where, params };
}

export async function listSales(
  filters: SaleListFilters = {},
): Promise<SaleWithPatient[]> {
  const db = await getDb();
  const { where, params } = saleFilterParts(filters);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<SaleWithPatient[]>(
    `SELECT s.*, p.full_name AS patient_name
     FROM sales s LEFT JOIN patients p ON p.id = s.patient_id
     ${clause}
     ORDER BY s.sale_date DESC, s.id DESC`,
    params,
  );
}

/** One line of a sale, as shown in the list's "Items" column. */
export interface SaleItemSummary {
  sale_id: number;
  description: string;
  quantity: number;
}

/** Items of every sale matching the list filters, in one query (no per-row fetch).
 * The page groups them by `sale_id`. */
export async function listSaleItemSummaries(
  filters: SaleListFilters = {},
): Promise<SaleItemSummary[]> {
  const db = await getDb();
  const { where, params } = saleFilterParts(filters);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<SaleItemSummary[]>(
    `SELECT si.sale_id AS sale_id, si.description AS description, si.quantity AS quantity
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     ${clause}
     ORDER BY si.sale_id, si.id`,
    params,
  );
}

// All money fields are integer centimes.
export interface SalesListStats {
  salesCount: number; // non-void invoices in the filtered set
  revenue: number; // accrual revenue TTC, net of credit notes
  collected: number; // cash received in the period
  netProfit: number; // gross margin: revenue HT minus COGS
  itemsSold: number; // units across all lines
  discounts: number; // line discounts + overall invoice discounts
  refunds: number; // credit notes issued (avoirs)
  outstanding: number; // still unpaid at period end from these invoices
  pendingCount: number; // invoices with a balance > 0
}

/**
 * KPI aggregates for the sales list header, honouring the same filters as the list.
 *
 * These delegate to `@/db/metrics` so the header shows the *same* numbers as the
 * reports page for the same range. Previously this computed its own gross
 * revenue while the reports page netted off credit notes, so the two screens
 * disagreed; and `collected` summed each invoice's lifetime `amount_paid`, which
 * counted payments made outside the filtered range.
 *
 * A patient filter narrows the money as well as the rows — a header reporting
 * the whole shop's takings next to one customer's invoices would be worse than
 * the bug it replaced.
 */
export async function getSalesListStats(
  filters: SaleListFilters = {},
): Promise<SalesListStats> {
  const db = await getDb();
  const { where, params } = saleFilterParts(filters);
  const saleClause = ["s.status <> 'void'", ...where].join(" AND ");

  const period: Period = {
    from: filters.from || "0000-01-01",
    to: filters.to || "9999-12-31",
    patientId: filters.patientId ?? null,
  };

  const [revenue, collected, cogs, debt, itemRows, discountRows] = await Promise.all([
    getRevenue(period),
    getCollected(period),
    getCogs(period),
    getPeriodDebt(period),
    db.select<{ items_sold: number; item_discounts: number }[]>(
      `SELECT COALESCE(SUM(si.quantity), 0) AS items_sold,
              CAST(COALESCE(SUM(si.item_discount), 0) AS INTEGER) AS item_discounts
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${saleClause}`,
      params,
    ),
    // Invoice-level discount is `subtotal - total`; summed over sales, not lines,
    // so a multi-line invoice counts its discount once.
    db.select<{ global_discounts: number }[]>(
      `SELECT CAST(COALESCE(SUM(s.subtotal - s.total), 0) AS INTEGER) AS global_discounts
       FROM sales s WHERE ${saleClause}`,
      params,
    ),
  ]);

  const it = itemRows[0];
  return {
    salesCount: revenue.salesCount,
    revenue: revenue.ttc,
    collected,
    // Gross margin, on the same HT basis as the P&L, so the two agree.
    netProfit: revenue.ht - cogs,
    itemsSold: it?.items_sold ?? 0,
    discounts: (discountRows[0]?.global_discounts ?? 0) + (it?.item_discounts ?? 0),
    refunds: revenue.refunds,
    outstanding: debt.amount,
    pendingCount: debt.count,
  };
}

export async function getSale(id: number): Promise<SaleWithPatient | null> {
  const db = await getDb();
  const rows = await db.select<SaleWithPatient[]>(
    `SELECT s.*, p.full_name AS patient_name
     FROM sales s LEFT JOIN patients p ON p.id = s.patient_id
     WHERE s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  const db = await getDb();
  return db.select<SaleItem[]>(
    "SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id",
    [saleId],
  );
}

/**
 * Voids a sale via the Rust `void_sale` command: the fiscal invoice (and its number)
 * is retained as `status='void'`, stock is restored, and any insurer claim is
 * cancelled. Issued invoices are never hard-deleted (that would break the gap-free
 * TVA sequence). Optionally records a reason.
 */
export async function voidSale(
  id: number,
  reason?: string | null,
): Promise<void> {
  unwrap(await commands.voidSale(id, reason ?? null));
}
