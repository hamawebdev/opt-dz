import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteHeldSale,
  listHeldSales,
  saveHeldSale,
  updateHeldSale,
  type HeldSaleInput,
} from "@/db/held-sales";

export const heldKeys = { all: ["held-sales"] as const };

export function useHeldSales() {
  return useQuery({ queryKey: heldKeys.all, queryFn: listHeldSales });
}

export function useSaveHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HeldSaleInput) => saveHeldSale(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: heldKeys.all }),
  });
}

export function useUpdateHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: HeldSaleInput }) =>
      updateHeldSale(args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: heldKeys.all }),
  });
}

export function useDeleteHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteHeldSale(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: heldKeys.all }),
  });
}
