import { getDb } from "@/lib/db";
import type { ProductVariant } from "@/types";

export interface VariantInput {
  label?: string | null;
  /** Centralized colour reference. The free-text `color` mirror is derived from it. */
  color_id?: number | null;
  size?: string | null;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  min_stock: number;
  selling_price?: number | null; // centimes
  purchase_price?: number | null;
}

/** Joins the centralized colour onto a variant row (canonical + bilingual + swatch). */
const COLOR_JOIN = `LEFT JOIN colors c ON c.id = v.color_id`;
const COLOR_COLS = `c.name AS color_name, c.name_fr AS color_name_fr,
                    c.name_ar AS color_name_ar, c.hex AS color_hex`;

export async function listVariants(
  productId: number,
  includeArchived = false,
): Promise<ProductVariant[]> {
  const db = await getDb();
  const where = includeArchived ? "" : "AND v.archived = 0";
  return db.select<ProductVariant[]>(
    `SELECT v.*, ${COLOR_COLS}
     FROM product_variants v ${COLOR_JOIN}
     WHERE v.product_id = $1 ${where} ORDER BY v.id`,
    [productId],
  );
}

/** A variant row joined to its parent product's name + base price (sales picker / POS). */
export type SellableVariant = ProductVariant & {
  product_name: string;
  product_price: number;
};

/** Variants joined to their parent product name + price, for the sales picker. */
export async function listSellableVariants(): Promise<SellableVariant[]> {
  const db = await getDb();
  return db.select(
    `SELECT v.*, ${COLOR_COLS}, p.name AS product_name, p.selling_price AS product_price
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     ${COLOR_JOIN}
     WHERE v.archived = 0 ORDER BY p.name COLLATE NOCASE, v.id`,
  );
}

export async function createVariant(
  productId: number,
  input: VariantInput,
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO product_variants
       (product_id, label, color_id, color, size, sku, barcode, quantity, min_stock, selling_price, purchase_price)
     VALUES ($1,$2,$3,(SELECT name FROM colors WHERE id = $4),$5,$6,$7,$8,$9,$10,$11)`,
    [
      productId,
      input.label ?? null,
      input.color_id ?? null,
      input.color_id ?? null, // mirror lookup ($4)
      input.size ?? null,
      input.sku ?? null,
      input.barcode ?? null,
      input.quantity,
      input.min_stock,
      input.selling_price ?? null,
      input.purchase_price ?? null,
    ],
  );
  // Record any opening stock as a delivery movement so the variant ledger stays complete.
  if (res.lastInsertId && input.quantity > 0) {
    await db.execute(
      "INSERT INTO stock_movements (product_id, variant_id, type, quantity_change, note) VALUES ($1, $2, 'delivery', $3, 'Initial stock')",
      [productId, res.lastInsertId, input.quantity],
    );
  }
  return res.lastInsertId ?? 0;
}

export async function updateVariant(
  id: number,
  input: VariantInput,
): Promise<void> {
  const db = await getDb();
  // `quantity` is intentionally NOT written here — variant on-hand is owned by the
  // movement ledger (recordVariantDelivery/recordVariantAdjustment), never blind-written
  // from the editor (audit finding A5/C1). Descriptive fields and threshold only.
  await db.execute(
    `UPDATE product_variants
     SET label = $1, color_id = $2, color = (SELECT name FROM colors WHERE id = $3),
         size = $4, sku = $5, barcode = $6,
         min_stock = $7, selling_price = $8, purchase_price = $9,
         updated_at = datetime('now')
     WHERE id = $10`,
    [
      input.label ?? null,
      input.color_id ?? null,
      input.color_id ?? null, // mirror lookup ($3)
      input.size ?? null,
      input.sku ?? null,
      input.barcode ?? null,
      input.min_stock,
      input.selling_price ?? null,
      input.purchase_price ?? null,
      id,
    ],
  );
}

export async function deleteVariant(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM product_variants WHERE id = $1", [id]);
}

/** A nice display label for a variant (falls back to colour/size/sku). Prefers the
 * joined colour name in the active language, then the canonical/mirror text. */
export function variantLabel(v: ProductVariant, lang?: string): string {
  if (v.label) return v.label;
  const colour =
    (lang?.startsWith("ar") && v.color_name_ar) ||
    (lang?.startsWith("fr") && v.color_name_fr) ||
    v.color_name ||
    v.color ||
    null;
  const parts = [colour, v.size].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return v.sku || `#${v.id}`;
}
