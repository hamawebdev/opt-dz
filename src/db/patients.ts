import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import { getSettings } from "@/db/settings";
import type { Patient } from "@/types";

export interface PatientInput {
  full_name: string;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  national_id?: string | null;
  default_payer_id?: number | null;
  default_coverage_pct?: number | null; // basis points
  insurance_policy_no?: string | null;
  photo?: string | null;
  notes?: string | null;
}

/** Computes the next human-readable client code (e.g. "P-0001") and the value the
 * sequence should advance to. The bump is applied inside createPatient's transaction
 * so a failed insert never leaves a gap (audit finding F3). */
async function computeClientCode(): Promise<{ code: string; next: number }> {
  const s = await getSettings();
  const next = Number(s.client_code_next) || 1;
  const padding = Number(s.client_code_padding) || 4;
  const code = `${s.client_code_prefix}${String(next).padStart(padding, "0")}`;
  return { code, next };
}

export interface PatientFilters {
  /** Free text matched against name, phone, phone2, national id and code. */
  search?: string;
  /** Inclusive created-date range (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
  /** Custom-field facets: each must match (AND across attributes, OR within values). */
  attributes?: { attribute_id: number; values: string[] }[];
  /** Include archived (soft-deleted) patients. Defaults to false. */
  includeArchived?: boolean;
}

/** Lists patients, optionally filtered by search text, date range and custom-field facets. */
export async function listPatients(
  filters: PatientFilters = {},
): Promise<Patient[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (!filters.includeArchived) clauses.push("archived = 0");

  const term = filters.search?.trim();
  if (term) {
    params.push(`%${term}%`);
    const i = params.length;
    clauses.push(
      `(full_name LIKE $${i} OR phone LIKE $${i} OR phone2 LIKE $${i} OR national_id LIKE $${i} OR code LIKE $${i})`,
    );
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    clauses.push(`date(created_at) >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    clauses.push(`date(created_at) <= $${params.length}`);
  }
  for (const facet of filters.attributes ?? []) {
    if (!facet.values.length) continue;
    const placeholders = facet.values
      .map((v) => {
        params.push(v);
        return `$${params.length}`;
      })
      .join(", ");
    params.push(facet.attribute_id);
    const attrParam = params.length;
    // Match select (value_text) or multiselect (value_options JSON contains).
    clauses.push(
      `EXISTS (SELECT 1 FROM patient_attribute_values pav
               WHERE pav.patient_id = patients.id AND pav.attribute_id = $${attrParam}
               AND (pav.value_text IN (${placeholders})
                    OR EXISTS (SELECT 1 FROM json_each(pav.value_options)
                               WHERE json_each.value IN (${placeholders}))))`,
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.select<Patient[]>(
    `SELECT * FROM patients ${where} ORDER BY full_name COLLATE NOCASE`,
    params,
  );
}

export async function getPatient(id: number): Promise<Patient | null> {
  const db = await getDb();
  const rows = await db.select<Patient[]>(
    "SELECT * FROM patients WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** Returns existing patients whose phone or national id matches (intake dedupe). */
export async function findPatientDuplicates(
  phone: string | null,
  nationalId: string | null,
  excludeId?: number,
): Promise<Patient[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (phone) {
    params.push(phone);
    clauses.push(`(phone = $${params.length} OR phone2 = $${params.length})`);
  }
  if (nationalId) {
    params.push(nationalId);
    clauses.push(`national_id = $${params.length}`);
  }
  if (!clauses.length) return [];
  let sql = `SELECT * FROM patients WHERE (${clauses.join(" OR ")})`;
  if (excludeId != null) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }
  return db.select<Patient[]>(sql, params);
}

export interface PatientSummary {
  invoice_count: number;
  total_invoiced: number; // centimes (goods + timbre)
  outstanding: number; // centimes still owed by the patient
  last_payment_date: string | null;
}

/** Aggregates a patient's billing position for the quick-info strip. */
export async function getPatientSummary(id: number): Promise<PatientSummary> {
  const db = await getDb();
  const rows = await db.select<
    {
      invoice_count: number;
      total_invoiced: number;
      outstanding: number;
    }[]
  >(
    // total_invoiced is the patient's own portion (excludes the insurer-covered part);
    // void invoices are excluded entirely (F4).
    `SELECT
       COUNT(s.id) AS invoice_count,
       COALESCE(SUM(s.total + s.timbre_amount
         - COALESCE((SELECT covered_amount FROM claims WHERE sale_id = s.id), 0)), 0) AS total_invoiced,
       COALESCE(SUM(s.balance), 0) AS outstanding
     FROM sales s WHERE s.patient_id = $1 AND s.status <> 'void'`,
    [id],
  );
  const pay = await db.select<{ last_payment_date: string | null }[]>(
    `SELECT MAX(p.paid_at) AS last_payment_date
     FROM payments p JOIN sales s ON s.id = p.sale_id
     WHERE s.patient_id = $1`,
    [id],
  );
  const r = rows[0];
  return {
    invoice_count: r?.invoice_count ?? 0,
    total_invoiced: r?.total_invoiced ?? 0,
    outstanding: r?.outstanding ?? 0,
    last_payment_date: pay[0]?.last_payment_date ?? null,
  };
}

export type StatementEntryType =
  | "invoice"
  | "payment"
  | "insurance"
  | "credit_note";

export interface StatementEntry {
  date: string;
  type: StatementEntryType;
  ref: string | null;
  debit: number; // centimes added to what the patient owes
  credit: number; // centimes reducing what the patient owes
  balance: number; // running balance after this entry
}

export interface PatientStatement {
  entries: StatementEntry[];
  total_debit: number;
  total_credit: number;
  balance: number;
}

/** Builds a chronological account statement (كشف حساب) for a patient: invoices as
 * debits; payments, insurer-covered amounts and credit notes as credits. */
export async function getPatientStatement(
  id: number,
  range?: { from?: string; to?: string },
): Promise<PatientStatement> {
  const db = await getDb();
  const inRange = (col: string, params: unknown[]) => {
    let sql = "";
    if (range?.from) {
      params.push(range.from);
      sql += ` AND date(${col}) >= $${params.length}`;
    }
    if (range?.to) {
      params.push(range.to);
      sql += ` AND date(${col}) <= $${params.length}`;
    }
    return sql;
  };

  const sp: unknown[] = [id];
  const sales = await db.select<
    { date: string; ref: string | null; amount: number }[]
  >(
    `SELECT sale_date AS date, invoice_number AS ref, (total + timbre_amount) AS amount
     FROM sales WHERE patient_id = $1 AND status <> 'void'${inRange("sale_date", sp)}`,
    sp,
  );
  const pp: unknown[] = [id];
  const payments = await db.select<
    { date: string; ref: string | null; amount: number }[]
  >(
    `SELECT pm.paid_at AS date, s.invoice_number AS ref, pm.amount AS amount
     FROM payments pm JOIN sales s ON s.id = pm.sale_id
     WHERE s.patient_id = $1${inRange("pm.paid_at", pp)}`,
    pp,
  );
  const cp: unknown[] = [id];
  const claims = await db.select<
    { date: string; ref: string | null; amount: number }[]
  >(
    `SELECT s.sale_date AS date, s.invoice_number AS ref, c.covered_amount AS amount
     FROM claims c JOIN sales s ON s.id = c.sale_id
     WHERE s.patient_id = $1 AND c.covered_amount > 0${inRange("s.sale_date", cp)}`,
    cp,
  );
  const np: unknown[] = [id];
  // Only 'balance' credit notes reduce what the patient owes; a cash 'refund' returns
  // money and is neutral to the account balance (F4).
  const notes = await db.select<{ date: string; amount: number }[]>(
    `SELECT created_at AS date, total AS amount
     FROM credit_notes WHERE patient_id = $1 AND method = 'balance'${inRange("created_at", np)}`,
    np,
  );

  const rows: Omit<StatementEntry, "balance">[] = [
    ...sales.map((r) => ({
      date: r.date,
      type: "invoice" as const,
      ref: r.ref,
      debit: r.amount,
      credit: 0,
    })),
    ...payments.map((r) => ({
      date: r.date,
      type: "payment" as const,
      ref: r.ref,
      debit: 0,
      credit: r.amount,
    })),
    ...claims.map((r) => ({
      date: r.date,
      type: "insurance" as const,
      ref: r.ref,
      debit: 0,
      credit: r.amount,
    })),
    ...notes.map((r) => ({
      date: r.date,
      type: "credit_note" as const,
      ref: null,
      debit: 0,
      credit: r.amount,
    })),
  ];
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = 0;
  let total_debit = 0;
  let total_credit = 0;
  const entries: StatementEntry[] = rows.map((r) => {
    balance += r.debit - r.credit;
    total_debit += r.debit;
    total_credit += r.credit;
    return { ...r, balance };
  });
  return { entries, total_debit, total_credit, balance };
}

export async function createPatient(input: PatientInput): Promise<number> {
  const db = await getDb();
  const { code, next } = await computeClientCode();
  await db.execute("BEGIN");
  try {
    // Advance the code sequence and insert atomically — a failed insert rolls back
    // the bump, so codes never gap (F3).
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ('client_code_next', $1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(next + 1)],
    );
    const res = await db.execute(
      `INSERT INTO patients
         (code, full_name, phone, phone2, email, address, date_of_birth, national_id,
          default_payer_id, default_coverage_pct, insurance_policy_no, photo, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        code,
        input.full_name,
        input.phone ?? null,
        input.phone2 ?? null,
        input.email ?? null,
        input.address ?? null,
        input.date_of_birth ?? null,
        input.national_id ?? null,
        input.default_payer_id ?? null,
        input.default_coverage_pct ?? 0,
        input.insurance_policy_no ?? null,
        input.photo ?? null,
        input.notes ?? null,
      ],
    );
    await db.execute("COMMIT");
    return res.lastInsertId ?? 0;
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}

export async function updatePatient(
  id: number,
  input: PatientInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE patients
     SET full_name = $1, phone = $2, phone2 = $3, email = $4, address = $5,
         date_of_birth = $6, national_id = $7, default_payer_id = $8,
         default_coverage_pct = $9, insurance_policy_no = $10, photo = $11,
         notes = $12, updated_at = datetime('now')
     WHERE id = $13`,
    [
      input.full_name,
      input.phone ?? null,
      input.phone2 ?? null,
      input.email ?? null,
      input.address ?? null,
      input.date_of_birth ?? null,
      input.national_id ?? null,
      input.default_payer_id ?? null,
      input.default_coverage_pct ?? 0,
      input.insurance_policy_no ?? null,
      input.photo ?? null,
      id,
    ],
  );
}

/** Soft-delete: hide a patient from lists while preserving their clinical and billing
 * history (never cascade-delete prescriptions/jobs — audit finding F2). */
export async function archivePatient(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE patients SET archived = 1, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

export async function unarchivePatient(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE patients SET archived = 0, updated_at = datetime('now') WHERE id = $1",
    [id],
  );
}

/** Hard-delete, allowed only when the patient has no clinical or billing history;
 * anything with history must be archived so records survive. */
export async function deletePatient(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM sales         WHERE patient_id = $1)
          + (SELECT COUNT(*) FROM prescriptions WHERE patient_id = $1)
          + (SELECT COUNT(*) FROM jobs          WHERE patient_id = $1)
          + (SELECT COUNT(*) FROM appointments  WHERE patient_id = $1)
          + (SELECT COUNT(*) FROM credit_notes  WHERE patient_id = $1) AS n`,
    [id],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error("PATIENT_HAS_HISTORY");
  }
  await db.execute("DELETE FROM patients WHERE id = $1", [id]);
}

/** Merges a duplicate patient into a surviving one via the Rust `merge_patients`
 * command (re-points all records, then removes the duplicate). */
export async function mergePatients(
  keepId: number,
  dupId: number,
): Promise<void> {
  unwrap(await commands.mergePatients(keepId, dupId));
}
