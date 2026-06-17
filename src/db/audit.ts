import { getDb } from "@/lib/db";
import type { AuditLogEntry } from "@/types";

/** Appends an audit entry. Best-effort: a logging failure must never break the action
 * that is being audited, so callers can ignore rejection. */
export async function logAudit(args: {
  staffId: number | null;
  staffName: string | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO audit_log (staff_id, staff_name, action, entity, entity_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        args.staffId,
        args.staffName,
        args.action,
        args.entity ?? null,
        args.entityId ?? null,
        args.detail ?? null,
      ],
    );
  } catch {
    /* auditing is best-effort and must not surface to the user */
  }
}

export async function listAudit(limit = 200): Promise<AuditLogEntry[]> {
  const db = await getDb();
  return db.select<AuditLogEntry[]>(
    "SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1",
    [limit],
  );
}
