import { getDb } from "@/lib/db";
import { listProductsWithExpiry } from "@/db/products";
import { expiryStatus } from "@/lib/expiry";
import { formatDate } from "@/lib/format";

export type NotificationKind =
  | "out_of_stock"
  | "low_stock"
  | "expired"
  | "expiring_soon"
  | "job_overdue"
  | "job_ready";

export interface AppNotification {
  /** Stable id (e.g. "low:42") so dismissals survive refetches. */
  id: string;
  kind: NotificationKind;
  severity: "error" | "warning";
  /** Product id for stock/expiry kinds, job id for lab kinds. */
  entityId: number;
  /** Product name, or patient name (empty for walk-in — UI substitutes). */
  name: string;
  /** Extra context: remaining quantity (stock) or a date (expiry/lab). */
  meta: string;
}

/** Where tapping a notification should land. */
export function notificationLink(n: AppNotification): string {
  switch (n.kind) {
    case "expired":
    case "expiring_soon":
      return "/tracking";
    case "job_overdue":
    case "job_ready":
      return `/jobs/${n.entityId}`;
    default:
      return `/inventory/${n.entityId}/edit`;
  }
}

/**
 * Derives owner-facing alerts live from product and lab-order state (no
 * notifications table): out-of-stock, low-stock, expired and expiring-soon
 * items, late lab orders, and ready glasses still waiting for pickup.
 */
export async function listNotifications(
  warnDays: number,
): Promise<AppNotification[]> {
  const db = await getDb();
  const out: AppNotification[] = [];

  // Low/out stock, variant-aware: simple products use their own on-hand; variant
  // products surface their lowest variant stock. Services and archived are excluded.
  const stock = await db.select<{ id: number; name: string; quantity: number }[]>(
    `SELECT p.id AS id, p.name AS name, p.quantity AS quantity
       FROM products p
       WHERE p.item_type = 'product' AND p.archived = 0
         AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.archived = 0)
         AND p.quantity <= p.min_stock
     UNION ALL
     SELECT p.id AS id, p.name AS name, MIN(v.quantity) AS quantity
       FROM product_variants v JOIN products p ON p.id = v.product_id
       WHERE p.item_type = 'product' AND p.archived = 0 AND v.archived = 0
         AND v.quantity <= v.min_stock
       GROUP BY p.id, p.name
     ORDER BY quantity ASC, name COLLATE NOCASE`,
  );
  for (const p of stock) {
    if (p.quantity <= 0) {
      out.push({
        id: `out:${p.id}`,
        kind: "out_of_stock",
        severity: "error",
        entityId: p.id,
        name: p.name,
        meta: "",
      });
    } else {
      out.push({
        id: `low:${p.id}`,
        kind: "low_stock",
        severity: "warning",
        entityId: p.id,
        name: p.name,
        meta: String(p.quantity),
      });
    }
  }

  const expiring = await listProductsWithExpiry();
  for (const p of expiring) {
    const status = expiryStatus(p.expiry_date as string, warnDays);
    if (status === "expired") {
      out.push({
        id: `expired:${p.id}`,
        kind: "expired",
        severity: "error",
        entityId: p.id,
        name: p.name,
        meta: p.expiry_date as string,
      });
    } else if (status === "soon") {
      out.push({
        id: `soon:${p.id}`,
        kind: "expiring_soon",
        severity: "warning",
        entityId: p.id,
        name: p.name,
        meta: p.expiry_date as string,
      });
    }
  }

  // Late lab orders: expected-ready date passed, glasses not yet delivered.
  const overdueJobs = await db.select<
    { id: number; name: string | null; expected_ready: string }[]
  >(
    `SELECT j.id AS id, p.full_name AS name, j.expected_ready AS expected_ready
       FROM jobs j LEFT JOIN patients p ON p.id = j.patient_id
      WHERE j.status <> 'delivered' AND j.expected_ready IS NOT NULL
        AND date(j.expected_ready) < date('now','localtime')
      ORDER BY j.expected_ready`,
  );
  for (const j of overdueJobs) {
    out.push({
      id: `jobdue:${j.id}`,
      kind: "job_overdue",
      severity: "error",
      entityId: j.id,
      name: j.name ?? "",
      meta: formatDate(j.expected_ready),
    });
  }

  // Ready glasses still waiting: only once the ready stage is at least a day
  // old, so the bell doesn't nag the moment staff mark a job ready.
  const readyJobs = await db.select<
    { id: number; name: string | null; since: string }[]
  >(
    `SELECT id, name, since FROM (
       SELECT j.id AS id, p.full_name AS name,
              COALESCE((SELECT MAX(e.created_at) FROM job_events e
                         WHERE e.job_id = j.id AND e.status = 'ready'),
                       j.updated_at) AS since
         FROM jobs j LEFT JOIN patients p ON p.id = j.patient_id
        WHERE j.status = 'ready')
      WHERE date(since) < date('now','localtime')
      ORDER BY since`,
  );
  for (const j of readyJobs) {
    out.push({
      id: `jobready:${j.id}`,
      kind: "job_ready",
      severity: "warning",
      entityId: j.id,
      name: j.name ?? "",
      meta: formatDate(j.since),
    });
  }

  return out;
}
