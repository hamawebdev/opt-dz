import { getDb } from "@/lib/db";
import type { ItemType, Product, ProductCategory } from "@/types";

// Catalog rows power the POS product browser. They extend a plain product with the
// few aggregates a card needs: whether it has variants (1-click add vs. variant
// chooser), its effective stock, favourite state, and the simple-product colour.
export interface CatalogProduct extends Product {
  variant_count: number; // active variants (0 = simple product)
  variant_stock: number; // summed variant stock (only meaningful when variant_count > 0)
  is_favorite: number; // 0 | 1
  color_name: string | null; // joined from `colors` (simple products only)
  color_hex: string | null;
}

export interface CatalogFilters {
  /** Free text across name, brand, reference, barcode, supplier, colour, and
   * variant sku/barcode. */
  search?: string;
  category?: ProductCategory | "all";
  brand_id?: number | null;
  color_id?: number | null;
  /** Only items currently sellable (effective stock > 0, or any service). */
  inStockOnly?: boolean;
  favoritesOnly?: boolean;
}

export interface CatalogPage {
  items: CatalogProduct[];
  /** Offset to request next, or null when the last page was returned. */
  nextOffset: number | null;
}

/** Stock shown on a card: variant total for variant products, else the product's own. */
export function effectiveStock(p: {
  variant_count: number;
  variant_stock: number;
  quantity: number;
}): number {
  return p.variant_count > 0 ? p.variant_stock : p.quantity;
}

const AGGREGATES = `
  (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0) AS variant_count,
  (SELECT COALESCE(SUM(v.quantity), 0) FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0) AS variant_stock,
  EXISTS(SELECT 1 FROM product_favorites f WHERE f.product_id = p.id) AS is_favorite,
  c.name AS color_name, c.hex AS color_hex`;

/**
 * One page of catalog products for the POS browser. Searches widely (incl. supplier,
 * colour name, and variant sku/barcode), supports the quick filters, and paginates
 * via LIMIT/OFFSET. Fetches one extra row to tell whether a next page exists.
 */
export async function listCatalog(
  filters: CatalogFilters = {},
  limit = 40,
  offset = 0,
): Promise<CatalogPage> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const s = `$${params.length}`;
    where.push(
      `(p.name LIKE ${s} OR p.brand LIKE ${s} OR p.reference LIKE ${s}
        OR p.barcode LIKE ${s} OR p.supplier LIKE ${s} OR c.name LIKE ${s}
        OR EXISTS (SELECT 1 FROM product_variants vs
                   WHERE vs.product_id = p.id AND vs.archived = 0
                     AND (vs.barcode LIKE ${s} OR vs.sku LIKE ${s})))`,
    );
  }
  if (filters.category && filters.category !== "all") {
    params.push(filters.category);
    where.push(`p.category = $${params.length}`);
  }
  if (filters.brand_id != null) {
    params.push(filters.brand_id);
    where.push(`p.brand_id = $${params.length}`);
  }
  if (filters.color_id != null) {
    params.push(filters.color_id);
    where.push(`p.color_id = $${params.length}`);
  }
  if (filters.favoritesOnly) {
    where.push(
      `EXISTS (SELECT 1 FROM product_favorites f WHERE f.product_id = p.id)`,
    );
  }
  if (filters.inStockOnly) {
    // Services have no stock but stay sellable; variant products use the variant total.
    where.push(`(p.item_type = 'service'
      OR (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0) > 0
         AND (SELECT COALESCE(SUM(v.quantity), 0) FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0) > 0
      OR (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0) = 0
         AND p.quantity > 0)`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit + 1);
  const limitP = `$${params.length}`;
  params.push(offset);
  const offsetP = `$${params.length}`;

  const rows = await db.select<CatalogProduct[]>(
    `SELECT p.*, ${AGGREGATES}
     FROM products p
     LEFT JOIN colors c ON c.id = p.color_id
     ${clause}
     ORDER BY p.name COLLATE NOCASE, p.id
     LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  );

  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    nextOffset: hasMore ? offset + limit : null,
  };
}

/** Distinct products sold most recently, newest first — a quick-pick shelf for the POS. */
export async function listRecentlySold(limit = 24): Promise<CatalogProduct[]> {
  const db = await getDb();
  return db.select<CatalogProduct[]>(
    `SELECT p.*, ${AGGREGATES}, MAX(s.sale_date) AS last_sold
     FROM products p
     JOIN sale_items si ON si.product_id = p.id
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN colors c ON c.id = p.color_id
     GROUP BY p.id
     ORDER BY last_sold DESC
     LIMIT $1`,
    [limit],
  );
}

/** Toggles a product's favourite flag. Returns the new state (true = now favourite). */
export async function toggleFavorite(productId: number): Promise<boolean> {
  const db = await getDb();
  const existing = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM product_favorites WHERE product_id = $1",
    [productId],
  );
  if ((existing[0]?.c ?? 0) > 0) {
    await db.execute("DELETE FROM product_favorites WHERE product_id = $1", [
      productId,
    ]);
    return false;
  }
  await db.execute("INSERT INTO product_favorites (product_id) VALUES ($1)", [
    productId,
  ]);
  return true;
}

// Re-exported so callers don't need to import from two modules.
export type { ItemType };
