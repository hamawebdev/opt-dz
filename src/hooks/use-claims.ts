import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClaimForSale,
  listClaims,
  recordClaimPayment,
  updateClaimStatus,
} from "@/db/claims";
import type { ClaimStatus } from "@/types";

export function useClaims(status?: ClaimStatus | null) {
  return useQuery({
    queryKey: ["claims", "list", status ?? "all"],
    queryFn: () => listClaims(status),
  });
}

export function useClaimForSale(saleId: number | undefined) {
  return useQuery({
    queryKey: ["claims", "sale", saleId ?? 0],
    queryFn: () => getClaimForSale(saleId as number),
    enabled: saleId != null,
  });
}

function invalidateClaims(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["claims"] });
}

export function useUpdateClaimStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; status: ClaimStatus; claimRef?: string | null }) =>
      updateClaimStatus(args.id, args.status, args.claimRef),
    onSuccess: () => invalidateClaims(qc),
  });
}

export function useRecordClaimPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; amount: number }) => recordClaimPayment(args.id, args.amount),
    onSuccess: () => invalidateClaims(qc),
  });
}
