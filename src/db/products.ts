import { getDb } from "@/lib/db";
import type { ItemType, Product, ProductCategory } from "@/types";

export interface ProductInput {
  category: ProductCategory;
  item_type: ItemType;
  name: string;
  brand?: string | null;
  reference?: string | null;
  barcode?: string | null;
  expiry_date?: string | null;
  purchase_price: number;
  selling_price: number;
  quantity: number;
  min_stock: number;
  supplier?: string | null;
  category_id?: number | null;
  brand_id?: number | null;
  supplier_id?: number | null;
  color_id?: number | null;
}

/** One filterable attribute facet: the product must have `attribute_id` set to one
 * of `values` (matched against value_text or, for multiselect, value_options JSON). */
export interface AttributeFilter {
  attribute_id: number;
  values: string[];
}

export interface ProductFilters {
  search?: string;
  category?: ProductCategory | "all";
  brand?: string;
  /** "all" | "product" | "service". */
  item_type?: ItemType | "all";
  category_id?: number;
  brand_id?: number;
  color_id?: number;
  /** "all" | "in" (in stock) | "low" (at/below threshold) | "out" (zero). */
  availability?: "all" | "in" | "low" | "out";
  /** EAV facet filters (see Feature 5). All must match (AND). */
  attributes?: AttributeFilter[];
  /** Include archived (soft-deleted) products. Defaults to false. */
  includeArchived?: boolean;
}

export async function listProducts(
  filters: ProductFilters = {},
): Promise<Product[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  // Hide archived products unless explicitly requested.
  if (!filters.includeArchived) where.push("archived = 0");

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(
      `(name LIKE ${p} OR brand LIKE ${p} OR reference LIKE ${p} OR barcode LIKE ${p})`,
    );
  }
  if (filters.category && filters.category !== "all") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters.item_type && filters.item_type !== "all") {
    params.push(filters.item_type);
    where.push(`item_type = $${params.length}`);
  }
  if (filters.brand?.trim()) {
    params.push(filters.brand.trim());
    where.push(`brand = $${params.length}`);
  }
  if (filters.category_id != null) {
    params.push(filters.category_id);
    where.push(`category_id = $${params.length}`);
  }
  if (filters.brand_id != null) {
    params.push(filters.brand_id);
    where.push(`brand_id = $${params.length}`);
  }
  if (filters.color_id != null) {
    params.push(filters.color_id);
    where.push(`color_id = $${params.length}`);
  }
  // Services have no stock, so availability filters implicitly mean products.
  if (filters.availability === "in") where.push("quantity > 0");
  else if (filters.availability === "out") where.push("quantity <= 0");
  else if (filters.availability === "low") where.push("quantity <= min_stock");

  // EAV facet filters: one EXISTS per attribute, all ANDed together.
  for (const f of filters.attributes ?? []) {
    if (!f.values.length) continue;
    const ph = f.values.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    params.push(f.attribute_id);
    const attrParam = `$${params.length}`;
    // value_text matches single-select/text; value_options is a JSON array for
    // multiselect, matched loosely with LIKE on the quoted token.
    const likeClauses = f.values
      .map((v) => {
        params.push(`%"${v}"%`);
        return `v.value_options LIKE $${params.length}`;
      })
      .join(" OR ");
    where.push(
      `EXISTS (SELECT 1 FROM product_attribute_values v
               WHERE v.product_id = products.id AND v.attribute_id = ${attrParam}
                 AND (v.value_text IN (${ph.join(",")}) OR ${likeClauses}))`,
    );
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<Product[]>(
    `SELECT * FROM products ${clause} ORDER BY name COLLATE NOCASE`,
    params,
  );
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(
    "SELECT * FROM products WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** Distinct non-empty brand names, for filter dropdowns. */
export async function listBrands(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ brand: string }[]>(
    "SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand COLLATE NOCASE",
  );
  return rows.map((r) => r.brand);
}

/** Stocked products that carry an expiry date, soonest first (for tracking + alerts). */
export async function listProductsWithExpiry(): Promise<Product[]> {
  const db = await getDb();
  return db.select<Product[]>(
    `SELECT * FROM products
     WHERE item_type = 'product' AND archived = 0
       AND expiry_date IS NOT NULL AND expiry_date <> ''
     ORDER BY expiry_date ASC`,
  );
}

/** Stocked products at or below their minimum stock threshold (services + archived excluded). */
export async function listLowStock(): Promise<Product[]> {
  const db = await getDb();
  return db.select<Product[]>(
    "SELECT * FROM products WHERE item_type = 'product' AND archived = 0 AND quantity <= min_stock ORDER BY quantity ASC, name COLLATE NOCASE",
  );
}

export async function createProduct(input: ProductInput): Promise<number> {
  const db = await getDb();
  const isService = input.item_type === "service";
  const res = await db.execute(
    `INSERT INTO products
       (category, item_type, name, brand, reference, barcode, expiry_date,
        purchase_price, selling_price, quantity, min_stock,
        supplier, category_id, brand_id, supplier_id, color_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      input.category,
      input.item_type,
      input.name,
      input.brand ?? null,
      input.reference ?? null,
      isService ? null : (input.barcode ?? null),
      isService ? null : (input.expiry_date ?? null),
      input.purchase_price,
      input.selling_price,
      isService ? 0 : input.quantity,
      isService ? 0 : input.min_stock,
      input.supplier ?? null,
      input.category_id ?? null,
      input.brand_id ?? null,
      isService ? null : (input.supplier_id ?? null),
      isService ? null : (input.color_id ?? null),
    ],
  );
  // Record the opening quantity as an initial delivery for history (products only).
  if (res.lastInsertId && !isService && input.quantity > 0) {
    await db.execute(
      "INSERT INTO stock_movements (product_id, type, quantity_change, note) VALUES ($1, 'delivery', $2, 'Initial stock')",
      [res.lastInsertId, input.quantity],
    );
  }
  return res.lastInsertId ?? 0;
}

export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<void> {
  const db = await getDb();
  const isService = input.item_type === "service";
  // NOTE: `quantity` is intentionally NOT updated here — on-hand stock is owned by the
  // movement ledger (deliveries/adjustments/sales), never blind-written from the form
  // (audit finding A5). Only the min-stock threshold and descriptive fields are edited.
  await db.execute(
    `UPDATE products
     SET category = $1, item_type = $2, name = $3, brand = $4, reference = $5,
         barcode = $6, expiry_date = $7, purchase_price = $8, selling_price = $9,
         min_stock = $10, supplier = $11,
         category_id = $12, brand_id = $13, supplier_id = $14, color_id = $15,
         updated_at = datetime('now')
     WHERE id = $16`,
    [
      input.category,
      input.item_type,
      input.name,
      input.brand ?? null,
      input.reference ?? null,
      isService ? null : (input.barcode ?? null),
      isService ? null : (input.expiry_date ?? null),
      input.purchase_price,
      input.selling_price,
      isService ? 0 : input.min_stock,
      input.supplier ?? null,
      input.category_id ?? null,
      input.brand_id ?? null,
      isService ? null : (input.supplier_id ?? null),
      isService ? null : (input.color_id ?? null),
      id,
    ],
  );
}

/** Soft-delete: hide a discontinued product from catalogs/POS while preserving its
 * stock-movement history and sales links (audit finding C3). */
export async function archiveProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE products SET archived = 1, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

export async function unarchiveProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE products SET archived = 0, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

/** Hard-delete, allowed only for a product with no history (no movements, sale lines or
 * variants). Anything with history must be archived so its records survive. */
export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM stock_movements WHERE product_id = $1)
          + (SELECT COUNT(*) FROM sale_items     WHERE product_id = $1)
          + (SELECT COUNT(*) FROM product_variants WHERE product_id = $1) AS n`,
    [id],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error("PRODUCT_HAS_HISTORY");
  }
  await db.execute("DELETE FROM products WHERE id = $1", [id]);
}
