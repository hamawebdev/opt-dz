/**
 * One test per defect found in the audit, named for the behaviour it protects.
 * Each of these failed before the fix it guards.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import {
  getCogs,
  getCollected,
  getInventoryValuation,
  getReceivablesNow,
  getRevenue,
  getStockPurchased,
} from "@/db/metrics";
import { getBestSellers, getReportOverview } from "@/db/reports";
import { getSalesListStats } from "@/db/sales";

let s: Scenario;
beforeEach(() => {
  s = new Scenario();
});
afterEach(() => s.close());

describe("revenue is net of every credit note, not just cash refunds", () => {
  /**
   * A 'balance' credit note writes value off the invoice without cash moving.
   * The reports page used to net only 'refund' notes, so a written-off sale
   * still counted as revenue.
   */
  it("subtracts a balance credit note from revenue", async () => {
    const sale = s.sale({ saleDate: "2026-03-10", total: 1000_00 });
    s.creditNote({
      saleId: sale,
      total: 400_00,
      method: "balance",
      createdAt: "2026-03-11 10:00:00",
    });

    const r = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    expect(r.grossTtc).toBe(1000_00);
    expect(r.ttc).toBe(600_00);
  });

  /** ...but a balance credit note moves no cash, so collected is untouched. */
  it("leaves cash collected untouched for a balance credit note", async () => {
    const sale = s.sale({ saleDate: "2026-03-10", total: 1000_00 });
    s.payment(sale, 600_00, "2026-03-10 10:00:00", "cash");
    s.creditNote({
      saleId: sale,
      total: 400_00,
      method: "balance",
      createdAt: "2026-03-11 10:00:00",
    });

    expect(await getCollected({ from: "2026-03-01", to: "2026-03-31" })).toBe(600_00);
  });

  it("subtracts a cash refund from both revenue and collected", async () => {
    const sale = s.sale({ saleDate: "2026-03-10", total: 1000_00 });
    s.payment(sale, 1000_00, "2026-03-10 10:00:00", "cash");
    s.creditNote({
      saleId: sale,
      total: 400_00,
      method: "refund",
      createdAt: "2026-03-11 10:00:00",
    });

    const p = { from: "2026-03-01", to: "2026-03-31" };
    expect((await getRevenue(p)).ttc).toBe(600_00);
    expect(await getCollected(p)).toBe(600_00);
  });
});

describe("collected is scoped to the period, not the invoice lifetime", () => {
  /**
   * The sales-list header summed each invoice's `amount_paid`, which includes
   * payments made outside the filtered range — so filtering to March showed
   * money that arrived in April.
   */
  it("excludes a payment made after the filtered range", async () => {
    const sale = s.sale({ saleDate: "2026-03-10", total: 1000_00 });
    s.payment(sale, 300_00, "2026-03-10 10:00:00", "cash");
    s.payment(sale, 700_00, "2026-04-02 10:00:00", "cash");

    const march = await getSalesListStats({ from: "2026-03-01", to: "2026-03-31" });
    expect(march.collected).toBe(300_00);
  });
});

describe("insurer receivables stay visible", () => {
  /**
   * Coverage is subtracted from `sales.balance`, so an insurer-funded sale looks
   * fully settled from the customer's side. That money is still owed to the
   * shop and must be reported rather than disappearing.
   */
  it("reports the insurer's share separately from the customer's", async () => {
    const pat = s.patient("Sofiane");
    const payer = s.db
      .prepare("INSERT INTO payers (name) VALUES ('CNAS')")
      .run().lastInsertRowid as number;
    const sale = s.sale({ saleDate: "2026-03-10", patientId: pat, total: 1000_00 });
    s.db
      .prepare(
        `INSERT INTO claims (sale_id, payer_id, covered_amount, status)
         VALUES ($1, $2, 80000, 'submitted')`,
      )
      .run({ $1: sale, $2: Number(payer) });
    s.db.prepare("UPDATE sales SET balance = 20000 WHERE id = $1").run({ $1: sale });

    const r = await getReceivablesNow();
    expect(r.patients).toBe(200_00);
    expect(r.insurers).toBe(800_00);
  });

  it("drops a rejected claim from insurer receivables", async () => {
    const payer = Number(
      s.db.prepare("INSERT INTO payers (name) VALUES ('CNAS')").run().lastInsertRowid,
    );
    const sale = s.sale({ saleDate: "2026-03-10", total: 1000_00 });
    s.db
      .prepare(
        `INSERT INTO claims (sale_id, payer_id, covered_amount, status)
         VALUES ($1, $2, 80000, 'rejected')`,
      )
      .run({ $1: sale, $2: payer });

    expect((await getReceivablesNow()).insurers).toBe(0);
  });
});

describe("best sellers", () => {
  /**
   * A credit note whose sale was voided would otherwise subtract units that
   * were never counted, dragging a product's total negative.
   */
  it("ignores credit notes belonging to a voided sale", async () => {
    const p = s.product({ name: "Frame" });
    const live = s.sale({
      saleDate: "2026-03-05",
      total: 900_00,
      items: [{ productId: p, qty: 3, unitPrice: 300_00, unitCost: 100_00 }],
    });
    const voided = s.sale({ saleDate: "2026-03-06", total: 900_00, status: "void" });
    s.creditNote({
      saleId: voided,
      total: 900_00,
      method: "refund",
      createdAt: "2026-03-07 10:00:00",
      items: [{ productId: p, qty: 3, lineTotal: 900_00 }],
    });
    expect(live).toBeGreaterThan(0);

    const rows = await getBestSellers("2026-03-01", "2026-03-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].units).toBe(3);
  });

  it("nets a genuine return off the units sold", async () => {
    const p = s.product({ name: "Frame" });
    const sale = s.sale({
      saleDate: "2026-03-05",
      total: 900_00,
      items: [{ productId: p, qty: 3, unitPrice: 300_00, unitCost: 100_00 }],
    });
    s.creditNote({
      saleId: sale,
      total: 300_00,
      method: "refund",
      createdAt: "2026-03-07 10:00:00",
      items: [{ productId: p, qty: 1, lineTotal: 300_00 }],
    });

    const rows = await getBestSellers("2026-03-01", "2026-03-31");
    expect(rows[0].units).toBe(2);
  });
});

describe("cost of goods sold", () => {
  it("nets returned goods off the cost", async () => {
    const p = s.product({ name: "Frame", purchasePrice: 300_00 });
    const sale = s.sale({
      saleDate: "2026-03-05",
      total: 1800_00,
      items: [{ productId: p, qty: 2, unitPrice: 900_00, unitCost: 300_00 }],
    });
    const item = Number(
      (s.db.prepare("SELECT id FROM sale_items WHERE sale_id = $1").get({ $1: sale }) as {
        id: number;
      }).id,
    );
    s.db
      .prepare(
        `INSERT INTO credit_notes (sale_id, total, method, cn_number, created_at)
         VALUES ($1, 90000, 'refund', 'A1', '2026-03-06 10:00:00')`,
      )
      .run({ $1: sale });
    const cn = Number(
      (s.db.prepare("SELECT MAX(id) AS id FROM credit_notes").get() as { id: number }).id,
    );
    s.db
      .prepare(
        `INSERT INTO credit_note_items (credit_note_id, sale_item_id, product_id, description, quantity, line_total)
         VALUES ($1, $2, $3, 'Frame', 1, 90000)`,
      )
      .run({ $1: cn, $2: item, $3: p });

    // Two sold at 300.00 cost, one returned -> 300.00 of cost remains.
    expect(await getCogs({ from: "2026-03-01", to: "2026-03-31" })).toBe(300_00);
  });

  it("counts nothing for a period with no sales", async () => {
    expect(await getCogs({ from: "2026-05-01", to: "2026-05-31" })).toBe(0);
  });
});

describe("inventory valuation", () => {
  it("uses variant quantities and per-variant price overrides", async () => {
    const p = s.product({ purchasePrice: 300_00, sellingPrice: 900_00, quantity: 999 });
    s.variant(p, { quantity: 2, purchasePrice: 100_00, sellingPrice: 500_00 });
    s.variant(p, { quantity: 3, purchasePrice: null, sellingPrice: null }); // inherits

    const inv = await getInventoryValuation();
    // 2 x 100.00 + 3 x 300.00 = 1100.00; the parent's own quantity is ignored.
    expect(inv.totalCost).toBe(1100_00);
    expect(inv.totalValue).toBe(2 * 500_00 + 3 * 900_00);
    expect(inv.totalUnits).toBe(5);
  });

  /**
   * The schema trigger makes negative stock unreachable through the app, so
   * this drops it to simulate a row that predates the trigger (migration v3) or
   * arrived via a direct import. The clamp in the valuation is defence in depth
   * for exactly that: without it, one bad row would subtract real money from
   * the reported stock investment.
   */
  it("clamps negative stock so a legacy bad row cannot subtract from the totals", async () => {
    const p = s.product({ purchasePrice: 300_00, sellingPrice: 900_00, quantity: 5 });
    s.db.exec("DROP TRIGGER trg_products_no_negative_stock");
    s.db.prepare("UPDATE products SET quantity = -3 WHERE id = $1").run({ $1: p });

    const inv = await getInventoryValuation();
    expect(inv.totalCost).toBe(0);
    expect(inv.totalUnits).toBe(0);
  });

  it("refuses to drive stock negative through the schema itself", () => {
    const p = s.product({ quantity: 1 });
    expect(() =>
      s.db.prepare("UPDATE products SET quantity = -1 WHERE id = $1").run({ $1: p }),
    ).toThrow(/below zero/i);
  });

  it("excludes services and archived products", async () => {
    s.product({ itemType: "service", purchasePrice: 100_00, quantity: 5 });
    s.product({ archived: true, purchasePrice: 100_00, quantity: 5 });

    const inv = await getInventoryValuation();
    expect(inv.productCount).toBe(0);
    expect(inv.totalCost).toBe(0);
  });
});

describe("stock purchases", () => {
  it("sums supplier purchases in the period by local day", async () => {
    const sup = s.supplier("Essilor");
    s.supplierPurchase(sup, 1000_00, "2026-02-28 23:30:00"); // 1 March local
    s.supplierPurchase(sup, 500_00, "2026-03-15 10:00:00");

    expect(await getStockPurchased({ from: "2026-03-01", to: "2026-03-31" })).toBe(1500_00);
  });

  /** Supplier payments are negative ledger rows and are not purchases. */
  it("ignores payments made to the supplier", async () => {
    const sup = s.supplier("Essilor");
    s.supplierPurchase(sup, 1000_00, "2026-03-05 10:00:00");
    s.db
      .prepare(
        `INSERT INTO supplier_ledger (supplier_id, type, amount, created_at)
         VALUES ($1, 'payment', -60000, '2026-03-06 10:00:00')`,
      )
      .run({ $1: sup });

    expect(await getStockPurchased({ from: "2026-03-01", to: "2026-03-31" })).toBe(1000_00);
  });
});

describe("empty periods", () => {
  it("returns zeros rather than nulls", async () => {
    const p = { from: "2026-07-01", to: "2026-07-31" };
    const r = await getRevenue(p);
    expect(r).toMatchObject({ ttc: 0, ht: 0, tva: 0, timbre: 0, refunds: 0, salesCount: 0 });
    expect(await getCollected(p)).toBe(0);
    expect(await getCogs(p)).toBe(0);

    const overview = await getReportOverview(p.from, p.to);
    expect(overview.avgSale).toBe(0);
    expect(overview.newDebt).toBe(0);
  });
});

describe("TVA on credit notes", () => {
  /**
   * Credit notes carry no tax breakdown, so refunded TVA is extracted using the
   * linked sale's historical rate with **integer** division, matching the Rust
   * `net_ht = total * 10000 / (10000 + rate)` truncation. If either column ever
   * becomes REAL this silently becomes float division and drifts.
   */
  it("extracts refunded TVA with integer truncation, like the write path", async () => {
    const sale = s.sale({
      saleDate: "2026-03-05",
      total: 1190_00,
      taxRate: 1900,
      taxAmount: 190_00,
    });
    s.creditNote({
      saleId: sale,
      total: 190_00,
      method: "refund",
      createdAt: "2026-03-06 10:00:00",
    });

    const r = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    // floor(19000 * 10000 / 11900) = 15966 -> refunded TVA = 19000 - 15966 = 3034
    expect(r.tva).toBe(190_00 - (190_00 - 15966));
    expect(r.tva).toBe(15966);
    expect(Number.isInteger(r.tva)).toBe(true);
  });

  it("treats a credit note on a zero-rated sale as carrying no TVA", async () => {
    const sale = s.sale({ saleDate: "2026-03-05", total: 1000_00, taxRate: 0, taxAmount: 0 });
    s.creditNote({
      saleId: sale,
      total: 400_00,
      method: "refund",
      createdAt: "2026-03-06 10:00:00",
    });

    const r = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    expect(r.tva).toBe(0);
    expect(r.ht).toBe(600_00);
  });

  /** An orphaned credit note (its sale deleted) must not vanish from revenue. */
  it("still counts a credit note whose sale link is null", async () => {
    s.sale({ saleDate: "2026-03-05", total: 1000_00 });
    s.creditNote({
      saleId: null,
      total: 250_00,
      method: "refund",
      createdAt: "2026-03-06 10:00:00",
    });

    const r = await getRevenue({ from: "2026-03-01", to: "2026-03-31" });
    expect(r.refunds).toBe(250_00);
    expect(r.ttc).toBe(750_00);
  });
});

describe("money stays integral", () => {
  /**
   * Money columns are REAL-declared but hold whole centimes. Every metric must
   * return an integer — a fractional centime leaking out would compound through
   * the P&L.
   */
  it("returns whole centimes from every metric", async () => {
    const p = s.product({ purchasePrice: 333, sellingPrice: 999 });
    const sale = s.sale({
      saleDate: "2026-03-05",
      total: 999,
      taxRate: 1900,
      taxAmount: 160,
      items: [{ productId: p, qty: 1, unitPrice: 999, unitCost: 333 }],
    });
    s.payment(sale, 333, "2026-03-05 10:00:00", "cash");
    s.creditNote({ saleId: sale, total: 111, method: "refund", createdAt: "2026-03-06 10:00:00" });

    const period = { from: "2026-03-01", to: "2026-03-31" };
    const r = await getRevenue(period);
    for (const [key, value] of Object.entries(r)) {
      expect(Number.isInteger(value), `${key} = ${value}`).toBe(true);
    }
    expect(Number.isInteger(await getCollected(period))).toBe(true);
    expect(Number.isInteger(await getCogs(period))).toBe(true);
  });
});
