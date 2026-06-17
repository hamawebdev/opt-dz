import { getDb } from "@/lib/db";

// A held (parked) cart. The working cart is stored as an opaque JSON `payload`
// snapshot — a mid-edit draft, not a normalized order — so resuming simply
// rehydrates the client store. `item_count` and `total` (centimes) are
// denormalized so the held-sales strip renders without parsing every payload.
// Holding never touches stock; stock is validated/deducted only at real checkout.
export interface HeldSale {
  id: number;
  label: string | null;
  customer_id: number | null; // null = walk-in
  payload: string; // JSON; shape owned by the cart store
  item_count: number;
  total: number; // centimes
  created_at: string;
  updated_at: string;
}

export interface HeldSaleInput {
  label?: string | null;
  customerId?: number | null;
  payload: unknown; // serialized here
  itemCount: number;
  total: number; // centimes
}

export async function listHeldSales(): Promise<HeldSale[]> {
  const db = await getDb();
  return db.select<HeldSale[]>(
    "SELECT * FROM held_sales ORDER BY updated_at DESC, id DESC",
  );
}

export async function saveHeldSale(input: HeldSaleInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO held_sales (label, customer_id, payload, item_count, total)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.label ?? null,
      input.customerId ?? null,
      JSON.stringify(input.payload),
      input.itemCount,
      input.total,
    ],
  );
  return res.lastInsertId ?? 0;
}

export async function updateHeldSale(
  id: number,
  input: HeldSaleInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE held_sales
     SET label = $1, customer_id = $2, payload = $3, item_count = $4, total = $5,
         updated_at = datetime('now')
     WHERE id = $6`,
    [
      input.label ?? null,
      input.customerId ?? null,
      JSON.stringify(input.payload),
      input.itemCount,
      input.total,
      id,
    ],
  );
}

export async function deleteHeldSale(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM held_sales WHERE id = $1", [id]);
}
