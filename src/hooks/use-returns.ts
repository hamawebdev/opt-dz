import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReturn,
  getReturnedQuantities,
  listReturnsForSale,
  type ReturnItem,
  type ReturnMethod,
} from "@/db/returns";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
