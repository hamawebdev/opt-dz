import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { JobEvent, JobRow, JobStatus } from "@/types";

/** The lab pipeline, in order. Jobs advance one step at a time. */
export const JOB_FLOW: JobStatus[] = [
  "ordered",
  "in_progress",
  "ready",
  "delivered",
];

export function nextJobStatus(s: JobStatus): JobStatus | null {
  return JOB_FLOW[JOB_FLOW.indexOf(s) + 1] ?? null;
}

export function prevJobStatus(s: JobStatus): JobStatus | null {
  return JOB_FLOW[JOB_FLOW.indexOf(s) - 1] ?? null;
}

// `overdue` flags a not-yet-delivered job whose expected-ready date has passed.
// LEFT JOIN: patient_id is NULL for walk-in lens orders (v19).
const JOB_SELECT = `
  SELECT j.*, p.full_name AS patient_name, p.phone AS patient_phone,
         s.invoice_number AS invoice_number,
         CASE WHEN j.expected_ready IS NOT NULL
               AND date(j.expected_ready) < date('now','localtime')
               AND j.status <> 'delivered'
              THEN 1 ELSE 0 END AS overdue
  FROM jobs j
  LEFT JOIN patients p ON p.id = j.patient_id
  LEFT JOIN sales s ON s.id = j.sale_id`;

export interface JobListFilters {
  status?: JobStatus | null;
  activeOnly?: boolean; // exclude 'delivered'
  overdueOnly?: boolean;
  search?: string | null; // patient name
}

export async function listJobs(
  filters: JobListFilters = {},
): Promise<JobRow[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`j.status = $${params.length}`);
  }
  if (filters.activeOnly) where.push("j.status != 'delivered'");
  if (filters.overdueOnly) {
    where.push(`j.status <> 'delivered' AND j.expected_ready IS NOT NULL
                AND date(j.expected_ready) < date('now','localtime')`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`p.full_name LIKE $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Ready first (glasses waiting for the client), then late ones, then by date.
  return db.select<JobRow[]>(
    `${JOB_SELECT} ${clause} ORDER BY
       CASE j.status WHEN 'ready' THEN 0 WHEN 'in_progress' THEN 1
                     WHEN 'ordered' THEN 2 ELSE 3 END,
       overdue DESC,
       j.expected_ready IS NULL, j.expected_ready, j.id DESC`,
    params,
  );
}

export async function listJobsForPatient(patientId: number): Promise<JobRow[]> {
  const db = await getDb();
  return db.select<JobRow[]>(
    `${JOB_SELECT} WHERE j.patient_id = $1 ORDER BY j.id DESC`,
    [patientId],
  );
}

export async function getJob(id: number): Promise<JobRow | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(`${JOB_SELECT} WHERE j.id = $1`, [id]);
  return rows[0] ?? null;
}

/** The (latest) lab job attached to a sale, if any. */
export async function getJobBySale(saleId: number): Promise<JobRow | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    `${JOB_SELECT} WHERE j.sale_id = $1 ORDER BY j.id DESC LIMIT 1`,
    [saleId],
  );
  return rows[0] ?? null;
}

export interface JobStageCounts {
  ordered: number;
  in_progress: number;
  ready: number;
  delivered: number;
  overdue: number;
}

/** Per-stage job counts plus the overdue count, for the pipeline header. */
export async function jobStageCounts(): Promise<JobStageCounts> {
  const db = await getDb();
  const rows = await db.select<{ status: JobStatus; n: number }[]>(
    "SELECT status, COUNT(*) AS n FROM jobs GROUP BY status",
  );
  const counts: JobStageCounts = {
    ordered: 0,
    in_progress: 0,
    ready: 0,
    delivered: 0,
    overdue: 0,
  };
  for (const r of rows) counts[r.status] = r.n;
  counts.overdue = await countOverdueJobs();
  return counts;
}

/** Distinct lab names already used, for the lab picker (no separate table). */
export async function listLabNames(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ lab: string }[]>(
    `SELECT DISTINCT TRIM(lab) AS lab FROM jobs
     WHERE lab IS NOT NULL AND TRIM(lab) <> '' ORDER BY 1 COLLATE NOCASE`,
  );
  return rows.map((r) => r.lab);
}

export interface CreateJobInput {
  patient_id: number | null;
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
  const id = res.lastInsertId ?? 0;
  if (id) {
    await db.execute(
      "INSERT INTO job_events (job_id, status, note) VALUES ($1, 'ordered', NULL)",
      [id],
    );
  }
  return id;
}

/** Moves a job to a stage, stamps/clears delivered_at, and records the stage
 * change in job_events (per-stage history) — all in one transaction (H1), which
 * lives in the Rust `update_job_status` command (frontend BEGIN/COMMIT is unsafe
 * on the shared pool). */
export async function updateJobStatus(
  id: number,
  status: JobStatus,
  note?: string | null,
): Promise<void> {
  unwrap(await commands.updateJobStatus(id, status, note ?? null));
}

/** Stage history for a job, most recent first. */
export async function listJobEvents(jobId: number): Promise<JobEvent[]> {
  const db = await getDb();
  return db.select<JobEvent[]>(
    "SELECT * FROM job_events WHERE job_id = $1 ORDER BY created_at DESC, id DESC",
    [jobId],
  );
}

/** Count of overdue jobs (expected-ready date passed, not yet delivered) for alerts. */
export async function countOverdueJobs(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM jobs
     WHERE status <> 'delivered' AND expected_ready IS NOT NULL
       AND date(expected_ready) < date('now','localtime')`,
  );
  return rows[0]?.n ?? 0;
}

export async function updateJobDetails(
  id: number,
  input: {
    lab?: string | null;
    expected_ready?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE jobs SET lab = $1, expected_ready = $2, notes = $3, updated_at = datetime('now')
     WHERE id = $4`,
    [input.lab ?? null, input.expected_ready ?? null, input.notes ?? null, id],
  );
}
