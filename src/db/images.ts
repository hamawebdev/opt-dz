import { getDb } from "@/lib/db";
import type { ProductImage } from "@/types";

// Product images are stored as base64 data URIs in the `path` column — the same
// proven approach the app already uses for the shop logo. This avoids filesystem
// capability / asset-protocol configuration and renders directly via <img src>.

export async function listImages(productId: number): Promise<ProductImage[]> {
  const db = await getDb();
  return db.select<ProductImage[]>(
    "SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, sort_order, id",
    [productId],
  );
}

/** Stores a base64 data-URI image for a product; the first one becomes primary. */
export async function addImage(
  productId: number,
  dataUri: string,
): Promise<number> {
  const db = await getDb();
  const existing = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM product_images WHERE product_id = $1",
    [productId],
  );
  const isPrimary = (existing[0]?.c ?? 0) === 0 ? 1 : 0;
  const res = await db.execute(
    "INSERT INTO product_images (product_id, path, is_primary) VALUES ($1, $2, $3)",
    [productId, dataUri, isPrimary],
  );
  return res.lastInsertId ?? 0;
}

export async function deleteImage(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM product_images WHERE id = $1", [id]);
}

export async function setPrimaryImage(
  id: number,
  productId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE product_images SET is_primary = 0 WHERE product_id = $1",
      [productId],
    );
    await db.execute("UPDATE product_images SET is_primary = 1 WHERE id = $1", [
      id,
    ]);
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}

/** Primary image data-URI per product id, for catalog thumbnails. */
export async function primaryImagesByProduct(): Promise<Record<number, string>> {
  const db = await getDb();
  const rows = await db.select<{ product_id: number; path: string }[]>(
    "SELECT product_id, path FROM product_images WHERE is_primary = 1",
  );
  return Object.fromEntries(rows.map((r) => [r.product_id, r.path]));
}
