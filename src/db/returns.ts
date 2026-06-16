import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { CreditNote } from "@/types";

export interface ReturnItem {
  sale_item_id: number;
  quantity: number;
}

export async function createReturn(input: {
  sale_id: number;
  method: "refund";
  notes: string | null;
  items: ReturnItem[];
}): Promise<number> {
  return unwrap(await commands.createReturn(input));
}

export async function listReturnsForSale(saleId: number): Promise<CreditNote[]> {
  const db = await getDb();
  return db.select<CreditNote[]>(
    "SELECT * FROM credit_notes WHERE sale_id = $1 ORDER BY id DESC",
    [saleId],
  );
}

/** Map of sale_item_id -> quantity already returned, for capping return inputs. */
export async function getReturnedQuantities(saleId: number): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.select<{ sale_item_id: number; q: number }[]>(
    `SELECT cni.sale_item_id AS sale_item_id, SUM(cni.quantity) AS q
     FROM credit_note_items cni JOIN credit_notes cn ON cn.id = cni.credit_note_id
     WHERE cn.sale_id = $1 GROUP BY cni.sale_item_id`,
    [saleId],
  );
  const map: Record<number, number> = {};
  for (const r of rows) map[r.sale_item_id] = r.q;
  return map;
}
