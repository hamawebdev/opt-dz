import { computeTotals, type SaleItemInput } from "@/db/sales";
import { taxConfig, extractTva, computeTimbre } from "@/lib/tax";
import { toCentimes } from "@/lib/format";
import type { CartLine } from "@/store/use-cart-store";
import type { DiscountType, ShopSettings } from "@/types";

const n = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

export interface PosTotals {
  items: SaleItemInput[];
  itemCount: number;
  subtotal: number;
  discountStored: number; // centimes, or basis points when discountType === 'percent'
  total: number; // goods TTC after overall discount
  taxAmount: number; // TVA contained in `total`
  timbre: number; // droit de timbre (cash only)
  coverageBp: number;
  covered: number; // insurer-covered portion of goods
  grandTotal: number; // customer's portion incl. timbre
}

/**
 * POS cart totals, computed exactly like the sale form / Rust create_sale so the
 * preview matches what gets persisted. All money is integer centimes.
 */
export function posTotals(input: {
  lines: CartLine[];
  discountType: DiscountType;
  discountValue: string;
  paymentMethod: string;
  payerId: string; // "none" or a payer id
  coveragePct: string;
  settings?: ShopSettings;
}): PosTotals {
  const items: SaleItemInput[] = input.lines.map((l) => ({
    product_id: l.product_id,
    variant_id: l.variant_id,
    description: l.description,
    unit_price: l.unit_price,
    quantity: Math.max(1, Math.floor(l.quantity)),
    item_discount: l.item_discount,
  }));

  const discountStored =
    input.discountType === "percent"
      ? Math.round(n(input.discountValue) * 100)
      : toCentimes(input.discountValue);

  const { subtotal, total } = computeTotals(
    items,
    input.discountType,
    discountStored,
  );

  const cfg = taxConfig(input.settings);
  const isCash = input.paymentMethod === "cash";
  const taxAmount = extractTva(total, cfg.tvaRate);
  const timbre = computeTimbre(total, cfg, isCash);

  const coverageBp =
    input.payerId === "none" ? 0 : Math.round(n(input.coveragePct) * 100);
  const covered =
    input.payerId === "none"
      ? 0
      : Math.min(total, Math.max(0, Math.floor((total * coverageBp) / 10000)));
  const grandTotal = total - covered + timbre;

  const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);

  return {
    items,
    itemCount,
    subtotal,
    discountStored,
    total,
    taxAmount,
    timbre,
    coverageBp,
    covered,
    grandTotal,
  };
}
