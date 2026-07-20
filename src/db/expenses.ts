/**
 * Operating expenses (rent, salaries, utilities, ...).
 *
 * Scope is deliberately opex only. Stock bought from suppliers is recorded in
 * `supplier_ledger` and reaches the profit & loss as cost of goods when that
 * stock sells — recording it here as well would deduct the same money twice.
 * The P&L shows supplier purchases as a separate, non-deducted line so the
 * cash picture is still visible.
 *
 * All amounts are integer centimes. Writes go through the Rust commands so they
 * are validated and atomic, like every other money path in the app.
 */
import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";

export const EXPENSE_CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "taxes",
  "marketing",
  "maintenance",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: number;
  expense_date: string; // local YYYY-MM-DD
  category: ExpenseCategory;
  amount: number; // centimes
  note: string | null;
  supplier_id: number | null;
  method: string | null;
  created_at: string;
}

export interface ExpenseInput {
  expense_date: string;
  category: ExpenseCategory;
  amount: number;
  note?: string | null;
  supplier_id?: number | null;
  method?: string | null;
}

export interface ExpenseFilters {
  from?: string | null;
  to?: string | null;
  category?: ExpenseCategory | "all";
}

export async function listExpenses(
  filters: ExpenseFilters = {},
): Promise<Expense[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.from) {
    params.push(filters.from);
    where.push(`date(expense_date) >= date($${params.length})`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`date(expense_date) <= date($${params.length})`);
  }
  if (filters.category && filters.category !== "all") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<Expense[]>(
    `SELECT * FROM expenses ${clause} ORDER BY date(expense_date) DESC, id DESC`,
    params,
  );
}

export async function createExpense(input: ExpenseInput): Promise<number> {
  return unwrap(
    await commands.createExpense({
      expense_date: input.expense_date,
      category: input.category,
      amount: input.amount,
      note: input.note ?? null,
      supplier_id: input.supplier_id ?? null,
      method: input.method ?? null,
    }),
  );
}

export async function updateExpense(
  id: number,
  input: ExpenseInput,
): Promise<void> {
  unwrap(
    await commands.updateExpense(id, {
      expense_date: input.expense_date,
      category: input.category,
      amount: input.amount,
      note: input.note ?? null,
      supplier_id: input.supplier_id ?? null,
      method: input.method ?? null,
    }),
  );
}

export async function deleteExpense(id: number): Promise<void> {
  unwrap(await commands.deleteExpense(id));
}
