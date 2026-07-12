import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addImage,
  deleteImage,
  listImages,
  primaryImagesByProduct,
  setPrimaryImage,
} from "@/db/images";

export function useImages(productId: number | undefined) {
  return useQuery({
    queryKey: ["images", productId ?? 0],
    queryFn: () => listImages(productId as number),
    enabled: productId != null,
  });
}

/** Primary image data-URI keyed by product id, for catalog thumbnails. */
export function usePrimaryImages() {
  return useQuery({
    queryKey: ["primary-images"],
    queryFn: primaryImagesByProduct,
  });
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["images"] });
  qc.invalidateQueries({ queryKey: ["primary-images"] });
};

export function useAddImage() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silenceGlobal: true }, // callers notify errors themselves
    mutationFn: (args: { productId: number; dataUri: string }) =>
      addImage(args.productId, args.dataUri),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteImage(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetPrimaryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; productId: number }) =>
      setPrimaryImage(args.id, args.productId),
    onSuccess: () => invalidate(qc),
  });
}
