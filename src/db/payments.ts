import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import type { Payment } from "@/types";

export async function listPayments(saleId: number): Promise<Payment[]> {
  const db = await getDb();
  return db.select<Payment[]>(
    "SELECT * FROM payments WHERE sale_id = $1 ORDER BY paid_at, id",
    [saleId],
  );
}

/**
 * Records a payment against a sale via the Rust `record_payment` command, which
 * inserts the payment and re-syncs the sale's amount_paid/balance/status atomically.
 * `amount` is in integer centimes.
 */
export async function recordPayment(args: {
  saleId: number;
  amount: number;
  method?: string | null;
  note?: string | null;
}): Promise<void> {
  unwrap(
    await commands.recordPayment(args.saleId, args.amount, args.method ?? null, args.note ?? null),
  );
}

/** Deletes a payment and re-syncs the sale balance atomically via Rust. */
export async function deletePayment(id: number, saleId: number): Promise<void> {
  unwrap(await commands.deletePayment(id, saleId));
}
