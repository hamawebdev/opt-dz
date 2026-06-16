import { getDb } from "@/lib/db";
import { listProductsWithExpiry } from "@/db/products";
import { expiryStatus } from "@/lib/expiry";
import type { Product } from "@/types";

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

  const stock = await db.select<Product[]>(
    "SELECT * FROM products WHERE item_type = 'product' AND quantity <= min_stock ORDER BY quantity ASC, name COLLATE NOCASE",
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
