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
  credit_note_prefix: "A",
  credit_note_padding: "6",
  credit_note_next: "1",
  receipt_target: "",
  receipt_width: "48",
  recall_months: "24",
  expiry_warn_days: "30",
  client_code_prefix: "P-",
  client_code_padding: "4",
  client_code_next: "1",
  receipt_config: "",
  label_config: "",
  manager_pin_hash: "",
  discount_pin_threshold: "2000",
  auto_backup_enabled: "0",
  auto_backup_interval_days: "1",
  auto_backup_keep: "14",
  last_auto_backup: "",
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
    credit_note_prefix:
      map.get("credit_note_prefix") ?? DEFAULTS.credit_note_prefix,
    credit_note_padding:
      map.get("credit_note_padding") || DEFAULTS.credit_note_padding,
    credit_note_next: map.get("credit_note_next") || DEFAULTS.credit_note_next,
    receipt_target: map.get("receipt_target") ?? DEFAULTS.receipt_target,
    receipt_width: map.get("receipt_width") || DEFAULTS.receipt_width,
    recall_months: map.get("recall_months") || DEFAULTS.recall_months,
    expiry_warn_days: map.get("expiry_warn_days") || DEFAULTS.expiry_warn_days,
    client_code_prefix:
      map.get("client_code_prefix") ?? DEFAULTS.client_code_prefix,
    client_code_padding:
      map.get("client_code_padding") || DEFAULTS.client_code_padding,
    client_code_next: map.get("client_code_next") || DEFAULTS.client_code_next,
    receipt_config: map.get("receipt_config") ?? DEFAULTS.receipt_config,
    label_config: map.get("label_config") ?? DEFAULTS.label_config,
    manager_pin_hash: map.get("manager_pin_hash") ?? DEFAULTS.manager_pin_hash,
    discount_pin_threshold:
      map.get("discount_pin_threshold") || DEFAULTS.discount_pin_threshold,
    auto_backup_enabled:
      map.get("auto_backup_enabled") ?? DEFAULTS.auto_backup_enabled,
    auto_backup_interval_days:
      map.get("auto_backup_interval_days") ||
      DEFAULTS.auto_backup_interval_days,
    auto_backup_keep: map.get("auto_backup_keep") || DEFAULTS.auto_backup_keep,
    last_auto_backup: map.get("last_auto_backup") ?? DEFAULTS.last_auto_backup,
  };
}

/** Upserts the provided settings keys. The fiscal counters (invoice/avoir next number)
 * may never be moved backwards — that would re-issue an existing number and break the
 * gap-free sequence / unique index (audit finding B6). */
export async function saveSettings(
  settings: Partial<ShopSettings> & Record<string, string | undefined>,
): Promise<void> {
  const db = await getDb();
  for (const [key, value] of Object.entries(settings)) {
    if (key === "invoice_next" || key === "credit_note_next") {
      const cur = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = $1",
        [key],
      );
      const curN = Number(cur[0]?.value ?? "1") || 1;
      if ((Number(value) || 0) < curN) {
        throw new Error(
          `Cannot set ${key} below its current value (${curN}) — it would re-issue a number.`,
        );
      }
    }
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value ?? ""],
    );
  }
}
