/**
 * Proves the harness itself works: real migrations, real schema constraints, and
 * production `src/db` code running unmodified against the node:sqlite double.
 * If this file fails, no other integration result means anything.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scenario } from "../support/scenario";
import { loadMigrations } from "../support/migrations";

let s: Scenario;
beforeEach(() => {
  s = new Scenario();
});
afterEach(() => s.close());

describe("migration loading", () => {
  it("loads every migration from the Rust source of truth", () => {
    const ms = loadMigrations();
    expect(ms.length).toBeGreaterThanOrEqual(25);
    expect(ms[0].description).toBe("create_initial_schema");
    expect(ms.map((m) => m.version)).toEqual([...ms].sort((a, b) => a.version - b.version).map((m) => m.version));
  });

  /**
   * Migration v3 defines triggers whose bodies contain semicolons. Applying
   * migrations by splitting on ';' truncates them into invalid SQL, so this
   * asserts the triggers actually survived and are enforcing.
   */
  it("applies trigger bodies intact (not split on semicolons)", () => {
    const p = s.product({ quantity: 1 });
    expect(() =>
      s.db.prepare("UPDATE products SET quantity = -5 WHERE id = $1").run({ $1: p }),
    ).toThrow(/below zero/i);
  });
});

describe("plugin-sql stub", () => {
  it("binds $n parameters the way the real plugin does", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:app.db");
    s.product({ name: "Ray-Ban Aviator", quantity: 4 });

    const rows = await db.select<{ name: string; quantity: number }[]>(
      "SELECT name, quantity FROM products WHERE quantity >= $1 AND name LIKE $2",
      [2, "Ray%"],
    );
    expect(rows).toEqual([{ name: "Ray-Ban Aviator", quantity: 4 }]);
  });

  it("returns plain objects, not null-prototype rows", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:app.db");
    s.product({ name: "X" });
    const [row] = await db.select<{ name: string }[]>("SELECT name FROM products");
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  });

  it("reports lastInsertId and rowsAffected from execute()", async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load("sqlite:app.db");
    const r = await db.execute("INSERT INTO patients (full_name) VALUES ($1)", ["Nadia"]);
    expect(r.rowsAffected).toBe(1);
    expect(r.lastInsertId).toBeGreaterThan(0);
  });
});

describe("production report code runs unmodified", () => {
  it("drives getReportOverview against the real schema", async () => {
    const { getReportOverview } = await import("@/db/reports");
    const pat = s.patient("Karim");
    const prod = s.product({ purchasePrice: 300_00, sellingPrice: 900_00, quantity: 10 });
    const sale = s.sale({
      saleDate: "2026-03-10",
      patientId: pat,
      total: 900_00,
      items: [{ productId: prod, qty: 1, unitPrice: 900_00, unitCost: 300_00 }],
    });
    s.payment(sale, 900_00, "2026-03-10 09:00:00", "card");

    const o = await getReportOverview("2026-03-01", "2026-03-31");
    expect(o.salesCount).toBe(1);
    expect(o.collected).toBe(900_00);
  });
});
