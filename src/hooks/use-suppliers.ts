import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addLedgerEntry,
  allSupplierBalances,
  createSupplier,
  getSupplier,
  listLedger,
  listSuppliers,
  recordSupplierPayment,
  setSupplierArchived,
  supplierBalance,
  updateSupplier,
  type SupplierInput,
} from "@/db/suppliers";
import type { SupplierLedgerType } from "@/types";

const invalidate = (qc: ReturnType<typeof useQueryClient>, id?: number) => {
  qc.invalidateQueries({ queryKey: ["suppliers"] });
  if (id != null) qc.invalidateQueries({ queryKey: ["supplier-ledger", id] });
};

export function useSuppliers(includeArchived = false) {
  return useQuery({
    queryKey: ["suppliers", { includeArchived }],
    queryFn: () => listSuppliers(includeArchived),
  });
}

export function useSupplier(id: number | undefined) {
  return useQuery({
    queryKey: ["suppliers", "detail", id ?? 0],
    queryFn: () => getSupplier(id as number),
    enabled: id != null,
  });
}

export function useSupplierBalances() {
  return useQuery({
    queryKey: ["supplier-balances"],
    queryFn: allSupplierBalances,
  });
}

export function useSupplierLedger(id: number | undefined) {
  return useQuery({
    queryKey: ["supplier-ledger", id ?? 0],
    queryFn: async () => ({
      entries: await listLedger(id as number),
      balance: await supplierBalance(id as number),
    }),
    enabled: id != null,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierInput) => createSupplier(input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: SupplierInput }) =>
      updateSupplier(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetSupplierArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; archived: boolean }) =>
      setSupplierArchived(args.id, args.archived),
    onSuccess: () => invalidate(qc),
  });
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      supplierId: number;
      amount: number;
      note?: string | null;
    }) => recordSupplierPayment(args),
    onSuccess: (_, args) => {
      invalidate(qc, args.supplierId);
      qc.invalidateQueries({ queryKey: ["supplier-balances"] });
    },
  });
}

export function useAddLedgerEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      supplierId: number;
      type: SupplierLedgerType;
      amount: number;
      note?: string | null;
      ref?: string | null;
    }) => addLedgerEntry(args),
    onSuccess: (_, args) => {
      invalidate(qc, args.supplierId);
      qc.invalidateQueries({ queryKey: ["supplier-balances"] });
    },
  });
}
