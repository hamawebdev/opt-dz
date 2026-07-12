import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { ClaimRow, ClaimStatus } from "@/types";

const CLAIM_SELECT = `
  SELECT c.*, py.name AS payer_name, s.invoice_number AS invoice_number,
         s.sale_date AS sale_date, p.full_name AS patient_name
  FROM claims c
  JOIN payers py ON py.id = c.payer_id
  JOIN sales s ON s.id = c.sale_id
  JOIN patients p ON p.id = s.patient_id`;

export async function listClaims(
  status?: ClaimStatus | null,
): Promise<ClaimRow[]> {
  const db = await getDb();
  const where = status ? "WHERE c.status = $1" : "";
  const params = status ? [status] : [];
  return db.select<ClaimRow[]>(
    `${CLAIM_SELECT} ${where} ORDER BY c.created_at DESC, c.id DESC`,
    params,
  );
}

export async function getClaimForSale(
  saleId: number,
): Promise<ClaimRow | null> {
  const db = await getDb();
  const rows = await db.select<ClaimRow[]>(
    `${CLAIM_SELECT} WHERE c.sale_id = $1`,
    [saleId],
  );
  return rows[0] ?? null;
}

/** Sets a claim's status (and ref) via the Rust `set_claim_status` command, which
 * stamps submitted_at/paid_at and, on rejection, zeroes coverage and re-bills the
 * patient by re-syncing the sale balance (audit finding E1). */
export async function updateClaimStatus(
  id: number,
  status: ClaimStatus,
  claimRef?: string | null,
): Promise<void> {
  unwrap(await commands.setClaimStatus(id, status, claimRef ?? null));
}

/** Records an insurer reimbursement against a claim and recomputes its status. The
 * payment is clamped so cumulative paid never exceeds the covered amount (E2). */
export async function recordClaimPayment(
  id: number,
  amount: number,
): Promise<void> {
  if (amount <= 0) throw new Error("Payment amount must be greater than 0");
  const db = await getDb();
  // One statement, inherently atomic (frontend BEGIN/COMMIT is unsafe on the
  // shared pool). SET expressions all read the OLD row, so the new paid amount
  // is recomputed in each clause: clamped so it tops out at covered_amount.
  await db.execute(
    `UPDATE claims
       SET paid_amount = MIN(covered_amount, paid_amount + $1),
           status = CASE WHEN MIN(covered_amount, paid_amount + $1) >= covered_amount THEN 'paid'
                         WHEN MIN(covered_amount, paid_amount + $1) > 0 THEN 'partial'
                         ELSE status END,
           paid_at = CASE WHEN MIN(covered_amount, paid_amount + $1) >= covered_amount
                          THEN datetime('now') ELSE paid_at END
     WHERE id = $2`,
    [amount, id],
  );
}
