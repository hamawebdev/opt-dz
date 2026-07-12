import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { Color } from "@/types";

// Centralized colour vocabulary. Colours are admin-managed (staff pick, never create).
// Mirrors the categories/brands taxonomy CRUD + `archived` pattern; archiving hides a
// colour from pickers without destroying product/sales history (FKs are ON DELETE SET NULL).

export interface ColorInput {
  name: string;
  name_fr?: string | null;
  name_ar?: string | null;
  hex?: string | null;
  sort_order?: number;
}

/** Active colours for pickers (or all, including archived, for the manager). */
export async function listColors(includeArchived = false): Promise<Color[]> {
  const db = await getDb();
  const where = includeArchived ? "" : "WHERE archived = 0";
  return db.select<Color[]>(
    `SELECT * FROM colors ${where} ORDER BY sort_order, name COLLATE NOCASE`,
  );
}

export async function getColor(id: number): Promise<Color | null> {
  const db = await getDb();
  const rows = await db.select<Color[]>("SELECT * FROM colors WHERE id = $1", [
    id,
  ]);
  return rows[0] ?? null;
}

export async function createColor(input: ColorInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO colors (name, name_fr, name_ar, hex, sort_order)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      input.name.trim(),
      input.name_fr?.trim() || null,
      input.name_ar?.trim() || null,
      normalizeHex(input.hex),
      input.sort_order ?? 0,
    ],
  );
  return res.lastInsertId ?? 0;
}

export async function updateColor(
  id: number,
  input: ColorInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE colors
     SET name = $1, name_fr = $2, name_ar = $3, hex = $4, sort_order = $5
     WHERE id = $6`,
    [
      input.name.trim(),
      input.name_fr?.trim() || null,
      input.name_ar?.trim() || null,
      normalizeHex(input.hex),
      input.sort_order ?? 0,
      id,
    ],
  );
}

export async function setColorArchived(
  id: number,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE colors SET archived = $1 WHERE id = $2", [
    archived ? 1 : 0,
    id,
  ]);
}

/**
 * Merges `fromId` into `intoId`: re-points every product/variant FK and the
 * denormalized variant colour mirror, moves aliases, then archives the source.
 * The long-term answer to any duplication that slips in. Atomic — lives in the
 * Rust `merge_color` command (frontend BEGIN/COMMIT is unsafe on the shared pool).
 */
export async function mergeColor(
  fromId: number,
  intoId: number,
): Promise<void> {
  if (fromId === intoId) return;
  unwrap(await commands.mergeColor(fromId, intoId));
}

/** How many products + variants currently reference a colour (for the manager). */
export async function colorUsageCounts(): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.select<{ color_id: number; n: number }[]>(
    `SELECT color_id, COUNT(*) AS n FROM (
       SELECT color_id FROM products WHERE color_id IS NOT NULL
       UNION ALL
       SELECT color_id FROM product_variants WHERE color_id IS NOT NULL
     ) GROUP BY color_id`,
  );
  const map: Record<number, number> = {};
  for (const r of rows) map[r.color_id] = r.n;
  return map;
}

/**
 * Resolves a free-text colour to a colour id via the alias table (case/space
 * insensitive). Used by the import-review screen and by the seeder. Returns null
 * when no alias matches.
 */
export async function resolveColorId(text: string): Promise<number | null> {
  const norm = text.trim().toLowerCase();
  if (!norm) return null;
  const db = await getDb();
  const rows = await db.select<{ color_id: number }[]>(
    "SELECT color_id FROM color_aliases WHERE alias = $1 COLLATE NOCASE LIMIT 1",
    [norm],
  );
  return rows[0]?.color_id ?? null;
}

/** Registers an alias for a colour (idempotent), so future raw values auto-map. */
export async function addColorAlias(
  colorId: number,
  alias: string,
): Promise<void> {
  const norm = alias.trim().toLowerCase();
  if (!norm) return;
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO color_aliases (color_id, alias) VALUES ($1, $2)",
    [colorId, norm],
  );
}

// ── One-time migration import review ─────────────────────────────────────────

/** Distinct unresolved raw values queued by the v18 migration, with occurrence counts. */
export async function listColorReview(): Promise<
  { raw_value: string; count: number }[]
> {
  const db = await getDb();
  return db.select(
    `SELECT raw_value, COUNT(*) AS count
     FROM color_import_review
     WHERE resolved = 0
     GROUP BY raw_value COLLATE NOCASE
     ORDER BY count DESC, raw_value COLLATE NOCASE`,
  );
}

export async function countColorReview(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(DISTINCT lower(raw_value)) AS n FROM color_import_review WHERE resolved = 0",
  );
  return rows[0]?.n ?? 0;
}

/**
 * Maps every unresolved row sharing `rawValue` to `colorId`: sets the underlying
 * product/variant FK (+ variant colour mirror), records the raw value as an alias
 * so it auto-maps next time, then marks the review rows resolved.
 *
 * Four idempotent set-based statements with `resolved` flipped LAST instead of a
 * transaction (frontend BEGIN/COMMIT is unsafe on the shared pool): if anything
 * fails midway the rows stay visible in the review list and re-running completes.
 */
export async function resolveColorReview(
  rawValue: string,
  colorId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET color_id = $1
     WHERE id IN (SELECT source_id FROM color_import_review
                  WHERE resolved = 0 AND raw_value = $2 COLLATE NOCASE
                    AND source = 'product')`,
    [colorId, rawValue],
  );
  await db.execute(
    `UPDATE product_variants
        SET color_id = $1, color = (SELECT name FROM colors WHERE id = $1)
     WHERE id IN (SELECT source_id FROM color_import_review
                  WHERE resolved = 0 AND raw_value = $2 COLLATE NOCASE
                    AND source <> 'product')`,
    [colorId, rawValue],
  );
  await db.execute(
    "INSERT OR IGNORE INTO color_aliases (color_id, alias) VALUES ($1, $2)",
    [colorId, rawValue.trim().toLowerCase()],
  );
  await db.execute(
    "UPDATE color_import_review SET resolved = 1 WHERE resolved = 0 AND raw_value = $1 COLLATE NOCASE",
    [rawValue],
  );
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** The colour's label in the active UI language, falling back to the canonical name. */
export function colorLabel(c: Color, lang?: string): string {
  if (lang?.startsWith("ar")) return c.name_ar || c.name;
  if (lang?.startsWith("fr")) return c.name_fr || c.name;
  return c.name;
}

/** Normalizes a hex input to '#rrggbb' (uppercase) or null. */
function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const h = hex.trim();
  if (!h) return null;
  const withHash = h.startsWith("#") ? h : `#${h}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
}
