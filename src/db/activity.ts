import { getDb } from "@/lib/db";
import type { ActivityType, PatientActivity } from "@/types";

/** Records a timestamped event on a patient's timeline. Best-effort: a logging
 * failure must never break the underlying action, so callers can ignore rejection. */
export async function logActivity(
  patientId: number,
  type: ActivityType,
  description?: string | null,
  refId?: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO patient_activity (patient_id, type, description, ref_id)
     VALUES ($1, $2, $3, $4)`,
    [patientId, type, description ?? null, refId ?? null],
  );
}

export async function listActivity(
  patientId: number,
): Promise<PatientActivity[]> {
  const db = await getDb();
  return db.select<PatientActivity[]>(
    "SELECT * FROM patient_activity WHERE patient_id = $1 ORDER BY created_at DESC, id DESC",
    [patientId],
  );
}
