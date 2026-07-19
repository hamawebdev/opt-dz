import { getDb } from "@/lib/db";
import { generateEan13 } from "@/lib/barcode";
import { listVariants, variantLabel } from "@/db/variants";
import type { LabelItem } from "@/lib/label-render";
import type { Product } from "@/types";

/** True when `code` is already used by any product or variant barcode. */
export async function barcodeExists(code: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM products WHERE barcode = $1)
          + (SELECT COUNT(*) FROM product_variants WHERE barcode = $1) AS n`,
    [code],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * A unique in-store EAN-13 derived from `seed` (a product/variant id). Product
 * and variant ids share the seed space, so on collision the seed is bumped
 * until the code is free.
 */
export async function generateUniqueEan13(seed: number): Promise<string> {
  for (let s = seed, tries = 0; tries < 1000; s++, tries++) {
    const code = generateEan13(s);
    if (!(await barcodeExists(code))) return code;
  }
  throw new Error("Could not allocate a unique barcode");
}

/** Targeted barcode write — never touches the other descriptive columns. */
export async function setProductBarcode(
  id: number,
  code: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE products SET barcode = $1, updated_at = datetime('now') WHERE id = $2",
    [code, id],
  );
}

export async function setVariantBarcode(
  id: number,
  code: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE product_variants SET barcode = $1, updated_at = datetime('now') WHERE id = $2",
    [code, id],
  );
}

/**
 * Expands products into printable label items: one per active variant (variant
 * barcode/sku), or a single item for variant-less products (product
 * barcode/reference). Anything with no code at all gets a unique EAN-13
 * generated AND persisted, so the printed label scans back at the POS.
 * Returns the generated-code count so callers can refresh product queries.
 */
export async function loadLabelItems(
  products: Product[],
  lang: string | undefined,
): Promise<{ items: LabelItem[]; generated: number }> {
  const items: LabelItem[] = [];
  let generated = 0;

  for (const p of products) {
    if (p.item_type === "service") continue;
    const variants = await listVariants(p.id);

    if (variants.length === 0) {
      let code = p.barcode || p.reference || "";
      if (!code) {
        code = await generateUniqueEan13(p.id);
        await setProductBarcode(p.id, code);
        generated++;
      }
      items.push({
        key: `p${p.id}`,
        productId: p.id,
        variantId: null,
        name: p.name,
        characteristics: "",
        priceCents: p.selling_price,
        code,
        reference: p.reference ?? "",
        qty: 1,
      });
      continue;
    }

    for (const v of variants) {
      let code = v.barcode || v.sku || "";
      if (!code) {
        code = await generateUniqueEan13(v.id);
        await setVariantBarcode(v.id, code);
        generated++;
      }
      items.push({
        key: `v${v.id}`,
        productId: p.id,
        variantId: v.id,
        name: p.name,
        characteristics: variantLabel(v, lang),
        priceCents: v.selling_price ?? p.selling_price,
        code,
        reference: p.reference || v.sku || "",
        qty: 1,
      });
    }
  }

  return { items, generated };
}
