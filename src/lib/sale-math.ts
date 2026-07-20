/**
 * Pure sale money math, kept in lockstep with the authoritative Rust
 * `create_sale` command (`src-tauri/src/lib.rs`).
 *
 * Extracted out of `src/db/sales.ts` so it can be imported — and tested —
 * without dragging in the Tauri SQL plugin at module scope.
 *
 * All money is integer **centimes**. `discountValue` is centimes for an amount
 * discount and **basis points** for a percent discount (1500 = 15.00%).
 */

export type DiscountKind = "amount" | "percent";

/** The money-bearing fields of a sale line. */
export interface SaleLine {
  unit_price: number;
  quantity: number;
  item_discount: number;
}

export function lineTotal(item: SaleLine): number {
  return Math.max(0, item.unit_price * item.quantity - item.item_discount);
}

/**
 * Subtotal and total (after the overall discount), in integer centimes.
 *
 * The percent discount **truncates** rather than rounds. Rust computes
 * `subtotal * bp / 10000` with i128 integer division, and the server value is
 * the one that gets stored — so rounding here would show the cashier a total
 * one centime away from the invoice they are about to print.
 */
export function computeTotals(
  items: SaleLine[],
  discountType: DiscountKind,
  discountValue: number,
): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const discountAmount =
    discountType === "percent"
      ? Math.floor((subtotal * discountValue) / 10000)
      : discountValue;
  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, total };
}
