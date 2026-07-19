import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReturn,
  getReturnedQuantities,
  listReturnsForSale,
  type ReturnItem,
  type ReturnMethod,
} from "@/db/returns";
import { logAudit } from "@/db/audit";
import { useAppStore } from "@/store/use-app-store";

export function useReturnsForSale(saleId: number | undefined) {
  return useQuery({
    queryKey: ["returns", "sale", saleId ?? 0],
    queryFn: () => listReturnsForSale(saleId as number),
    enabled: saleId != null,
  });
}

export function useReturnedQuantities(saleId: number | undefined) {
  return useQuery({
    queryKey: ["returns", "qty", saleId ?? 0],
    queryFn: () => getReturnedQuantities(saleId as number),
    enabled: saleId != null,
  });
}

export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      sale_id: number;
      method: ReturnMethod;
      notes: string | null;
      items: ReturnItem[];
    }) => createReturn(input),
    onSuccess: (cnId, input) => {
      // Audited here so every entry point (sale-detail, sales list, POS) logs.
      const { currentStaffId, currentStaffName } = useAppStore.getState();
      void logAudit({
        staffId: currentStaffId,
        staffName: currentStaffName,
        action: "create_return",
        entity: "sale",
        entityId: input.sale_id,
        detail: `cn:${cnId} · ${input.method}`,
      });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
