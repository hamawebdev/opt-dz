import { getDb } from "@/lib/db";
import type { Prescription } from "@/types";

export interface PrescriptionInput {
  patient_id: number;
  exam_date: string;
  r_sphere?: number | null;
  r_cylinder?: number | null;
  r_axis?: number | null;
  r_add?: number | null;
  r_pd?: number | null;
  l_sphere?: number | null;
  l_cylinder?: number | null;
  l_axis?: number | null;
  l_add?: number | null;
  l_pd?: number | null;
  lens_type?: string | null;
  r_prism?: number | null;
  r_base?: string | null;
  r_seg_height?: number | null;
  l_prism?: number | null;
  l_base?: string | null;
  l_seg_height?: number | null;
  prescriber?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}

/** Prescriptions for a patient, most recent first (history view). */
export async function listPrescriptions(patientId: number): Promise<Prescription[]> {
  const db = await getDb();
  return db.select<Prescription[]>(
    "SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY exam_date DESC, id DESC",
    [patientId],
  );
}

export async function getPrescription(id: number): Promise<Prescription | null> {
  const db = await getDb();
  const rows = await db.select<Prescription[]>("SELECT * FROM prescriptions WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createPrescription(input: PrescriptionInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO prescriptions
       (patient_id, exam_date, r_sphere, r_cylinder, r_axis, r_add, r_pd,
        l_sphere, l_cylinder, l_axis, l_add, l_pd,
        lens_type, r_prism, r_base, r_seg_height, l_prism, l_base, l_seg_height,
        prescriber, expiry_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      input.patient_id,
      input.exam_date,
      input.r_sphere ?? null,
      input.r_cylinder ?? null,
      input.r_axis ?? null,
      input.r_add ?? null,
      input.r_pd ?? null,
      input.l_sphere ?? null,
      input.l_cylinder ?? null,
      input.l_axis ?? null,
      input.l_add ?? null,
      input.l_pd ?? null,
      input.lens_type ?? null,
      input.r_prism ?? null,
      input.r_base ?? null,
      input.r_seg_height ?? null,
      input.l_prism ?? null,
      input.l_base ?? null,
      input.l_seg_height ?? null,
      input.prescriber ?? null,
      input.expiry_date ?? null,
      input.notes ?? null,
    ],
  );
  return res.lastInsertId ?? 0;
}

export async function deletePrescription(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM prescriptions WHERE id = $1", [id]);
}
