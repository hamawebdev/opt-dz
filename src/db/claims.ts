import { getDb } from "@/lib/db";
import type { ClaimRow, ClaimStatus } from "@/types";

const CLAIM_SELECT = `
  SELECT c.*, py.name AS payer_name, s.invoice_number AS invoice_number,
         s.sale_date AS sale_date, p.full_name AS patient_name
  FROM claims c
  JOIN payers py ON py.id = c.payer_id
  JOIN sales s ON s.id = c.sale_id
  JOIN patients p ON p.id = s.patient_id`;

export async function listClaims(status?: ClaimStatus | null): Promise<ClaimRow[]> {
  const db = await getDb();
  const where = status ? "WHERE c.status = $1" : "";
  const params = status ? [status] : [];
  return db.select<ClaimRow[]>(
    `${CLAIM_SELECT} ${where} ORDER BY c.created_at DESC, c.id DESC`,
    params,
  );
}

export async function getClaimForSale(saleId: number): Promise<ClaimRow | null> {
  const db = await getDb();
  const rows = await db.select<ClaimRow[]>(`${CLAIM_SELECT} WHERE c.sale_id = $1`, [saleId]);
  return rows[0] ?? null;
}

/** Sets a claim's status (and ref), stamping submitted_at/paid_at as appropriate. */
export async function updateClaimStatus(
  id: number,
  status: ClaimStatus,
  claimRef?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE claims
       SET status = $1,
           claim_ref = COALESCE($2, claim_ref),
           submitted_at = CASE WHEN $1 IN ('submitted','partial','paid') AND submitted_at IS NULL
                               THEN datetime('now') ELSE submitted_at END,
           paid_at = CASE WHEN $1 = 'paid' THEN datetime('now') ELSE paid_at END
     WHERE id = $3`,
    [status, claimRef ?? null, id],
  );
}

/** Records an insurer reimbursement against a claim and recomputes its status. */
export async function recordClaimPayment(id: number, amount: number): Promise<void> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    await db.execute("UPDATE claims SET paid_amount = paid_amount + $1 WHERE id = $2", [amount, id]);
    await db.execute(
      `UPDATE claims
         SET status = CASE WHEN paid_amount >= covered_amount THEN 'paid'
                           WHEN paid_amount > 0 THEN 'partial' ELSE status END,
             paid_at = CASE WHEN paid_amount >= covered_amount THEN datetime('now') ELSE paid_at END
       WHERE id = $1`,
      [id],
    );
    await db.execute("COMMIT");
  } catch (err) {
    await db.execute("ROLLBACK");
    throw err;
  }
}
