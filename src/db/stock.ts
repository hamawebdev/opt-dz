import { getDb } from "@/lib/db";
import type { StockMovement } from "@/types";

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
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE products SET quantity = quantity + $1, updated_at = datetime('now') WHERE id = $2",
      [args.quantity, args.productId],
    );
    if (args.purchasePrice != null) {
      await db.execute(
        "UPDATE products SET purchase_price = $1 WHERE id = $2",
        [args.purchasePrice, args.productId],
      );
    }
    await db.execute(
      "INSERT INTO stock_movements (product_id, type, quantity_change, note) VALUES ($1, 'delivery', $2, $3)",
      [args.productId, args.quantity, args.note ?? null],
    );
    if (args.supplierId && args.debtAmount && args.debtAmount > 0) {
      await db.execute(
        `INSERT INTO supplier_ledger (supplier_id, type, amount, note, ref)
         VALUES ($1, 'purchase', $2, $3, $4)`,
        [
          args.supplierId,
          args.debtAmount,
          args.note ?? null,
          `Delivery: product #${args.productId}`,
        ],
      );
    }
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}

/** Manual stock adjustment (positive or negative), e.g. corrections/breakage. The
 * quantity change and its movement record are written in one transaction so the
 * product's on-hand can never diverge from its movement ledger. */
export async function recordAdjustment(args: {
  productId: number;
  quantityChange: number;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE products SET quantity = quantity + $1, updated_at = datetime('now') WHERE id = $2",
      [args.quantityChange, args.productId],
    );
    await db.execute(
      "INSERT INTO stock_movements (product_id, type, quantity_change, note) VALUES ($1, 'adjustment', $2, $3)",
      [args.productId, args.quantityChange, args.note ?? null],
    );
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
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
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE product_variants SET quantity = quantity + $1, updated_at = datetime('now') WHERE id = $2",
      [args.quantityChange, args.variantId],
    );
    await db.execute(
      "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note) VALUES ($1, $2, $3, $4, $5)",
      [
        args.productId,
        args.variantId,
        args.type ?? "adjustment",
        args.quantityChange,
        args.note ?? null,
      ],
    );
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
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
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE product_variants SET quantity = quantity + $1, updated_at = datetime('now') WHERE id = $2",
      [args.quantity, args.variantId],
    );
    if (args.purchasePrice != null) {
      await db.execute(
        "UPDATE product_variants SET purchase_price = $1 WHERE id = $2",
        [args.purchasePrice, args.variantId],
      );
    }
    await db.execute(
      "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note) VALUES ($1, $2, 'delivery', $3, $4)",
      [args.productId, args.variantId, args.quantity, args.note ?? null],
    );
    if (args.supplierId && args.debtAmount && args.debtAmount > 0) {
      await db.execute(
        `INSERT INTO supplier_ledger (supplier_id, type, amount, note, ref)
         VALUES ($1, 'purchase', $2, $3, $4)`,
        [
          args.supplierId,
          args.debtAmount,
          args.note ?? null,
          `Delivery: variant #${args.variantId}`,
        ],
      );
    }
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}
