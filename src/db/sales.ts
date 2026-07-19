import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
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

function lineTotal(item: SaleItemInput): number {
  return Math.max(0, item.unit_price * item.quantity - item.item_discount);
}

/**
 * Computes subtotal and total (after the overall discount), all in integer centimes.
 * For a percentage discount, `discountValue` is basis points (1500 = 15.00%), so the
 * discount is `subtotal * bp / 10000`, rounded to whole centimes.
 */
export function computeTotals(
  items: SaleItemInput[],
  discountType: DiscountType,
  discountValue: number,
) {
  const subtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const discountAmount =
    discountType === "percent"
      ? Math.round((subtotal * discountValue) / 10000)
      : discountValue;
  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, total };
}

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
  revenue: number; // billed goods total (TTC)
  collected: number; // cash actually received on those invoices
  netProfit: number; // revenue minus COGS snapshots
  itemsSold: number; // units across all lines
  discounts: number; // line discounts + overall invoice discounts
  refunds: number; // credit notes issued (avoirs)
  outstanding: number; // balances still owed
  pendingCount: number; // invoices with a balance > 0
}

/**
 * KPI aggregates for the sales list header, honoring the same filters as the list.
 * Void invoices are excluded everywhere. Refunds are credit notes counted on their
 * own creation date (same convention as the reports revenue queries).
 */
export async function getSalesListStats(
  filters: SaleListFilters = {},
): Promise<SalesListStats> {
  const db = await getDb();
  const { where, params } = saleFilterParts(filters);
  const saleClause = ["s.status <> 'void'", ...where].join(" AND ");

  // Credit notes carry their own patient/date columns, so they get their own filter.
  const cnWhere: string[] = [];
  const cnParams: unknown[] = [];
  if (filters.patientId) {
    cnParams.push(filters.patientId);
    cnWhere.push(`patient_id = $${cnParams.length}`);
  }
  if (filters.from) {
    cnParams.push(filters.from);
    // created_at is stored UTC; compare on the local day like the sales filter.
    cnWhere.push(`date(created_at,'localtime') >= date($${cnParams.length})`);
  }
  if (filters.to) {
    cnParams.push(filters.to);
    cnWhere.push(`date(created_at,'localtime') <= date($${cnParams.length})`);
  }
  const cnClause = cnWhere.length ? `WHERE ${cnWhere.join(" AND ")}` : "";

  const [saleRows, itemRows, cnRows] = await Promise.all([
    db.select<
      {
        cnt: number;
        revenue: number;
        collected: number;
        global_discounts: number;
        outstanding: number;
        pending_cnt: number;
      }[]
    >(
      `SELECT COUNT(*) AS cnt,
              COALESCE(SUM(s.total), 0) AS revenue,
              COALESCE(SUM(s.amount_paid), 0) AS collected,
              COALESCE(SUM(s.subtotal - s.total), 0) AS global_discounts,
              COALESCE(SUM(CASE WHEN s.balance > 0 THEN s.balance ELSE 0 END), 0) AS outstanding,
              COALESCE(SUM(CASE WHEN s.balance > 0 THEN 1 ELSE 0 END), 0) AS pending_cnt
       FROM sales s WHERE ${saleClause}`,
      params,
    ),
    db.select<{ items_sold: number; item_discounts: number; cogs: number }[]>(
      `SELECT COALESCE(SUM(si.quantity), 0) AS items_sold,
              COALESCE(SUM(si.item_discount), 0) AS item_discounts,
              COALESCE(SUM(si.unit_cost * si.quantity), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE ${saleClause}`,
      params,
    ),
    db.select<{ refunds: number }[]>(
      `SELECT COALESCE(SUM(total), 0) AS refunds FROM credit_notes ${cnClause}`,
      cnParams,
    ),
  ]);

  const s = saleRows[0];
  const it = itemRows[0];
  return {
    salesCount: s?.cnt ?? 0,
    revenue: s?.revenue ?? 0,
    collected: s?.collected ?? 0,
    netProfit: (s?.revenue ?? 0) - (it?.cogs ?? 0),
    itemsSold: it?.items_sold ?? 0,
    discounts: (s?.global_discounts ?? 0) + (it?.item_discounts ?? 0),
    refunds: cnRows[0]?.refunds ?? 0,
    outstanding: s?.outstanding ?? 0,
    pendingCount: s?.pending_cnt ?? 0,
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
