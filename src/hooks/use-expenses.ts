import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
  type ExpenseFilters,
  type ExpenseInput,
} from "@/db/expenses";
import { getProfitAndLoss } from "@/db/metrics";

export function useExpenses(filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: ["expenses", filters.from, filters.to, filters.category],
    queryFn: () => listExpenses(filters),
  });
}

export function useProfitAndLoss(from: string, to: string) {
  return useQuery({
    queryKey: ["reports", "pnl", from, to],
    queryFn: () => getProfitAndLoss({ from, to }),
  });
}

/**
 * Recording an expense changes the P&L, so both the expense list and every
 * report query are invalidated — otherwise the reports page would keep showing
 * a stale profit figure until it happened to refetch.
 */
function useExpenseMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useCreateExpense() {
  return useExpenseMutation((input: ExpenseInput) => createExpense(input));
}

export function useUpdateExpense() {
  return useExpenseMutation(({ id, input }: { id: number; input: ExpenseInput }) =>
    updateExpense(id, input),
  );
}

export function useDeleteExpense() {
  return useExpenseMutation((id: number) => deleteExpense(id));
}
