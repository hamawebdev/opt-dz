/**
 * The test this whole audit exists for: **every screen must report the same
 * money for the same period**.
 *
 * One realistic month is built once, then read back through every surface — the
 * dashboard, the reports overview, the sales-list KPI header, the P&L, the tax
 * report and the inventory valuation. Before the metrics layer existed these
 * disagreed: the sales list showed gross revenue while the reports page showed
 * revenue net of credit notes, and "collected" on the sales list summed each
 * invoice's lifetime payments regardless of the filter.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import {
  getCogs,
  getCollected,
  getInventoryValuation,
  getLowStockCount,
  getProfitAndLoss,
  getRevenue,
  getRevenueByDay,
  getCollectedByDay,
  type Period,
} from "@/db/metrics";
import { getDashboardStats, getReportOverview, getTaxInRange } from "@/db/reports";
import { getSalesListStats } from "@/db/sales";
import { listLowStock } from "@/db/products";

const MARCH: Period = { from: "2026-03-01", to: "2026-03-31" };

let s: Scenario;

/**
 * A month with everything in it: paid and unpaid invoices, a walk-in, a cash
 * refund, a balance credit note, an expense, a supplier purchase and a voided
 * invoice. Amounts are stated explicitly so the expected totals below are
 * arithmetic a reader can check by hand.
 *
 * TVA is 19%, extracted from the TTC total (1190.00 TTC = 1000.00 HT + 190.00).
 */
function buildMonth() {
  const alice = s.patient("Alice");
  const frame = s.product({ name: "Frame", purchasePrice: 300_00, sellingPrice: 900_00, quantity: 20 });
  const lens = s.product({ name: "Lens", category: "lens", purchasePrice: 400_00, sellingPrice: 1190_00, quantity: 20 });

  // 1) Paid in full, in cash, with TVA and stamp duty.
  const paid = s.sale({
    saleDate: "2026-03-05",
    patientId: alice,
    total: 1190_00,
    taxRate: 1900,
    taxAmount: 190_00,
    timbre: 10_00,
    items: [{ productId: lens, qty: 1, unitPrice: 1190_00, unitCost: 400_00 }],
  });
  s.payment(paid, 1200_00, "2026-03-05 10:00:00", "cash"); // goods + timbre

  // 2) Partly paid, still owing at month end.
  const partial = s.sale({
    saleDate: "2026-03-10",
    patientId: alice,
    total: 900_00,
    items: [{ productId: frame, qty: 1, unitPrice: 900_00, unitCost: 300_00 }],
  });
  s.payment(partial, 400_00, "2026-03-10 11:00:00", "card");

  // 3) Walk-in, paid immediately.
  const walkin = s.sale({
    saleDate: "2026-03-12",
    patientId: null,
    total: 900_00,
    items: [{ productId: frame, qty: 1, unitPrice: 900_00, unitCost: 300_00 }],
  });
  s.payment(walkin, 900_00, "2026-03-12 09:00:00", "card");

  // 4) A cash refund against the fully paid invoice.
  s.creditNote({
    saleId: paid,
    patientId: alice,
    total: 190_00,
    method: "refund",
    createdAt: "2026-03-20 14:00:00",
    items: [{ productId: lens, qty: 0, lineTotal: 190_00 }],
  });

  // 5) A voided invoice: fiscally retained, but worth nothing.
  s.sale({ saleDate: "2026-03-15", total: 5000_00, status: "void" });

  // 6) Operating expenses and a stock purchase.
  s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 300_00 });
  s.expense({ expenseDate: "2026-03-02", category: "salaries", amount: 200_00 });
  const supplier = s.supplier("Luxottica");
  s.supplierPurchase(supplier, 2000_00, "2026-03-03 08:00:00");

  return { alice, frame, lens, paid, partial, walkin };
}

beforeEach(() => {
  s = new Scenario();
  buildMonth();
});
afterEach(() => s.close());

/* Expected values, derived by hand from buildMonth():
 *   gross TTC  = 1190.00 + 900.00 + 900.00        = 2990.00  (void excluded)
 *   refunds    = 190.00
 *   revenue TTC= 2990.00 - 190.00                 = 2800.00
 *   sale TVA   = 190.00 ; refunded TVA = 190.00 - floor(19000*10000/11900)
 *                                      = 190.00 - 159.66     = 30.34
 *   revenue TVA= 190.00 - 30.34                   = 159.66
 *   revenue HT = 2800.00 - 159.66                 = 2640.34
 *   COGS       = 400.00 + 300.00 + 300.00         = 1000.00  (refund returned 0 units)
 *   collected  = 1200.00 + 400.00 + 900.00 - 190.00 = 2310.00
 *   expenses   = 300.00 + 200.00                  = 500.00
 */
const EXPECTED = {
  grossTtc: 2990_00,
  refunds: 190_00,
  revenueTtc: 2800_00,
  cogs: 1000_00,
  collected: 2310_00,
  expenses: 500_00,
  stockPurchased: 2000_00,
  salesCount: 3,
};

describe("one period, one set of numbers", () => {
  it("agrees on revenue across reports, sales list and P&L", async () => {
    const [overview, listStats, pnl, revenue] = await Promise.all([
      getReportOverview(MARCH.from, MARCH.to),
      getSalesListStats({ from: MARCH.from, to: MARCH.to }),
      getProfitAndLoss(MARCH),
      getRevenue(MARCH),
    ]);

    expect(revenue.ttc).toBe(EXPECTED.revenueTtc);
    expect(overview.billed).toBe(EXPECTED.revenueTtc);
    expect(listStats.revenue).toBe(EXPECTED.revenueTtc);
    expect(pnl.revenueTtc).toBe(EXPECTED.revenueTtc);
  });

  it("agrees on cash collected across every surface", async () => {
    const [overview, listStats, pnl, collected] = await Promise.all([
      getReportOverview(MARCH.from, MARCH.to),
      getSalesListStats({ from: MARCH.from, to: MARCH.to }),
      getProfitAndLoss(MARCH),
      getCollected(MARCH),
    ]);

    expect(collected).toBe(EXPECTED.collected);
    expect(overview.collected).toBe(EXPECTED.collected);
    expect(listStats.collected).toBe(EXPECTED.collected);
    expect(pnl.collected).toBe(EXPECTED.collected);
  });

  it("agrees on refunds and sales count", async () => {
    const overview = await getReportOverview(MARCH.from, MARCH.to);
    const listStats = await getSalesListStats({ from: MARCH.from, to: MARCH.to });

    expect(overview.refunds).toBe(EXPECTED.refunds);
    expect(listStats.refunds).toBe(EXPECTED.refunds);
    expect(overview.salesCount).toBe(EXPECTED.salesCount);
    expect(listStats.salesCount).toBe(EXPECTED.salesCount);
  });

  it("agrees on tax between the tax report and the P&L", async () => {
    const tax = await getTaxInRange(MARCH.from, MARCH.to);
    const pnl = await getProfitAndLoss(MARCH);

    expect(tax.tva).toBe(pnl.tva);
    expect(tax.timbre).toBe(pnl.timbre);
  });

  it("agrees on gross margin between the sales list and the P&L", async () => {
    const listStats = await getSalesListStats({ from: MARCH.from, to: MARCH.to });
    const pnl = await getProfitAndLoss(MARCH);

    expect(listStats.netProfit).toBe(pnl.grossMargin);
  });
});

describe("the P&L adds up", () => {
  it("reconciles TTC down to HT and through to net profit", async () => {
    const pnl = await getProfitAndLoss(MARCH);

    expect(pnl.revenueHt).toBe(pnl.revenueTtc - pnl.tva);
    expect(pnl.grossMargin).toBe(pnl.revenueHt - pnl.cogs);
    expect(pnl.netProfit).toBe(pnl.grossMargin - pnl.expenses);
    expect(pnl.cogs).toBe(EXPECTED.cogs);
    expect(pnl.expenses).toBe(EXPECTED.expenses);
  });

  /** Buying stock is not a loss — it must never be deducted from profit. */
  it("reports stock purchases without deducting them", async () => {
    const pnl = await getProfitAndLoss(MARCH);
    expect(pnl.stockPurchased).toBe(EXPECTED.stockPurchased);
    expect(pnl.netProfit).toBe(pnl.grossMargin - pnl.expenses);
  });

  it("excludes VAT and stamp duty from profit", async () => {
    const pnl = await getProfitAndLoss(MARCH);
    expect(pnl.revenueHt).toBeLessThan(pnl.revenueTtc);
    expect(pnl.timbre).toBe(10_00);
  });
});

describe("void invoices are worth nothing everywhere", () => {
  it("excludes them from revenue, count, COGS and debt", async () => {
    const overview = await getReportOverview(MARCH.from, MARCH.to);
    const revenue = await getRevenue(MARCH);

    expect(revenue.grossTtc).toBe(EXPECTED.grossTtc); // the 5000.00 void is absent
    expect(overview.salesCount).toBe(EXPECTED.salesCount);
    expect(await getCogs(MARCH)).toBe(EXPECTED.cogs);
  });
});

describe("bucketing never loses or duplicates money", () => {
  /**
   * The reports page sums daily buckets client-side to draw its chart. Those
   * buckets must add up to exactly the headline figure, or the chart and the
   * KPI card above it tell different stories.
   */
  it("daily collected buckets sum to the period total", async () => {
    const days = await getCollectedByDay(MARCH);
    const summed = days.reduce((acc, d) => acc + d.amount, 0);
    expect(summed).toBe(await getCollected(MARCH));
  });

  it("daily revenue buckets sum to the period total", async () => {
    const days = await getRevenueByDay(MARCH);
    const summed = days.reduce((acc, d) => acc + d.amount, 0);
    expect(summed).toBe((await getRevenue(MARCH)).ttc);
  });

  /** Splitting a period in two must not change the total. */
  it("two half-months sum to the whole month", async () => {
    const first = await getRevenue({ from: "2026-03-01", to: "2026-03-15" });
    const second = await getRevenue({ from: "2026-03-16", to: "2026-03-31" });
    const whole = await getRevenue(MARCH);

    expect(first.ttc + second.ttc).toBe(whole.ttc);
    expect(first.salesCount + second.salesCount).toBe(whole.salesCount);
    expect(await getCollected({ from: "2026-03-01", to: "2026-03-15" }) +
      (await getCollected({ from: "2026-03-16", to: "2026-03-31" }))).toBe(
      await getCollected(MARCH),
    );
  });
});

describe("the dashboard matches the reports page for the same day", () => {
  it("reports the same billed and collected figures for a single day", async () => {
    const day = "2026-03-05";
    const dash = await getDashboardStats(day);
    const overview = await getReportOverview(day, day);

    expect(dash.todaySalesTotal).toBe(overview.billed);
    expect(dash.todayCollected).toBe(overview.collected);
    expect(dash.todayInvoiceCount).toBe(overview.salesCount);
  });

  it("counts low stock the same way as the list it links to", async () => {
    // A variant product whose only variant is empty: the count used to include
    // it (variant-aware) while the list did not (product.quantity only).
    const p = s.product({ name: "Variant frame", quantity: 0, minStock: 0 });
    s.variant(p, { quantity: 0, minStock: 2 });

    const count = await getLowStockCount();
    const list = await listLowStock();
    expect(count).toBe(list.length);
    expect(list.some((row) => row.id === p)).toBe(true);
  });
});

describe("historical periods are stable", () => {
  /**
   * The defining determinism test. "New debt in March" used to be
   * `SUM(sales.balance)` — a live column — so paying an old invoice in April
   * retroactively reduced March's reported debt, and a closed month reported a
   * different number every time it was opened.
   */
  it("does not change March's debt when an April payment arrives", async () => {
    const before = await getReportOverview(MARCH.from, MARCH.to);

    // The customer settles their March balance in April.
    const partial = s.db
      .prepare("SELECT id FROM sales WHERE sale_date = '2026-03-10'")
      .get() as { id: number };
    s.payment(partial.id, 500_00, "2026-04-05 10:00:00", "cash");

    const after = await getReportOverview(MARCH.from, MARCH.to);

    expect(after.newDebt).toBe(before.newDebt);
    expect(after.newDebtCount).toBe(before.newDebtCount);
    expect(after.billed).toBe(before.billed);
    expect(after.collected).toBe(before.collected);
  });

  it("puts the April payment in April", async () => {
    const partial = s.db
      .prepare("SELECT id FROM sales WHERE sale_date = '2026-03-10'")
      .get() as { id: number };
    s.payment(partial.id, 500_00, "2026-04-05 10:00:00", "cash");

    expect(await getCollected({ from: "2026-04-01", to: "2026-04-30" })).toBe(500_00);
  });
});

describe("inventory valuation", () => {
  it("separates stock investment from potential margin", async () => {
    const inv = await getInventoryValuation();
    expect(inv.potentialMargin).toBe(inv.totalValue - inv.totalCost);
    expect(inv.totalCost).toBeGreaterThan(0);
  });

  /** Valuation is at latest cost; COGS uses the snapshot. They are different questions. */
  it("is unaffected by a later change to a product's cost price", async () => {
    const before = await getInventoryValuation();
    const cogsBefore = await getCogs(MARCH);

    s.db.prepare("UPDATE products SET purchase_price = 999_00 WHERE name = 'Frame'").run();

    expect(await getCogs(MARCH)).toBe(cogsBefore);
    expect((await getInventoryValuation()).totalCost).not.toBe(before.totalCost);
  });
});
