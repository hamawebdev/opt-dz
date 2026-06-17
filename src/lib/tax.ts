import type { ShopSettings } from "@/types";

/**
 * TVA + droit de timbre math, kept in lockstep with the authoritative Rust
 * `create_sale` command (src-tauri/src/lib.rs). All amounts are integer centimes;
 * rates are basis points (1900 = 19.00%). Integer division truncates, matching Rust.
 */
export interface TaxConfig {
  tvaRate: number; // basis points
  timbreRate: number; // basis points
  timbreMin: number; // centimes
  timbreMax: number; // centimes (0 = no cap)
}

export function taxConfig(
  settings?: Pick<
    ShopSettings,
    "tva_rate" | "timbre_rate" | "timbre_min" | "timbre_max"
  >,
): TaxConfig {
  return {
    tvaRate: Number(settings?.tva_rate ?? 0) || 0,
    timbreRate: Number(settings?.timbre_rate ?? 0) || 0,
    timbreMin: Number(settings?.timbre_min ?? 0) || 0,
    timbreMax: Number(settings?.timbre_max ?? 0) || 0,
  };
}

/** TVA portion contained in a tax-inclusive (TTC) total. */
export function extractTva(totalCentimes: number, tvaRateBp: number): number {
  if (tvaRateBp <= 0 || totalCentimes <= 0) return 0;
  const netHt = Math.floor((totalCentimes * 10000) / (10000 + tvaRateBp));
  return totalCentimes - netHt;
}

/** Droit de timbre on a cash sale's TTC total (0 unless cash and a rate is set). */
export function computeTimbre(
  totalCentimes: number,
  cfg: TaxConfig,
  isCash: boolean,
): number {
  if (!isCash || cfg.timbreRate <= 0 || totalCentimes <= 0) return 0;
  let t = Math.floor((totalCentimes * cfg.timbreRate) / 10000);
  if (t < cfg.timbreMin) t = cfg.timbreMin;
  if (cfg.timbreMax > 0 && t > cfg.timbreMax) t = cfg.timbreMax;
  return t;
}
