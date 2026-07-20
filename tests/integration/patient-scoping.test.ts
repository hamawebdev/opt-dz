/**
 * Filtering the sales list to one customer must narrow the **money**, not just
 * the rows. A header showing the whole shop's takings beside a single
 * customer's invoices would be worse than the inconsistency it replaced.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import { getCogs, getCollected, getPeriodDebt, getRevenue } from "@/db/metrics";
import { getSalesListStats } from "@/db/sales";

const MARCH = { from: "2026-03-01", to: "2026-03-31" };

let s: Scenario;
let alice: number;
let bilal: number;

beforeEach(() => {
  s = new Scenario();
  alice = s.patient("Alice");
  bilal = s.patient("Bilal");
  const p = s.product({ purchasePrice: 300_00, sellingPrice: 900_00, quantity: 50 });

  // Alice: 900.00 invoiced, 400.00 paid, 100.00 credited back.
  const a1 = s.sale({
    saleDate: "2026-03-05",
    patientId: alice,
    total: 900_00,
    items: [{ productId: p, qty: 1, unitPrice: 900_00, unitCost: 300_00 }],
  });
  s.payment(a1, 400_00, "2026-03-05 10:00:00", "cash");
  s.creditNote({
    saleId: a1,
    patientId: alice,
    total: 100_00,
    method: "refund",
    createdAt: "2026-03-06 10:00:00",
  });

  // Bilal: 1800.00 invoiced, fully paid.
  const b1 = s.sale({
    saleDate: "2026-03-07",
    patientId: bilal,
    total: 1800_00,
    items: [{ productId: p, qty: 2, unitPrice: 900_00, unitCost: 300_00 }],
  });
  s.payment(b1, 1800_00, "2026-03-07 10:00:00", "card");

  // A walk-in, belonging to neither.
  const w = s.sale({
    saleDate: "2026-03-08",
    patientId: null,
    total: 500_00,
    items: [{ productId: p, qty: 1, unitPrice: 500_00, unitCost: 300_00 }],
  });
  s.payment(w, 500_00, "2026-03-08 10:00:00", "cash");
});
afterEach(() => s.close());

describe("scoping a period to one customer", () => {
  it("narrows revenue to that customer's invoices, net of their credit notes", async () => {
    const scoped = await getRevenue({ ...MARCH, patientId: alice });
    expect(scoped.grossTtc).toBe(900_00);
    expect(scoped.refunds).toBe(100_00);
    expect(scoped.ttc).toBe(800_00);
    expect(scoped.salesCount).toBe(1);
  });

  it("narrows collected cash to that customer's payments", async () => {
    expect(await getCollected({ ...MARCH, patientId: alice })).toBe(400_00 - 100_00);
    expect(await getCollected({ ...MARCH, patientId: bilal })).toBe(1800_00);
  });

  it("narrows COGS to that customer's lines", async () => {
    expect(await getCogs({ ...MARCH, patientId: alice })).toBe(300_00);
    expect(await getCogs({ ...MARCH, patientId: bilal })).toBe(600_00);
  });

  it("narrows outstanding debt to that customer", async () => {
    expect((await getPeriodDebt({ ...MARCH, patientId: alice })).amount).toBe(500_00);
    expect((await getPeriodDebt({ ...MARCH, patientId: bilal })).amount).toBe(0);
  });

  it("excludes walk-in sales when scoped to a customer", async () => {
    const alicesRevenue = await getRevenue({ ...MARCH, patientId: alice });
    const bilalsRevenue = await getRevenue({ ...MARCH, patientId: bilal });
    const everyone = await getRevenue(MARCH);

    // The 500.00 walk-in belongs to the shop total but to neither customer.
    expect(alicesRevenue.ttc + bilalsRevenue.ttc).toBe(everyone.ttc - 500_00);
  });

  it("returns the shop-wide figure when no customer is given", async () => {
    const all = await getRevenue(MARCH);
    expect(all.grossTtc).toBe(3200_00); // 900.00 + 1800.00 + 500.00
    expect(all.ttc).toBe(3100_00); // less Alice's 100.00 credit note
    expect(all.salesCount).toBe(3);
  });
});

describe("the sales list header honours its patient filter", () => {
  it("reports only the selected customer's money", async () => {
    const stats = await getSalesListStats({ ...MARCH, patientId: alice });

    expect(stats.salesCount).toBe(1);
    expect(stats.revenue).toBe(800_00);
    expect(stats.collected).toBe(300_00);
    expect(stats.refunds).toBe(100_00);
    expect(stats.outstanding).toBe(500_00);
    expect(stats.itemsSold).toBe(1);
  });

  it("matches the unscoped metrics when no customer is selected", async () => {
    const stats = await getSalesListStats(MARCH);
    const revenue = await getRevenue(MARCH);

    expect(stats.revenue).toBe(revenue.ttc);
    expect(stats.collected).toBe(await getCollected(MARCH));
    expect(stats.salesCount).toBe(3);
  });
});
