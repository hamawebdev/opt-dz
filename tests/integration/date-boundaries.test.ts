/**
 * Date-boundary regressions.
 *
 * The shop is at UTC+1. `sales.sale_date` holds a **local** date, while
 * `payments.paid_at` and `credit_notes.created_at` hold **UTC** timestamps. A
 * payment taken at 00:30 on 1 March local time is stored as `2026-02-28
 * 23:30:00`, so a query that forgets `'localtime'` reports it in February.
 *
 * These tests only mean anything at UTC+1 — `tests/support/tz-guard.ts` fails
 * the run otherwise, because under UTC every assertion here passes for the
 * wrong reason.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import { getCollected, getRevenue } from "@/db/metrics";
import { getPatientStatement } from "@/db/patients";
import { getReportOverview } from "@/db/reports";

let s: Scenario;
beforeEach(() => {
  s = new Scenario();
});
afterEach(() => s.close());

describe("payments near local midnight", () => {
  /**
   * 23:30 UTC on 28 Feb is 00:30 local on 1 March. The money entered the till
   * in March, so March must report it — this is the bug that made the takings
   * on the first of a month land in the previous month.
   */
  it("counts a payment by the local day, not the UTC day", async () => {
    const sale = s.sale({ saleDate: "2026-02-28", total: 500_00 });
    s.payment(sale, 500_00, "2026-02-28 23:30:00", "cash");

    const feb = await getCollected({ from: "2026-02-01", to: "2026-02-28" });
    const mar = await getCollected({ from: "2026-03-01", to: "2026-03-31" });

    expect(feb).toBe(0);
    expect(mar).toBe(500_00);
  });

  it("counts a payment at 23:00 local on the same local day", async () => {
    const sale = s.sale({ saleDate: "2026-03-15", total: 500_00 });
    // 22:00 UTC = 23:00 local, still 15 March.
    s.payment(sale, 500_00, "2026-03-15 22:00:00", "cash");

    expect(await getCollected({ from: "2026-03-15", to: "2026-03-15" })).toBe(500_00);
  });

  it("puts a credit note on its local day too", async () => {
    const sale = s.sale({ saleDate: "2026-02-28", total: 500_00, status: "paid" });
    s.creditNote({
      saleId: sale,
      total: 200_00,
      method: "refund",
      createdAt: "2026-02-28 23:30:00",
    });

    const mar = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    expect(mar.refunds).toBe(200_00);
  });
});

describe("sale_date is already local", () => {
  /**
   * `sale_date` must not get a second `'localtime'` conversion: that would shift
   * it an hour backwards and drop every sale into the previous day.
   */
  it("reports a sale on exactly the day it is dated", async () => {
    s.sale({ saleDate: "2026-03-01", total: 900_00 });

    const feb = await getRevenue({ from: "2026-02-01", to: "2026-02-28" });
    const mar1 = await getRevenue({ from: "2026-03-01", to: "2026-03-01" });

    expect(feb.ttc).toBe(0);
    expect(mar1.ttc).toBe(900_00);
  });

  /**
   * Migration v26 normalises legacy rows whose `sale_date` carried a UTC time
   * component (written by the old column default rather than by the POS).
   */
  it("normalises a legacy UTC sale_date to its local day", () => {
    // Simulate a pre-v26 row: 23:30 UTC on 28 Feb is 1 March locally.
    s.db
      .prepare(
        `INSERT INTO sales (sale_date, subtotal, total, balance, status, invoice_number)
         VALUES ('2026-02-28 23:30:00', 50000, 50000, 50000, 'unpaid', 'LEGACY')`,
      )
      .run();
    s.db.exec("UPDATE sales SET sale_date = date(sale_date, 'localtime') WHERE length(sale_date) > 10");

    const row = s.db
      .prepare("SELECT sale_date FROM sales WHERE invoice_number = 'LEGACY'")
      .get() as { sale_date: string };
    expect(row.sale_date).toBe("2026-03-01");
  });
});

describe("range boundaries are inclusive", () => {
  it("includes both the first and last day of the range", async () => {
    s.sale({ saleDate: "2026-03-01", total: 100_00 });
    s.sale({ saleDate: "2026-03-31", total: 200_00 });
    s.sale({ saleDate: "2026-04-01", total: 400_00 });

    const march = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    expect(march.ttc).toBe(300_00);
    expect(march.salesCount).toBe(2);
  });

  it("handles a single-day range", async () => {
    s.sale({ saleDate: "2026-03-15", total: 100_00 });
    const day = await getRevenue({ from: "2026-03-15", to: "2026-03-15" });
    expect(day.ttc).toBe(100_00);
  });

  it("handles a year boundary", async () => {
    s.sale({ saleDate: "2025-12-31", total: 100_00 });
    s.sale({ saleDate: "2026-01-01", total: 200_00 });

    expect((await getRevenue({ from: "2025-01-01", to: "2025-12-31" })).ttc).toBe(100_00);
    expect((await getRevenue({ from: "2026-01-01", to: "2026-12-31" })).ttc).toBe(200_00);
  });
});

describe("patient statement agrees with the reports page", () => {
  /**
   * The statement used to filter `paid_at` without `'localtime'` while the
   * reports page applied it, so the same payment appeared in different months
   * on the two screens.
   */
  it("buckets a near-midnight payment into the same month as the reports", async () => {
    const pat = s.patient("Leila");
    const sale = s.sale({ saleDate: "2026-02-28", patientId: pat, total: 500_00 });
    s.payment(sale, 500_00, "2026-02-28 23:30:00", "cash");

    const statementFeb = await getPatientStatement(pat, {
      from: "2026-02-01",
      to: "2026-02-28",
    });
    const statementMar = await getPatientStatement(pat, {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    const reportsMar = await getReportOverview("2026-03-01", "2026-03-31");

    const paymentsIn = (st: Awaited<ReturnType<typeof getPatientStatement>>) =>
      st.entries.filter((e) => e.type === "payment").length;

    expect(paymentsIn(statementFeb)).toBe(0);
    expect(paymentsIn(statementMar)).toBe(1);
    expect(reportsMar.collected).toBe(500_00);
  });
});
