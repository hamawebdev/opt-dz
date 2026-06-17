import bwipjs from "bwip-js/browser";
import type { LabelConfig } from "@/types";

export type BarcodeFormat = LabelConfig["format"];

const BCID: Record<BarcodeFormat, string> = {
  ean13: "ean13",
  code128: "code128",
  qrcode: "qrcode",
};

/** EAN-13 check digit for a 12-digit numeric string. */
function ean13Check(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = d12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a unique, valid EAN-13 from a numeric seed (typically a product id).
 * Uses the in-store reserved prefix "20" + a 10-digit zero-padded seed + check digit,
 * so generated codes never collide with manufacturer GTINs.
 */
export function generateEan13(seed: number): string {
  const base = "20" + String(Math.abs(seed) % 1e10).padStart(10, "0");
  return base + String(ean13Check(base));
}

/** True when `value` is a valid EAN-13 payload (12 or 13 digits, correct check digit). */
export function isValidEan13(value: string): boolean {
  if (!/^\d{12,13}$/.test(value)) return false;
  if (value.length === 12) return true; // bwip-js appends the check digit
  return ean13Check(value.slice(0, 12)) === value.charCodeAt(12) - 48;
}

/**
 * Picks the symbology that can actually encode `value`. EAN-13 only accepts
 * numeric GTINs, so an alphanumeric reference (e.g. "RB3025") falls back to
 * Code 128, guaranteeing the preview always shows a scannable barcode.
 */
export function effectiveFormat(
  format: BarcodeFormat,
  value: string,
): BarcodeFormat {
  if (format === "ean13" && !isValidEan13(value)) return "code128";
  return format;
}

export interface RenderOptions {
  value: string;
  format: BarcodeFormat;
  /** Show the human-readable number under linear barcodes. */
  includeText?: boolean;
  scale?: number;
  height?: number; // mm-ish (bwip "height" units), linear only
}

/**
 * Renders a barcode/QR onto a canvas. Returns true on success; false (without
 * throwing) when the value is invalid for the chosen symbology, so callers can
 * show a friendly hint instead of crashing the preview.
 */
export function renderBarcode(
  canvas: HTMLCanvasElement,
  opts: RenderOptions,
): boolean {
  try {
    bwipjs.toCanvas(canvas, {
      bcid: BCID[opts.format],
      text: opts.value,
      scale: opts.scale ?? 3,
      height: opts.format === "qrcode" ? undefined : (opts.height ?? 12),
      includetext:
        opts.format === "qrcode" ? false : (opts.includeText ?? true),
      textxalign: "center",
    });
    return true;
  } catch {
    return false;
  }
}

/** Data-URL PNG of a freshly-rendered barcode (for export / embedding in print). */
export function barcodeDataUrl(opts: RenderOptions): string | null {
  const canvas = document.createElement("canvas");
  if (!renderBarcode(canvas, opts)) return null;
  return canvas.toDataURL("image/png");
}
