/**
 * Profit & loss and the expense layer behind it.
 *
 * The defining rule under test: **stock purchases are never deducted from
 * profit.** Buying inventory converts cash into an asset; that cost reaches the
 * P&L as cost of goods when the stock sells. Deducting both the purchase and
 * the COGS would count the same money twice and show a loss in any month with a
 * large delivery.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import { getExpensesByCategory, getExpensesTotal, getProfitAndLoss } from "@/db/metrics";
import { listExpenses } from "@/db/expenses";

const MARCH = { from: "2026-03-01", to: "2026-03-31" };

let s: Scenario;
beforeEach(() => {
  s = new Scenario();
});
afterEach(() => s.close());

describe("expense recording", () => {
  it("lists expenses within a period, newest first", async () => {
    s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 300_00 });
    s.expense({ expenseDate: "2026-03-20", category: "utilities", amount: 50_00 });
    s.expense({ expenseDate: "2026-04-01", category: "rent", amount: 300_00 });

    const rows = await listExpenses(MARCH);
    expect(rows).toHaveLength(2);
    expect(rows[0].expense_date).toBe("2026-03-20");
  });

  it("filters by category", async () => {
    s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 300_00 });
    s.expense({ expenseDate: "2026-03-02", category: "salaries", amount: 900_00 });

    const rows = await listExpenses({ ...MARCH, category: "rent" });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(300_00);
  });

  it("groups by category, largest first", async () => {
    s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 300_00 });
    s.expense({ expenseDate: "2026-03-02", category: "salaries", amount: 900_00 });
    s.expense({ expenseDate: "2026-03-03", category: "salaries", amount: 100_00 });

    const lines = await getExpensesByCategory(MARCH);
    expect(lines).toEqual([
      { category: "salaries", amount: 1000_00 },
      { category: "rent", amount: 300_00 },
    ]);
    expect(await getExpensesTotal(MARCH)).toBe(1300_00);
  });

  it("rejects an unknown category at the schema level", () => {
    expect(() =>
      s.db
        .prepare("INSERT INTO expenses (expense_date, category, amount) VALUES ('2026-03-01','bribes',100)")
        .run(),
    ).toThrow();
  });

  it("rejects a negative expense at the schema level", () => {
    expect(() =>
      s.db
        .prepare("INSERT INTO expenses (expense_date, category, amount) VALUES ('2026-03-01','rent',-100)")
        .run(),
    ).toThrow();
  });
});

describe("profit & loss", () => {
  /**
   * A month with a large delivery and a modest sale. If stock purchases were
   * deducted this would show a heavy loss; correctly, only the cost of what
   * actually sold is charged against profit.
   */
  function monthWithBigDelivery() {
    const p = s.product({ purchasePrice: 300_00, sellingPrice: 900_00, quantity: 100 });
    s.sale({
      saleDate: "2026-03-10",
      total: 900_00,
      items: [{ productId: p, qty: 1, unitPrice: 900_00, unitCost: 300_00 }],
    });
    const sup = s.supplier("Luxottica");
    s.supplierPurchase(sup, 30000_00, "2026-03-02 09:00:00"); // a big delivery
    s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 200_00 });
  }

  it("does not deduct stock purchases from profit", async () => {
    monthWithBigDelivery();
    const pnl = await getProfitAndLoss(MARCH);

    expect(pnl.stockPurchased).toBe(30000_00);
    expect(pnl.revenueHt).toBe(900_00);
    expect(pnl.cogs).toBe(300_00);
    expect(pnl.grossMargin).toBe(600_00);
    expect(pnl.expenses).toBe(200_00);
    expect(pnl.netProfit).toBe(400_00);
  });

  it("reports a loss when expenses exceed gross margin", async () => {
    const p = s.product({ purchasePrice: 800_00, sellingPrice: 900_00 });
    s.sale({
      saleDate: "2026-03-10",
      total: 900_00,
      items: [{ productId: p, qty: 1, unitPrice: 900_00, unitCost: 800_00 }],
    });
    s.expense({ expenseDate: "2026-03-01", category: "rent", amount: 500_00 });

    const pnl = await getProfitAndLoss(MARCH);
    expect(pnl.grossMargin).toBe(100_00);
    expect(pnl.netProfit).toBe(-400_00);
  });

  it("states profit excluding VAT and stamp duty", async () => {
    const p = s.product({ purchasePrice: 400_00 });
    s.sale({
      saleDate: "2026-03-10",
      total: 1190_00,
      taxRate: 1900,
      taxAmount: 190_00,
      timbre: 10_00,
      items: [{ productId: p, qty: 1, unitPrice: 1190_00, unitCost: 400_00 }],
    });

    const pnl = await getProfitAndLoss(MARCH);
    expect(pnl.revenueTtc).toBe(1190_00);
    expect(pnl.tva).toBe(190_00);
    expect(pnl.timbre).toBe(10_00);
    expect(pnl.revenueHt).toBe(1000_00);
    expect(pnl.grossMargin).toBe(600_00);
    // Neither VAT nor stamp duty inflates profit.
    expect(pnl.netProfit).toBe(600_00);
  });

  it("returns a zeroed statement for a month with nothing in it", async () => {
    const pnl = await getProfitAndLoss({ from: "2026-09-01", to: "2026-09-30" });
    expect(pnl).toMatchObject({
      revenueTtc: 0,
      revenueHt: 0,
      cogs: 0,
      grossMargin: 0,
      expenses: 0,
      netProfit: 0,
      stockPurchased: 0,
      collected: 0,
    });
    expect(pnl.expenseLines).toEqual([]);
  });

  it("scopes every line to the period", async () => {
    s.expense({ expenseDate: "2026-02-28", category: "rent", amount: 999_00 });
    s.expense({ expenseDate: "2026-03-15", category: "rent", amount: 100_00 });
    s.expense({ expenseDate: "2026-04-01", category: "rent", amount: 999_00 });

    const pnl = await getProfitAndLoss(MARCH);
    expect(pnl.expenses).toBe(100_00);
  });

  it("keeps every figure an integer number of centimes", async () => {
    monthWithBigDelivery();
    const pnl = await getProfitAndLoss(MARCH);
    for (const [key, value] of Object.entries(pnl)) {
      if (typeof value === "number") {
        expect(Number.isInteger(value), `${key} = ${value}`).toBe(true);
      }
    }
  });
});
