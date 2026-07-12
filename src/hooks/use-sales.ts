import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSale,
  voidSale,
  getSale,
  getSaleItems,
  listSales,
  type CreateSaleInput,
  type SaleListFilters,
} from "@/db/sales";
import { deletePayment, listPayments, recordPayment } from "@/db/payments";
import { logActivity } from "@/db/activity";

export const saleKeys = {
  all: ["sales"] as const,
  list: (filters: SaleListFilters) => ["sales", "list", filters] as const,
  detail: (id: number) => ["sales", "detail", id] as const,
  items: (id: number) => ["sale-items", id] as const,
  payments: (id: number) => ["payments", id] as const,
};

export function useSales(filters: SaleListFilters = {}) {
  return useQuery({
    queryKey: saleKeys.list(filters),
    queryFn: () => listSales(filters),
  });
}

export function useSale(id: number | undefined) {
  return useQuery({
    queryKey: saleKeys.detail(id ?? 0),
    queryFn: () => getSale(id as number),
    enabled: id != null,
  });
}

export function useSaleItems(id: number | undefined) {
  return useQuery({
    queryKey: saleKeys.items(id ?? 0),
    queryFn: () => getSaleItems(id as number),
    enabled: id != null,
  });
}

export function useSalePayments(id: number | undefined) {
  return useQuery({
    queryKey: saleKeys.payments(id ?? 0),
    queryFn: () => listPayments(id as number),
    enabled: id != null,
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSaleInput) => createSale(input),
    onSuccess: (saleId, input) => {
      // Walk-in sales have no patient, so there is no timeline to log against.
      if (input.patient_id != null) {
        void logActivity(input.patient_id, "sale", null, saleId);
        qc.invalidateQueries({
          queryKey: ["patient-activity", input.patient_id],
        });
      }
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["held-sales"] });
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    // Every caller wraps mutateAsync and calls notifyError with a specific
    // message, so the global fallback toast would duplicate it.
    meta: { silenceGlobal: true },
    mutationFn: (args: { id: number; reason?: string | null }) =>
      voidSale(args.id, args.reason ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRecordPayment(saleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      amount: number;
      method?: string | null;
      note?: string | null;
    }) => recordPayment({ saleId, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.detail(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.payments(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      // Payments can now be taken from the patient page; its outstanding
      // summary must refresh too.
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useDeletePayment(saleId: number) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silenceGlobal: true }, // callers notify errors themselves
    mutationFn: (paymentId: number) => deletePayment(paymentId, saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.detail(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.payments(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
