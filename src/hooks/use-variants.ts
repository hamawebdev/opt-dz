import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createVariant,
  deleteVariant,
  listSellableVariants,
  listVariants,
  updateVariant,
  type VariantInput,
} from "@/db/variants";

export function useVariants(productId: number | undefined) {
  return useQuery({
    queryKey: ["variants", productId ?? 0],
    queryFn: () => listVariants(productId as number),
    enabled: productId != null,
  });
}

export function useSellableVariants() {
  return useQuery({
    queryKey: ["sellable-variants"],
    queryFn: listSellableVariants,
  });
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["variants"] });
  qc.invalidateQueries({ queryKey: ["sellable-variants"] });
  qc.invalidateQueries({ queryKey: ["products"] });
};

export function useCreateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { productId: number; input: VariantInput }) =>
      createVariant(args.productId, args.input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: VariantInput }) =>
      updateVariant(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteVariant(id),
    onSuccess: () => invalidate(qc),
  });
}
