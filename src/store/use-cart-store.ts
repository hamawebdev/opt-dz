import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { variantLabel, type SellableVariant } from "@/db/variants";
import type { CatalogProduct } from "@/db/catalog";
import { effectiveStock } from "@/db/catalog";
import type { DiscountType } from "@/types";

// One line in the working POS cart. Money is integer **centimes** (see types.ts).
// `stock_available` is the effective stock at add-time, used only for a soft
// over-sell warning — the Rust create_sale command is the authoritative check.
export interface CartLine {
  key: string;
  product_id: number | null;
  variant_id: number | null;
  description: string;
  unit_price: number; // centimes (editable: price override)
  quantity: number;
  item_discount: number; // centimes off this line
  image: string | null;
  stock_available: number | null; // null = service / unknown
  /** Return mode only: the original sale_items row this line refunds. */
  sale_item_id?: number;
  /** Return mode only: quantity still returnable (sold − already returned). */
  max_qty?: number;
}

// A serializable snapshot of the whole cart, persisted as a held sale's payload.
export interface CartSnapshot {
  lines: CartLine[];
  customerId: number | null;
  customerName: string | null;
  /** Optional prescription to attach to the sale; only meaningful with a customer. */
  prescriptionId: number | null;
  discountType: DiscountType;
  discountValue: string;
  payerId: string;
  coveragePct: string;
  paymentMethod: string;
  notes: string;
}

interface CartState extends CartSnapshot {
  /** The held-sale row this cart was resumed from (re-holding updates it). */
  activeHeldId: number | null;

  // Return mode: the cart holds the returnable lines of ONE existing sale
  // (never in CartSnapshot — a return can not be parked as a held sale).
  returnMode: boolean;
  returnSaleId: number | null;
  /** Invoice label for the banner, e.g. "F-000042" or "#42". */
  returnSaleLabel: string | null;

  addLine: (line: Omit<CartLine, "key">) => void;
  setQuantity: (key: string, quantity: number) => void;
  changeQuantity: (key: string, delta: number) => void;
  setUnitPrice: (key: string, unitPrice: number) => void;
  setLineDiscount: (key: string, itemDiscount: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;

  setCustomer: (id: number | null, name: string | null) => void;
  setPrescriptionId: (id: number | null) => void;
  setDiscount: (type: DiscountType, value: string) => void;
  setPayer: (payerId: string, coveragePct: string) => void;
  setPaymentMethod: (method: string) => void;
  setNotes: (notes: string) => void;
  setActiveHeldId: (id: number | null) => void;
  loadSnapshot: (snapshot: CartSnapshot, heldId: number | null) => void;
  startReturn: (
    saleId: number,
    label: string,
    customer: { id: number; name: string | null } | null,
    lines: Omit<CartLine, "key">[],
  ) => void;
}

let counter = 0;
const newKey = () => `cart-${Date.now().toString(36)}-${counter++}`;

const EMPTY: CartSnapshot & {
  activeHeldId: number | null;
  returnMode: boolean;
  returnSaleId: number | null;
  returnSaleLabel: string | null;
} = {
  lines: [],
  customerId: null,
  customerName: null,
  prescriptionId: null,
  discountType: "amount",
  discountValue: "",
  payerId: "none",
  coveragePct: "",
  paymentMethod: "cash",
  notes: "",
  activeHeldId: null,
  returnMode: false,
  returnSaleId: null,
  returnSaleLabel: null,
};

/** Same product/variant collapses onto one line (variant id, else product id). */
function sameItem(a: Pick<CartLine, "product_id" | "variant_id">, b: typeof a) {
  if (a.variant_id != null || b.variant_id != null)
    return a.variant_id === b.variant_id;
  return a.product_id === b.product_id;
}

/** Quantities are ≥ 1 and, in return mode, never above what is returnable. */
function clampQty(line: CartLine, quantity: number): number {
  return Math.min(line.max_qty ?? Infinity, Math.max(1, quantity));
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      ...EMPTY,

      addLine: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => sameItem(l, line));
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.key === existing.key
                  ? { ...l, quantity: l.quantity + Math.max(1, line.quantity) }
                  : l,
              ),
            };
          }
          return {
            lines: [...s.lines, { ...line, key: newKey() }],
          };
        }),

      setQuantity: (key, quantity) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key ? { ...l, quantity: clampQty(l, quantity) } : l,
          ),
        })),

      changeQuantity: (key, delta) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key
              ? { ...l, quantity: clampQty(l, l.quantity + delta) }
              : l,
          ),
        })),

      setUnitPrice: (key, unitPrice) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key ? { ...l, unit_price: Math.max(0, unitPrice) } : l,
          ),
        })),

      setLineDiscount: (key, itemDiscount) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key
              ? { ...l, item_discount: Math.max(0, itemDiscount) }
              : l,
          ),
        })),

      removeLine: (key) =>
        set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),

      clear: () => set({ ...EMPTY }),

      setCustomer: (customerId, customerName) =>
        // A prescription belongs to a specific patient — never carry it over.
        set({ customerId, customerName, prescriptionId: null }),
      setPrescriptionId: (prescriptionId) => set({ prescriptionId }),
      setDiscount: (discountType, discountValue) =>
        set({ discountType, discountValue }),
      setPayer: (payerId, coveragePct) => set({ payerId, coveragePct }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setNotes: (notes) => set({ notes }),
      setActiveHeldId: (activeHeldId) => set({ activeHeldId }),

      loadSnapshot: (snapshot, heldId) =>
        // Spread EMPTY first: held-sale payloads saved before a field existed
        // (e.g. prescriptionId) must not leak the previous cart's value.
        set({ ...EMPTY, ...snapshot, activeHeldId: heldId }),

      startReturn: (saleId, label, customer, lines) =>
        set({
          ...EMPTY,
          returnMode: true,
          returnSaleId: saleId,
          returnSaleLabel: label,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          lines: lines.map((l) => ({ ...l, key: newKey() })),
        }),
    }),
    {
      // Transient crash-resilience for the *current* cart only; canonical parked
      // carts live in the held_sales table.
      name: "pos-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ---- Line builders (pure; used by the catalog card, variant chooser, scanner) ----

export function buildProductLine(
  p: Pick<
    CatalogProduct,
    | "id"
    | "name"
    | "brand"
    | "selling_price"
    | "item_type"
    | "quantity"
    | "variant_count"
    | "variant_stock"
  >,
  image: string | null,
): Omit<CartLine, "key"> {
  return {
    product_id: p.id,
    variant_id: null,
    description: `${p.name}${p.brand ? ` — ${p.brand}` : ""}`,
    unit_price: p.selling_price,
    quantity: 1,
    item_discount: 0,
    image: image ?? null,
    stock_available: p.item_type === "service" ? null : effectiveStock(p),
  };
}

export function buildVariantLine(
  v: SellableVariant,
  image: string | null,
  lang?: string,
): Omit<CartLine, "key"> {
  return {
    product_id: v.product_id,
    variant_id: v.id,
    description: `${v.product_name} — ${variantLabel(v, lang)}`,
    unit_price: v.selling_price ?? v.product_price,
    quantity: 1,
    item_discount: 0,
    image: image ?? null,
    stock_available: v.quantity,
  };
}
