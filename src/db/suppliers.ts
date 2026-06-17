import { getDb } from "@/lib/db";
import type {
  Supplier,
  SupplierLedgerEntry,
  SupplierLedgerType,
} from "@/types";

export interface SupplierInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function listSuppliers(
  includeArchived = false,
): Promise<Supplier[]> {
  const db = await getDb();
  const where = includeArchived ? "" : "WHERE archived = 0";
  return db.select<Supplier[]>(
    `SELECT * FROM suppliers ${where} ORDER BY name COLLATE NOCASE`,
  );
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const db = await getDb();
  const rows = await db.select<Supplier[]>(
    "SELECT * FROM suppliers WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createSupplier(input: SupplierInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO suppliers (name, phone, email, address, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.name.trim(),
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
    ],
  );
  return res.lastInsertId ?? 0;
}

export async function updateSupplier(
  id: number,
  input: SupplierInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE suppliers SET name = $1, phone = $2, email = $3, address = $4, notes = $5
     WHERE id = $6`,
    [
      input.name.trim(),
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      id,
    ],
  );
}

export async function setSupplierArchived(
  id: number,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE suppliers SET archived = $1 WHERE id = $2", [
    archived ? 1 : 0,
    id,
  ]);
}

// ---- Ledger ---------------------------------------------------------------

export async function listLedger(
  supplierId: number,
): Promise<SupplierLedgerEntry[]> {
  const db = await getDb();
  return db.select<SupplierLedgerEntry[]>(
    "SELECT * FROM supplier_ledger WHERE supplier_id = $1 ORDER BY created_at DESC, id DESC",
    [supplierId],
  );
}

/** Outstanding balance owed to a supplier, in centimes (signed sum of the ledger). */
export async function supplierBalance(supplierId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ bal: number | null }[]>(
    "SELECT SUM(amount) AS bal FROM supplier_ledger WHERE supplier_id = $1",
    [supplierId],
  );
  return rows[0]?.bal ?? 0;
}

/** Balances for every supplier in one query, keyed by supplier id. */
export async function allSupplierBalances(): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.select<{ supplier_id: number; bal: number }[]>(
    "SELECT supplier_id, SUM(amount) AS bal FROM supplier_ledger GROUP BY supplier_id",
  );
  return Object.fromEntries(rows.map((r) => [r.supplier_id, r.bal]));
}

export async function addLedgerEntry(args: {
  supplierId: number;
  type: SupplierLedgerType;
  amount: number; // centimes, signed by convention (purchase/debt +, payment −)
  note?: string | null;
  ref?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO supplier_ledger (supplier_id, type, amount, note, ref)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      args.supplierId,
      args.type,
      args.amount,
      args.note ?? null,
      args.ref ?? null,
    ],
  );
}

/** Records a payment to a supplier (stored as a negative ledger amount). */
export async function recordSupplierPayment(args: {
  supplierId: number;
  amount: number; // positive centimes
  note?: string | null;
}): Promise<void> {
  await addLedgerEntry({
    supplierId: args.supplierId,
    type: "payment",
    amount: -Math.abs(args.amount),
    note: args.note ?? null,
  });
}
