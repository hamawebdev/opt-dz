import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBrand,
  createCategory,
  listBrandRows,
  listCategories,
  setBrandArchived,
  setCategoryArchived,
  updateBrand,
  updateCategory,
} from "@/db/taxonomy";

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: () => listCategories(includeArchived),
  });
}

export function useBrandRows(includeArchived = false) {
  return useQuery({
    queryKey: ["brand-rows", { includeArchived }],
    queryFn: () => listBrandRows(includeArchived),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; name: string }) =>
      updateCategory(args.id, args.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useSetCategoryArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; archived: boolean }) =>
      setCategoryArchived(args.id, args.archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBrand(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-rows"] }),
  });
}

export function useUpdateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; name: string }) =>
      updateBrand(args.id, args.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-rows"] }),
  });
}

export function useSetBrandArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; archived: boolean }) =>
      setBrandArchived(args.id, args.archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-rows"] }),
  });
}
