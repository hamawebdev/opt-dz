import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listCatalog,
  listRecentlySold,
  toggleFavorite,
  type CatalogFilters,
} from "@/db/catalog";

const PAGE_SIZE = 40;

/** Paginated POS catalog browser. Pages are appended for infinite scroll. */
export function useCatalog(filters: CatalogFilters = {}) {
  return useInfiniteQuery({
    queryKey: ["catalog", filters],
    queryFn: ({ pageParam }) => listCatalog(filters, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 30_000, // reflect stock changes after a sale without thrashing
  });
}

export function useRecentlySold(enabled = true) {
  return useQuery({
    queryKey: ["catalog", "recently-sold"],
    queryFn: () => listRecentlySold(24),
    enabled,
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: number) => toggleFavorite(productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}
