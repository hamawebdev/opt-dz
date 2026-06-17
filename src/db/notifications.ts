import { getDb } from "@/lib/db";
import { listProductsWithExpiry } from "@/db/products";
import { expiryStatus } from "@/lib/expiry";

export type NotificationKind =
  | "out_of_stock"
  | "low_stock"
  | "expired"
  | "expiring_soon";

export interface AppNotification {
  /** Stable id (e.g. "low:42") so dismissals survive refetches. */
  id: string;
  kind: NotificationKind;
  severity: "error" | "warning";
  productId: number;
  productName: string;
  /** Extra context: remaining quantity (stock) or expiry date. */
  meta: string;
}

/**
 * Derives owner-facing alerts live from product state (no notifications table):
 * out-of-stock, low-stock, expired and expiring-soon items.
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
        productId: p.id,
        productName: p.name,
        meta: "",
      });
    } else {
      out.push({
        id: `low:${p.id}`,
        kind: "low_stock",
        severity: "warning",
        productId: p.id,
        productName: p.name,
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
        productId: p.id,
        productName: p.name,
        meta: p.expiry_date as string,
      });
    } else if (status === "soon") {
      out.push({
        id: `soon:${p.id}`,
        kind: "expiring_soon",
        severity: "warning",
        productId: p.id,
        productName: p.name,
        meta: p.expiry_date as string,
      });
    }
  }

  return out;
}
