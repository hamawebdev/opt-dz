/**
 * Label templates for the barcode Label Designer. A template is a label size
 * (mm) plus a list of freely-positioned elements that bind to product/variant
 * fields at print time. The named-template list is persisted as JSON in the
 * `settings` table (key `label_templates`), so it rides along in DB backups.
 */
import type { BarcodeFormat } from "@/lib/barcode";

/** Every element kind the palette can drop onto the canvas. */
export type LabelElementKind =
  | "productName"
  | "price"
  | "barcode"
  | "reference"
  | "characteristics"
  | "freeText"
  | "line"
  | "frame";

/** Text alignment for text-ish elements. */
export type LabelAlign = "left" | "center" | "right";

/**
 * One element on the label. Geometry (`x/y/w/h`) is in millimetres with the
 * origin at the label's top-left corner; `fontSize` is in points so it maps
 * cleanly to CSS (`pt`). Kind-specific fields are optional and only read for
 * the relevant kinds.
 */
export interface LabelElement {
  id: string;
  kind: LabelElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, clockwise
  fontSize: number; // points
  bold: boolean;
  align: LabelAlign;
  color: string; // hex, always dark for scannability/print
  // freeText
  text?: string;
  // barcode
  format?: BarcodeFormat; // preferred symbology; falls back per-value (effectiveFormat)
  showValue?: boolean; // render the human-readable digits
  // characteristics
  showSize?: boolean;
  showColor?: boolean;
  // line / frame
  thickness?: number; // stroke / border width in mm
  radius?: number; // frame corner radius in mm
}

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  createdAt: string;
}

/** Quick-format presets shown in the size dropdown (mm). */
export interface LabelSizePreset {
  key: string;
  label: string; // human label, e.g. "50 × 30 mm"
  widthMm: number;
  heightMm: number;
}

export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  { key: "50x30", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { key: "40x30", label: "40 × 30 mm", widthMm: 40, heightMm: 30 },
  { key: "38x25", label: "38 × 25 mm", widthMm: 38, heightMm: 25 },
  { key: "60x40", label: "60 × 40 mm", widthMm: 60, heightMm: 40 },
  { key: "100x50", label: "100 × 50 mm", widthMm: 100, heightMm: 50 },
  { key: "30x20", label: "30 × 20 mm", widthMm: 30, heightMm: 20 },
  { key: "70x40p", label: "40 × 70 mm", widthMm: 40, heightMm: 70 },
];

let idCounter = 0;
/** Collision-resistant element id (crypto when available, counter fallback). */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `el-${Date.now().toString(36)}-${idCounter}`;
}

const TEXT_KINDS: ReadonlySet<LabelElementKind> = new Set([
  "productName",
  "price",
  "reference",
  "characteristics",
  "freeText",
]);

export function isTextKind(kind: LabelElementKind): boolean {
  return TEXT_KINDS.has(kind);
}

/** A fresh element of `kind`, sized/placed sensibly for a `w × h` mm label. */
export function makeElement(
  kind: LabelElementKind,
  w: number,
  h: number,
): LabelElement {
  const m = Math.min(2, w / 10);
  const base: LabelElement = {
    id: newId(),
    kind,
    x: m,
    y: m,
    w: Math.max(8, w - 2 * m),
    h: 6,
    rotation: 0,
    fontSize: 9,
    bold: false,
    align: "center",
    color: "#000000",
  };
  switch (kind) {
    case "productName":
      return {
        ...base,
        y: m,
        h: Math.min(7, h * 0.22),
        fontSize: 9,
        bold: true,
      };
    case "price":
      return {
        ...base,
        y: Math.max(m, h - Math.min(8, h * 0.26) - m),
        h: Math.min(8, h * 0.26),
        fontSize: 13,
        bold: true,
      };
    case "barcode":
      return {
        ...base,
        x: Math.min(3, w / 8),
        y: h * 0.32,
        w: Math.max(8, w - 2 * Math.min(3, w / 8)),
        h: Math.max(6, h * 0.4),
        format: "ean13",
        showValue: true,
      };
    case "reference":
      return { ...base, h: 4, fontSize: 7, bold: false };
    case "characteristics":
      return { ...base, h: 4, fontSize: 8, showSize: true, showColor: true };
    case "freeText":
      return {
        ...base,
        w: Math.max(12, w / 2),
        h: 5,
        text: "Texte",
        align: "left",
      };
    case "line":
      return { ...base, h: 0.4, thickness: 0.3 };
    case "frame":
      return {
        ...base,
        x: 1,
        y: 1,
        w: Math.max(6, w - 2),
        h: Math.max(6, h - 2),
        thickness: 0.4,
        radius: 1,
      };
    default:
      return base;
  }
}

/**
 * Deterministic auto-format: relayout the text/barcode elements into vertical
 * bands sized by weight and fit their fonts to each band. Lines/frames are
 * left where they are (a frame is stretched to the label border). Returns a
 * new element array; element ids are preserved.
 */
export function autoFormatElements(
  els: LabelElement[],
  widthMm: number,
  heightMm: number,
): LabelElement[] {
  const m = Math.min(2, widthMm / 12);
  const contentW = Math.max(4, widthMm - 2 * m);
  const contentH = Math.max(4, heightMm - 2 * m);

  // Frames hug the label; lines keep their geometry but span the content width.
  const framesAndLines = els
    .filter((e) => e.kind === "frame" || e.kind === "line")
    .map((e) =>
      e.kind === "frame"
        ? { ...e, x: 1, y: 1, w: widthMm - 2, h: heightMm - 2 }
        : { ...e, x: m, w: contentW },
    );

  const ORDER: LabelElementKind[] = [
    "productName",
    "characteristics",
    "barcode",
    "price",
    "reference",
    "freeText",
  ];
  const WEIGHT: Record<string, number> = {
    productName: 1.1,
    characteristics: 0.7,
    barcode: 2.6,
    price: 1.1,
    reference: 0.7,
    freeText: 1,
  };

  const banded = els
    .filter((e) => e.kind !== "frame" && e.kind !== "line")
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const totalWeight =
    banded.reduce((s, e) => s + (WEIGHT[e.kind] ?? 1), 0) || 1;

  let cursor = m;
  const gap = banded.length > 1 ? Math.min(1, contentH * 0.04) : 0;
  const usableH = contentH - gap * (banded.length - 1);

  const laidOut = banded.map((e) => {
    const bandH = (usableH * (WEIGHT[e.kind] ?? 1)) / totalWeight;
    const y = cursor;
    cursor += bandH + gap;
    const fontSize =
      e.kind === "barcode"
        ? e.fontSize
        : Math.max(5, Math.min(28, Math.round(bandH * 2.6)));
    return {
      ...e,
      x: m,
      y: Math.round(y * 10) / 10,
      w: contentW,
      h: Math.round(bandH * 10) / 10,
      rotation: 0,
      align: "center" as LabelAlign,
      fontSize,
    };
  });

  // Preserve the original ordering in the array for stable selection.
  const byId = new Map([...laidOut, ...framesAndLines].map((e) => [e.id, e]));
  return els.map((e) => byId.get(e.id) ?? e);
}

/** A ready-to-edit starter template: name + barcode + price, auto-arranged. */
export function createDefaultTemplate(
  widthMm = 50,
  heightMm = 30,
): LabelTemplate {
  const els = [
    makeElement("productName", widthMm, heightMm),
    makeElement("barcode", widthMm, heightMm),
    makeElement("price", widthMm, heightMm),
  ];
  return {
    id: newId(),
    name: "",
    widthMm,
    heightMm,
    elements: autoFormatElements(els, widthMm, heightMm),
    createdAt: new Date().toISOString(),
  };
}

/** Parses the `label_templates` settings value (JSON array, may be empty/corrupt). */
export function parseLabelTemplates(
  raw: string | undefined | null,
): LabelTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LabelTemplate[]) : [];
  } catch {
    return [];
  }
}
