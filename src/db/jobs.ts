import { getDb } from "@/lib/db";
import type { JobRow, JobStatus } from "@/types";

const JOB_SELECT = `
  SELECT j.*, p.full_name AS patient_name, s.invoice_number AS invoice_number
  FROM jobs j
  JOIN patients p ON p.id = j.patient_id
  LEFT JOIN sales s ON s.id = j.sale_id`;

export interface JobListFilters {
  status?: JobStatus | null;
  activeOnly?: boolean; // exclude 'collected'
}

export async function listJobs(filters: JobListFilters = {}): Promise<JobRow[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`j.status = $${params.length}`);
  }
  if (filters.activeOnly) where.push("j.status != 'collected'");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<JobRow[]>(
    `${JOB_SELECT} ${clause} ORDER BY
       CASE j.status WHEN 'ready' THEN 0 WHEN 'edging' THEN 1 WHEN 'at_lab' THEN 2
                     WHEN 'ordered' THEN 3 ELSE 4 END,
       j.expected_ready IS NULL, j.expected_ready, j.id DESC`,
    params,
  );
}

export async function listJobsForPatient(patientId: number): Promise<JobRow[]> {
  const db = await getDb();
  return db.select<JobRow[]>(`${JOB_SELECT} WHERE j.patient_id = $1 ORDER BY j.id DESC`, [
    patientId,
  ]);
}

export interface CreateJobInput {
  patient_id: number;
  sale_id?: number | null;
  prescription_id?: number | null;
  lab?: string | null;
  expected_ready?: string | null;
  notes?: string | null;
}

export async function createJob(input: CreateJobInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO jobs (patient_id, sale_id, prescription_id, lab, expected_ready, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.patient_id,
      input.sale_id ?? null,
      input.prescription_id ?? null,
      input.lab ?? null,
      input.expected_ready ?? null,
      input.notes ?? null,
    ],
  );
  return res.lastInsertId ?? 0;
}

/** Advances a job's status; stamps delivered_at when it reaches 'collected'. */
export async function updateJobStatus(id: number, status: JobStatus): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jobs
       SET status = $1,
           delivered_at = CASE WHEN $1 = 'collected' THEN datetime('now') ELSE delivered_at END,
           updated_at = datetime('now')
     WHERE id = $2`,
    [status, id],
  );
}

export async function updateJobDetails(
  id: number,
  input: { lab?: string | null; expected_ready?: string | null; notes?: string | null },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jobs SET lab = $1, expected_ready = $2, notes = $3, updated_at = datetime('now')
     WHERE id = $4`,
    [input.lab ?? null, input.expected_ready ?? null, input.notes ?? null, id],
  );
}
