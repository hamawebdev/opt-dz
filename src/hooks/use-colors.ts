import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  colorUsageCounts,
  countColorReview,
  createColor,
  listColorReview,
  listColors,
  mergeColor,
  resolveColorReview,
  setColorArchived,
  updateColor,
  type ColorInput,
} from "@/db/colors";

export function useColors(includeArchived = false) {
  return useQuery({
    queryKey: ["colors", { includeArchived }],
    queryFn: () => listColors(includeArchived),
  });
}

export function useColorUsageCounts() {
  return useQuery({
    queryKey: ["color-usage"],
    queryFn: colorUsageCounts,
  });
}

export function useColorReview() {
  return useQuery({ queryKey: ["color-review"], queryFn: listColorReview });
}

export function useColorReviewCount() {
  return useQuery({ queryKey: ["color-review-count"], queryFn: countColorReview });
}

// Colour edits can change variant/product labels and the review queue everywhere.
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["colors"] });
  qc.invalidateQueries({ queryKey: ["color-usage"] });
  qc.invalidateQueries({ queryKey: ["color-review"] });
  qc.invalidateQueries({ queryKey: ["color-review-count"] });
  qc.invalidateQueries({ queryKey: ["variants"] });
  qc.invalidateQueries({ queryKey: ["sellable-variants"] });
  qc.invalidateQueries({ queryKey: ["products"] });
};

export function useCreateColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ColorInput) => createColor(input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: ColorInput }) =>
      updateColor(args.id, args.input),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetColorArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; archived: boolean }) =>
      setColorArchived(args.id, args.archived),
    onSuccess: () => invalidate(qc),
  });
}

export function useMergeColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { fromId: number; intoId: number }) =>
      mergeColor(args.fromId, args.intoId),
    onSuccess: () => invalidate(qc),
  });
}

export function useResolveColorReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rawValue: string; colorId: number }) =>
      resolveColorReview(args.rawValue, args.colorId),
    onSuccess: () => invalidate(qc),
  });
}
