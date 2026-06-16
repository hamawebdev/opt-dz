import { getDb } from "@/lib/db";
import type { Payer } from "@/types";

export interface PayerInput {
  name: string;
  type: string | null;
  default_coverage_pct: number; // basis points
  notes: string | null;
}

export async function listPayers(): Promise<Payer[]> {
  const db = await getDb();
  return db.select<Payer[]>("SELECT * FROM payers ORDER BY name");
}

export async function createPayer(input: PayerInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO payers (name, type, default_coverage_pct, notes)
     VALUES ($1, $2, $3, $4)`,
    [input.name, input.type, input.default_coverage_pct, input.notes],
  );
  return res.lastInsertId ?? 0;
}

export async function updatePayer(id: number, input: PayerInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE payers SET name = $1, type = $2, default_coverage_pct = $3, notes = $4 WHERE id = $5`,
    [input.name, input.type, input.default_coverage_pct, input.notes, id],
  );
}

/** Deletes a payer. Fails (FK RESTRICT) if any claim references it. */
export async function deletePayer(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM payers WHERE id = $1", [id]);
}
