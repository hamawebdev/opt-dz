import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSale,
  deleteSale,
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
      void logActivity(input.patient_id, "sale", null, saleId);
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["patient-activity", input.patient_id] });
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSale(id),
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
    mutationFn: (args: { amount: number; method?: string | null; note?: string | null }) =>
      recordPayment({ saleId, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.detail(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.payments(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePayment(saleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: number) => deletePayment(paymentId, saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.detail(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.payments(saleId) });
      qc.invalidateQueries({ queryKey: saleKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
