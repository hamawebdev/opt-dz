import type { ReceiptConfig } from "@/types";

export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  show_logo: true,
  show_address: true,
  show_phone: true,
  header_text: "",
  footer_text: "",
  show_tax: true,
  show_timbre: true,
  show_qty: true,
  show_unit_price: true,
  show_discount: true,
  item_attribute_keys: [],
  paper: "a4",
};

/** Parses the JSON stored in `ShopSettings.receipt_config`, merged over defaults. */
export function parseReceiptConfig(raw: string | undefined): ReceiptConfig {
  if (!raw) return DEFAULT_RECEIPT_CONFIG;
  try {
    return { ...DEFAULT_RECEIPT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RECEIPT_CONFIG;
  }
}
