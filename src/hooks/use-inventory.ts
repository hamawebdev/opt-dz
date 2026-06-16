import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listBrands,
  listLowStock,
  listProducts,
  listProductsWithExpiry,
  updateProduct,
  type ProductFilters,
  type ProductInput,
} from "@/db/products";
import {
  listMovements,
  recordAdjustment,
  recordDelivery,
} from "@/db/stock";

export const productKeys = {
  all: ["products"] as const,
  list: (filters: ProductFilters) => ["products", "list", filters] as const,
  detail: (id: number) => ["products", "detail", id] as const,
  brands: ["products", "brands"] as const,
  lowStock: ["products", "low-stock"] as const,
  movements: (id: number) => ["stock-movements", id] as const,
};

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: productKeys.list(filters),
    queryFn: () => listProducts(filters),
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? 0),
    queryFn: () => getProduct(id as number),
    enabled: id != null,
  });
}

export function useBrands() {
  return useQuery({ queryKey: productKeys.brands, queryFn: listBrands });
}

export function useLowStock() {
  return useQuery({ queryKey: productKeys.lowStock, queryFn: listLowStock });
}

export function useProductsWithExpiry() {
  return useQuery({
    queryKey: ["products", "expiry"],
    queryFn: listProductsWithExpiry,
  });
}

export function useStockMovements(productId: number | undefined) {
  return useQuery({
    queryKey: productKeys.movements(productId ?? 0),
    queryFn: () => listMovements(productId as number),
    enabled: productId != null,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ProductInput }) =>
      updateProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useRecordDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      productId: number;
      quantity: number;
      purchasePrice?: number | null;
      note?: string | null;
      supplierId?: number | null;
      debtAmount?: number | null;
    }) => recordDelivery(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all });
      qc.invalidateQueries({ queryKey: ["supplier-balances"] });
      qc.invalidateQueries({ queryKey: ["supplier-ledger"] });
    },
  });
}

export function useRecordAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { productId: number; quantityChange: number; note?: string | null }) =>
      recordAdjustment(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
