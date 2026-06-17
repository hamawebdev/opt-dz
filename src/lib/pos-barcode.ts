import type { Product } from "@/types";
import type { SellableVariant } from "@/db/variants";

// Resolves a scanned/typed code to a sellable item. Mirrors the original inline
// logic in sale-form.tsx (addByBarcode): a variant barcode wins, then a product
// barcode or reference. Returns null when nothing matches (caller falls back to
// manual search). Shared by the POS scanner listener and the sale form.
export type BarcodeMatch =
  | { kind: "variant"; variant: SellableVariant }
  | { kind: "product"; product: Product };

export function resolveBarcode(
  code: string,
  variants: SellableVariant[],
  products: Product[],
): BarcodeMatch | null {
  const c = code.trim();
  if (!c) return null;
  const variant = variants.find((v) => v.barcode && v.barcode === c);
  if (variant) return { kind: "variant", variant };
  const product = products.find(
    (p) => (p.barcode && p.barcode === c) || (p.reference && p.reference === c),
  );
  if (product) return { kind: "product", product };
  return null;
}
