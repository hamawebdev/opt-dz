/**
 * Cross-checks the reports against a **fully seeded, realistic** database
 * produced by `scripts/seed.mjs` — data this suite did not create and whose
 * money maths were written independently of `src/db/metrics.ts`.
 *
 * The other integration files build small, hand-computed scenarios; those prove
 * each rule in isolation but share the author's assumptions. This one checks the
 * invariants hold across hundreds of interacting rows.
 *
 * Opt-in, because it needs a seeded database on disk:
 *
 *     node -e '...apply migrations...' /tmp/e2e.db
 *     OPTDZ_DB=/tmp/e2e.db node scripts/seed.mjs --reset
 *     OPTDZ_VERIFY_DB=/tmp/e2e.db npm run test:int
 */
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setTestDb } from "../support/plugin-sql-stub";
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
import { getDashboardStats, getReportOverview } from "@/db/reports";
import { getSalesListStats } from "@/db/sales";
import { listLowStock } from "@/db/products";

const DB_PATH = process.env.OPTDZ_VERIFY_DB;

// A window wide enough to contain everything the seeder generates (~400 days).
const ALL: Period = { from: "2020-01-01", to: "2030-12-31" };

describe.skipIf(!DB_PATH)("reports over a seeded database", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(DB_PATH!, { readOnly: true });
    __setTestDb(db);
  });
  afterAll(() => {
    __setTestDb(null);
    db.close();
  });

  it("has data to reason about", () => {
    const n = db.prepare("SELECT COUNT(*) AS n FROM sales").get() as { n: number };
    expect(n.n).toBeGreaterThan(10);
  });

  it("agrees on revenue across every surface", async () => {
    const [revenue, overview, listStats, pnl] = await Promise.all([
      getRevenue(ALL),
      getReportOverview(ALL.from, ALL.to),
      getSalesListStats({ from: ALL.from, to: ALL.to }),
      getProfitAndLoss(ALL),
    ]);

    expect(overview.billed).toBe(revenue.ttc);
    expect(listStats.revenue).toBe(revenue.ttc);
    expect(pnl.revenueTtc).toBe(revenue.ttc);
    expect(listStats.salesCount).toBe(overview.salesCount);
  });

  it("agrees on cash collected across every surface", async () => {
    const [collected, overview, listStats, pnl] = await Promise.all([
      getCollected(ALL),
      getReportOverview(ALL.from, ALL.to),
      getSalesListStats({ from: ALL.from, to: ALL.to }),
      getProfitAndLoss(ALL),
    ]);

    expect(overview.collected).toBe(collected);
    expect(listStats.collected).toBe(collected);
    expect(pnl.collected).toBe(collected);
  });

  it("keeps the P&L internally consistent", async () => {
    const pnl = await getProfitAndLoss(ALL);
    expect(pnl.revenueHt).toBe(pnl.revenueTtc - pnl.tva);
    expect(pnl.grossMargin).toBe(pnl.revenueHt - pnl.cogs);
    expect(pnl.netProfit).toBe(pnl.grossMargin - pnl.expenses);
  });

  it("returns whole centimes for every figure", async () => {
    const pnl = await getProfitAndLoss(ALL);
    for (const [key, value] of Object.entries(pnl)) {
      if (typeof value === "number") {
        expect(Number.isInteger(value), `${key} = ${value}`).toBe(true);
      }
    }
  });

  it("sums daily buckets to exactly the period totals", async () => {
    const [revDays, cashDays, revenue, collected] = await Promise.all([
      getRevenueByDay(ALL),
      getCollectedByDay(ALL),
      getRevenue(ALL),
      getCollected(ALL),
    ]);

    expect(revDays.reduce((a, d) => a + d.amount, 0)).toBe(revenue.ttc);
    expect(cashDays.reduce((a, d) => a + d.amount, 0)).toBe(collected);
  });

  /** Splitting the window anywhere must not create or destroy money. */
  it("splits into sub-periods that sum back to the whole", async () => {
    const cut = "2026-01-01";
    const before: Period = { from: ALL.from, to: "2025-12-31" };
    const after: Period = { from: cut, to: ALL.to };

    const [w, b, a] = await Promise.all([getRevenue(ALL), getRevenue(before), getRevenue(after)]);
    expect(b.ttc + a.ttc).toBe(w.ttc);
    expect(b.salesCount + a.salesCount).toBe(w.salesCount);

    const [wc, bc, ac] = await Promise.all([
      getCollected(ALL),
      getCollected(before),
      getCollected(after),
    ]);
    expect(bc + ac).toBe(wc);

    const [wg, bg, ag] = await Promise.all([getCogs(ALL), getCogs(before), getCogs(after)]);
    expect(bg + ag).toBe(wg);
  });

  it("counts low stock the same way as the list it links to", async () => {
    expect(await getLowStockCount()).toBe((await listLowStock()).length);
  });

  it("keeps inventory valuation coherent", async () => {
    const inv = await getInventoryValuation();
    expect(inv.potentialMargin).toBe(inv.totalValue - inv.totalCost);
    expect(inv.totalCost).toBeGreaterThanOrEqual(0);
    expect(inv.totalUnits).toBeGreaterThanOrEqual(0);
  });

  it("matches the dashboard to the reports page for a single day", async () => {
    const day = (
      db.prepare("SELECT sale_date AS d FROM sales ORDER BY id DESC LIMIT 1").get() as {
        d: string;
      }
    ).d;

    const dash = await getDashboardStats(day);
    const overview = await getReportOverview(day, day);

    expect(dash.todaySalesTotal).toBe(overview.billed);
    expect(dash.todayCollected).toBe(overview.collected);
    expect(dash.todayInvoiceCount).toBe(overview.salesCount);
  });

  /**
   * Mirrors the seeder's own integrity check, but through the app's own
   * definition of what a balance should be.
   */
  it("has no sale whose balance disagrees with its payments", () => {
    const bad = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sales s
          WHERE s.status <> 'void'
            AND s.balance <> MAX(
                  s.total + s.timbre_amount
                  - COALESCE((SELECT covered_amount FROM claims WHERE sale_id = s.id), 0)
                  - COALESCE((SELECT SUM(total) FROM credit_notes
                               WHERE sale_id = s.id AND method = 'balance'), 0)
                  - s.amount_paid, 0)`,
      )
      .get() as { n: number };
    expect(bad.n).toBe(0);
  });

  it("never reports a negative outstanding balance", () => {
    const neg = db
      .prepare("SELECT COUNT(*) AS n FROM sales WHERE balance < 0")
      .get() as { n: number };
    expect(neg.n).toBe(0);
  });
});
