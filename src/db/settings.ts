import { getDb } from "@/lib/db";
import type { ShopSettings } from "@/types";

const DEFAULTS: ShopSettings = {
  shop_name: "My Optical Shop",
  shop_address: "",
  shop_phone: "",
  shop_logo: "",
  currency_symbol: "DA",
  invoice_footer: "Thank you for your visit.",
  backup_dir: "",
  tva_rate: "1900",
  timbre_rate: "100",
  timbre_min: "500",
  timbre_max: "0",
  invoice_prefix: "",
  invoice_padding: "6",
  receipt_target: "",
  receipt_width: "48",
  recall_months: "24",
  expiry_warn_days: "30",
  client_code_prefix: "P-",
  client_code_padding: "4",
  client_code_next: "1",
  receipt_config: "",
  label_config: "",
};

/** Reads all settings as a typed object, falling back to defaults for missing keys. */
export async function getSettings(): Promise<ShopSettings> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string | null }[]>(
    "SELECT key, value FROM settings",
  );
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  return {
    shop_name: map.get("shop_name") ?? DEFAULTS.shop_name,
    shop_address: map.get("shop_address") ?? DEFAULTS.shop_address,
    shop_phone: map.get("shop_phone") ?? DEFAULTS.shop_phone,
    shop_logo: map.get("shop_logo") ?? DEFAULTS.shop_logo,
    currency_symbol: map.get("currency_symbol") || DEFAULTS.currency_symbol,
    invoice_footer: map.get("invoice_footer") ?? DEFAULTS.invoice_footer,
    backup_dir: map.get("backup_dir") ?? DEFAULTS.backup_dir,
    tva_rate: map.get("tva_rate") ?? DEFAULTS.tva_rate,
    timbre_rate: map.get("timbre_rate") ?? DEFAULTS.timbre_rate,
    timbre_min: map.get("timbre_min") ?? DEFAULTS.timbre_min,
    timbre_max: map.get("timbre_max") ?? DEFAULTS.timbre_max,
    invoice_prefix: map.get("invoice_prefix") ?? DEFAULTS.invoice_prefix,
    invoice_padding: map.get("invoice_padding") ?? DEFAULTS.invoice_padding,
    receipt_target: map.get("receipt_target") ?? DEFAULTS.receipt_target,
    receipt_width: map.get("receipt_width") || DEFAULTS.receipt_width,
    recall_months: map.get("recall_months") || DEFAULTS.recall_months,
    expiry_warn_days: map.get("expiry_warn_days") || DEFAULTS.expiry_warn_days,
    client_code_prefix: map.get("client_code_prefix") ?? DEFAULTS.client_code_prefix,
    client_code_padding: map.get("client_code_padding") || DEFAULTS.client_code_padding,
    client_code_next: map.get("client_code_next") || DEFAULTS.client_code_next,
    receipt_config: map.get("receipt_config") ?? DEFAULTS.receipt_config,
    label_config: map.get("label_config") ?? DEFAULTS.label_config,
  };
}

/** Upserts the provided settings keys. */
export async function saveSettings(settings: Partial<ShopSettings>): Promise<void> {
  const db = await getDb();
  for (const [key, value] of Object.entries(settings)) {
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value ?? ""],
    );
  }
}
