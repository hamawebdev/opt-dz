import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPayer,
  deletePayer,
  listPayers,
  updatePayer,
  type PayerInput,
} from "@/db/payers";

export function usePayers() {
  return useQuery({ queryKey: ["payers"], queryFn: listPayers });
}

export function useCreatePayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PayerInput) => createPayer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payers"] }),
  });
}

export function useUpdatePayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: PayerInput }) => updatePayer(args.id, args.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payers"] }),
  });
}

export function useDeletePayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePayer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payers"] }),
  });
}
