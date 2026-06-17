import { getDb } from "@/lib/db";
import type { Staff, StaffRole } from "@/types";

export async function listStaff(includeInactive = false): Promise<Staff[]> {
  const db = await getDb();
  const where = includeInactive ? "" : "WHERE active = 1";
  return db.select<Staff[]>(
    `SELECT * FROM staff ${where} ORDER BY name COLLATE NOCASE`,
  );
}

export async function createStaff(input: {
  name: string;
  role: StaffRole;
}): Promise<number> {
  const db = await getDb();
  const res = await db.execute("INSERT INTO staff (name, role) VALUES ($1, $2)", [
    input.name,
    input.role,
  ]);
  return res.lastInsertId ?? 0;
}

export async function updateStaff(
  id: number,
  input: { name: string; role: StaffRole; active: number },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE staff SET name = $1, role = $2, active = $3 WHERE id = $4",
    [input.name, input.role, input.active, id],
  );
}
