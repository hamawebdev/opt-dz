import { describe, expect, it } from "vitest";
import { computeTotals, lineTotal, type SaleLine } from "./sale-math";

const line = (unit_price: number, quantity: number, item_discount = 0): SaleLine => ({
  unit_price,
  quantity,
  item_discount,
});

describe("lineTotal", () => {
  it("multiplies then subtracts the line discount", () => {
    expect(lineTotal(line(900_00, 3, 100_00))).toBe(2600_00);
  });

  it("floors at zero when the discount exceeds the line", () => {
    expect(lineTotal(line(100_00, 1, 250_00))).toBe(0);
  });
});

describe("computeTotals", () => {
  it("sums lines with no discount", () => {
    expect(computeTotals([line(900_00, 2), line(150_00, 1)], "amount", 0)).toEqual({
      subtotal: 1950_00,
      total: 1950_00,
    });
  });

  it("subtracts an amount discount", () => {
    expect(computeTotals([line(1000_00, 1)], "amount", 250_00)).toEqual({
      subtotal: 1000_00,
      total: 750_00,
    });
  });

  it("never returns a negative total", () => {
    expect(computeTotals([line(100_00, 1)], "amount", 500_00).total).toBe(0);
  });

  it("clamps a negative line to zero rather than crediting the sale", () => {
    expect(computeTotals([line(100_00, 1, 500_00)], "amount", 0)).toEqual({
      subtotal: 0,
      total: 0,
    });
  });
});

/**
 * Parity table. `src-tauri/src/tests/sales_create.rs` asserts the same cases
 * against `create_sale_tx`, so any divergence between the client preview and
 * the stored invoice fails one side or the other.
 *
 * The percent discount **truncates**: Rust uses i128 integer division and its
 * value is the one persisted. `Math.round` here previously produced a preview
 * one centime off the printed invoice.
 */
describe("percent discount matches the Rust write path", () => {
  const cases: [subtotal: number, bp: number, expectedDiscount: number][] = [
    [1333, 1500, 199], // 199.95 -> 199, the case Math.round got wrong
    [1000_00, 1500, 150_00], // exact
    [999, 3333, 332], // 332.967 -> 332
    [1, 5000, 0], // 0.5 -> 0
    [7, 10000, 7], // full discount
    [12345, 1, 1], // 1.2345 -> 1
  ];

  it.each(cases)("subtotal %i at %i bp discounts %i", (subtotal, bp, expected) => {
    const { total } = computeTotals([line(subtotal, 1)], "percent", bp);
    expect(subtotal - total).toBe(expected);
  });
});
