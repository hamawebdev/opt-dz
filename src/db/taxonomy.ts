import { getDb } from "@/lib/db";
import type { Brand, Category } from "@/types";

// Managed merchandising taxonomy (categories + brands). These are distinct from the
// fixed optical `category`/type (frame/lens/accessory) on products. Mirrors the
// payers CRUD pattern; archiving hides a row from pickers without deleting history.

export async function listCategories(includeArchived = false): Promise<Category[]> {
  const db = await getDb();
  const where = includeArchived ? "" : "WHERE archived = 0";
  return db.select<Category[]>(
    `SELECT * FROM categories ${where} ORDER BY name COLLATE NOCASE`,
  );
}

export async function createCategory(name: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute("INSERT INTO categories (name) VALUES ($1)", [
    name.trim(),
  ]);
  return res.lastInsertId ?? 0;
}

export async function updateCategory(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET name = $1 WHERE id = $2", [
    name.trim(),
    id,
  ]);
}

export async function setCategoryArchived(
  id: number,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET archived = $1 WHERE id = $2", [
    archived ? 1 : 0,
    id,
  ]);
}

export async function listBrandRows(includeArchived = false): Promise<Brand[]> {
  const db = await getDb();
  const where = includeArchived ? "" : "WHERE archived = 0";
  return db.select<Brand[]>(
    `SELECT * FROM brands ${where} ORDER BY name COLLATE NOCASE`,
  );
}

export async function createBrand(name: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute("INSERT INTO brands (name) VALUES ($1)", [
    name.trim(),
  ]);
  return res.lastInsertId ?? 0;
}

export async function updateBrand(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE brands SET name = $1 WHERE id = $2", [
    name.trim(),
    id,
  ]);
}

export async function setBrandArchived(
  id: number,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE brands SET archived = $1 WHERE id = $2", [
    archived ? 1 : 0,
    id,
  ]);
}
