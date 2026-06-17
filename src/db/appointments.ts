import { getDb } from "@/lib/db";
import type { Appointment, AppointmentRow, AppointmentStatus } from "@/types";

export interface AppointmentInput {
  patient_id: number;
  starts_at: string; // 'YYYY-MM-DD HH:MM'
  duration_min: number;
  optometrist?: string | null;
  reason?: string | null;
  notes?: string | null;
}

/** Appointments whose day falls within [from, to] (inclusive, YYYY-MM-DD), joined
 * with patient name/code for the schedule and check-in views. */
export async function listAppointments(range: {
  from: string;
  to: string;
}): Promise<AppointmentRow[]> {
  const db = await getDb();
  return db.select<AppointmentRow[]>(
    `SELECT a.*, p.full_name AS patient_name, p.code AS patient_code
     FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE date(a.starts_at) BETWEEN $1 AND $2
     ORDER BY a.starts_at`,
    [range.from, range.to],
  );
}

/** Full appointment history for one patient (most recent first). */
export async function listPatientAppointments(
  patientId: number,
): Promise<Appointment[]> {
  const db = await getDb();
  return db.select<Appointment[]>(
    "SELECT * FROM appointments WHERE patient_id = $1 ORDER BY starts_at DESC",
    [patientId],
  );
}

/** Finds existing appointments for the same optometrist whose time window overlaps the
 * proposed slot (active statuses only), so the UI can warn about double-booking
 * (audit finding G2). Returns [] when no optometrist is set. */
export async function findAppointmentConflicts(input: {
  startsAt: string;
  durationMin: number;
  optometrist?: string | null;
  excludeId?: number;
}): Promise<AppointmentRow[]> {
  const db = await getDb();
  if (!input.optometrist?.trim()) return [];
  const params: (string | number)[] = [
    input.optometrist.trim(),
    input.startsAt,
    input.durationMin,
    input.startsAt,
  ];
  let sql = `
    SELECT a.*, p.full_name AS patient_name, p.code AS patient_code
    FROM appointments a JOIN patients p ON p.id = a.patient_id
    WHERE lower(trim(a.optometrist)) = lower(trim($1))
      AND a.status NOT IN ('cancelled','no_show')
      AND a.starts_at < datetime($2, '+' || $3 || ' minutes')
      AND $4 < datetime(a.starts_at, '+' || a.duration_min || ' minutes')`;
  if (input.excludeId != null) {
    params.push(input.excludeId);
    sql += ` AND a.id <> $${params.length}`;
  }
  return db.select<AppointmentRow[]>(sql + " ORDER BY a.starts_at", params);
}

export async function getAppointment(id: number): Promise<Appointment | null> {
  const db = await getDb();
  const rows = await db.select<Appointment[]>(
    "SELECT * FROM appointments WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createAppointment(
  input: AppointmentInput,
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO appointments (patient_id, starts_at, duration_min, optometrist, reason, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.patient_id,
      input.starts_at,
      input.duration_min,
      input.optometrist ?? null,
      input.reason ?? null,
      input.notes ?? null,
    ],
  );
  return res.lastInsertId ?? 0;
}

export async function updateAppointment(
  id: number,
  input: AppointmentInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE appointments
     SET patient_id = $1, starts_at = $2, duration_min = $3,
         optometrist = $4, reason = $5, notes = $6
     WHERE id = $7`,
    [
      input.patient_id,
      input.starts_at,
      input.duration_min,
      input.optometrist ?? null,
      input.reason ?? null,
      input.notes ?? null,
      id,
    ],
  );
}

export async function setAppointmentStatus(
  id: number,
  status: AppointmentStatus,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE appointments SET status = $1 WHERE id = $2", [
    status,
    id,
  ]);
}

/** Links the prescription produced by an exam and marks the appointment done. */
export async function linkAppointmentPrescription(
  id: number,
  prescriptionId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE appointments SET prescription_id = $1, status = 'done' WHERE id = $2",
    [prescriptionId, id],
  );
}

export async function deleteAppointment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM appointments WHERE id = $1", [id]);
}
