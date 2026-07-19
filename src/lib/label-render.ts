/**
 * Renders a {@link LabelTemplate} for a set of label items into faithful,
 * absolute-mm HTML for the OS print dialog (each copy is its own print page).
 * Field binding (which product/variant value each element shows) lives here so
 * the designer canvas and the print output resolve values identically.
 */
import { barcodeSvg, effectiveFormat } from "@/lib/barcode";
import { formatDZD } from "@/lib/format";
import type { LabelElement, LabelTemplate } from "@/lib/label-template";

/**
 * One label to print. Flattened at seeding time (a product row expands to one
 * item per variant; a product without variants yields a single item), so the
 * renderer never needs to know about the product/variant split.
 */
export interface LabelItem {
  /** Stable identity for steppers/removal: "p{productId}" or "v{variantId}". */
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  /** Variant descriptor (colour / size), "" for plain products. */
  characteristics: string;
  priceCents: number;
  /** The scannable value: variant barcode||sku, or product barcode||reference. */
  code: string;
  /** Shown by the "reference" element (product reference / variant sku). */
  reference: string;
  qty: number; // copies, min 1
}

/** The bound display string for an element, given the item it prints for. */
export function resolveElement(
  el: LabelElement,
  item: LabelItem,
  symbol: string | undefined,
): string {
  switch (el.kind) {
    case "productName":
      return item.name;
    case "price":
      return formatDZD(item.priceCents, symbol);
    case "barcode":
      return item.code;
    case "reference":
      return item.reference;
    case "characteristics":
      // The colour/size split of stock-manager doesn't exist here — variants
      // carry one combined descriptor, shown unless both toggles are off.
      return el.showSize === false && el.showColor === false
        ? ""
        : item.characteristics;
    case "freeText":
      return el.text ?? "";
    default:
      return "";
  }
}

/** A placeholder item so the canvas is usable before any product is added. */
export function sampleLabelItem(): LabelItem {
  return {
    key: "sample",
    productId: -1,
    variantId: null,
    name: "PRODUCT NAME",
    characteristics: "Noir / M",
    priceCents: 0,
    code: "2000000000008",
    reference: "REF-0000",
    qty: 1,
  };
}

/** Barcode SVG for an element, honouring its preferred symbology per value. */
export function elementBarcodeSvg(el: LabelElement, value: string): string {
  if (!value) return "";
  return barcodeSvg({
    value,
    format: effectiveFormat(el.format ?? "ean13", value),
    includeText: el.showValue !== false,
  });
}

// --- HTML (OS print) -------------------------------------------------------

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

function justifyFor(align: string): string {
  return align === "left"
    ? "flex-start"
    : align === "right"
      ? "flex-end"
      : "center";
}

/** Inner markup for one positioned element (without its absolute wrapper). */
function elementInnerHtml(
  el: LabelElement,
  item: LabelItem,
  symbol: string | undefined,
): string {
  if (el.kind === "line") {
    return `<div style="width:100%;height:${el.thickness ?? 0.3}mm;background:${el.color};margin-top:auto;margin-bottom:auto"></div>`;
  }
  if (el.kind === "frame") {
    return `<div style="width:100%;height:100%;box-sizing:border-box;border:${el.thickness ?? 0.4}mm solid ${el.color};border-radius:${el.radius ?? 0}mm"></div>`;
  }
  if (el.kind === "barcode") {
    return elementBarcodeSvg(el, resolveElement(el, item, symbol));
  }
  const text = resolveElement(el, item, symbol);
  return `<div dir="auto" style="display:flex;width:100%;height:100%;align-items:center;justify-content:${justifyFor(el.align)};text-align:${el.align};font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};color:${el.color};line-height:1.05;overflow:hidden;word-break:break-word">${esc(text)}</div>`;
}

function labelHtmlOne(
  template: LabelTemplate,
  item: LabelItem,
  symbol: string | undefined,
): string {
  const els = template.elements
    .map((el) => {
      const wrap = `position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;transform:rotate(${el.rotation}deg);transform-origin:center center;overflow:hidden;box-sizing:border-box`;
      return `<div style="${wrap}">${elementInnerHtml(el, item, symbol)}</div>`;
    })
    .join("");
  return `<div class="label">${els}</div>`;
}

/** Faithful HTML for the OS print dialog. Each copy is its own print page. */
export function labelDesignHtml(
  template: LabelTemplate,
  items: LabelItem[],
  symbol: string | undefined,
): string {
  const W = template.widthMm;
  const H = template.heightMm;
  const labels: string[] = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(1, item.qty); i++) {
      labels.push(labelHtmlOne(template, item, symbol));
    }
  }
  return `<html><head><meta charset="utf-8"><style>
    @page { size: ${W}mm ${H}mm; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .label { position: relative; width: ${W}mm; height: ${H}mm; overflow: hidden; page-break-after: always; break-after: page; background: #fff; }
    .label:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${labels.join("")}</body></html>`;
}
