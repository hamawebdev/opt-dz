import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { StockMovement } from "@/types";

// All stock writes go through the Rust `record_stock_change` command so the
// quantity update, movement ledger entry, purchase-price update and supplier
// debt land in ONE real transaction. (Frontend BEGIN/COMMIT is unsafe here:
// each statement runs on an arbitrary pooled connection.)

/** Stock movement history for a product, most recent first. */
export async function listMovements(
  productId: number,
): Promise<StockMovement[]> {
  const db = await getDb();
  return db.select<StockMovement[]>(
    "SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC, id DESC",
    [productId],
  );
}

/**
 * Records a supplier delivery: increments product quantity and logs a movement.
 * Optionally updates the purchase price to the latest delivery cost, and — when a
 * supplier is given — books the purchase as a debt in that supplier's ledger so
 * the balance owed updates automatically. All steps run in one transaction.
 */
export async function recordDelivery(args: {
  productId: number;
  quantity: number;
  purchasePrice?: number | null;
  note?: string | null;
  supplierId?: number | null;
  /** Total purchase cost (centimes) to book as a supplier debt. */
  debtAmount?: number | null;
}): Promise<void> {
  unwrap(
    await commands.recordStockChange({
      product_id: args.productId,
      variant_id: null,
      movement_type: "delivery",
      quantity_change: args.quantity,
      purchase_price: args.purchasePrice ?? null,
      note: args.note ?? null,
      supplier_id: args.supplierId ?? null,
      debt_amount: args.debtAmount ?? null,
    }),
  );
}

/** Manual stock adjustment (positive or negative), e.g. corrections/breakage. The
 * quantity change and its movement record are written in one transaction so the
 * product's on-hand can never diverge from its movement ledger. */
export async function recordAdjustment(args: {
  productId: number;
  quantityChange: number;
  note?: string | null;
}): Promise<void> {
  unwrap(
    await commands.recordStockChange({
      product_id: args.productId,
      variant_id: null,
      movement_type: "adjustment",
      quantity_change: args.quantityChange,
      purchase_price: null,
      note: args.note ?? null,
      supplier_id: null,
      debt_amount: null,
    }),
  );
}

/** Variant stock change (delta, ±), logged as a movement against the variant so a
 * variant's on-hand never diverges from its ledger. Used by the variant editor and
 * variant deliveries. A no-op when the delta is 0. */
export async function recordVariantAdjustment(args: {
  productId: number | null;
  variantId: number;
  quantityChange: number;
  type?: "delivery" | "adjustment";
  note?: string | null;
}): Promise<void> {
  if (!args.quantityChange) return;
  unwrap(
    await commands.recordStockChange({
      product_id: args.productId,
      variant_id: args.variantId,
      movement_type: args.type ?? "adjustment",
      quantity_change: args.quantityChange,
      purchase_price: null,
      note: args.note ?? null,
      supplier_id: null,
      debt_amount: null,
    }),
  );
}

/** Records a variant delivery: increments variant stock, logs a delivery movement,
 * optionally updates the variant purchase price, and books a supplier debt. */
export async function recordVariantDelivery(args: {
  productId: number | null;
  variantId: number;
  quantity: number;
  purchasePrice?: number | null;
  note?: string | null;
  supplierId?: number | null;
  debtAmount?: number | null;
}): Promise<void> {
  unwrap(
    await commands.recordStockChange({
      product_id: args.productId,
      variant_id: args.variantId,
      movement_type: "delivery",
      quantity_change: args.quantity,
      purchase_price: args.purchasePrice ?? null,
      note: args.note ?? null,
      supplier_id: args.supplierId ?? null,
      debt_amount: args.debtAmount ?? null,
    }),
  );
}
