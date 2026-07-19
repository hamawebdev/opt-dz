/**
 * Editor state for the barcode Label Designer. Selection, zoom and the print
 * basket are ephemeral session state; the working `template` is persisted to
 * localStorage so the designer reopens on the last-used layout (falling back
 * to the built-in default on first use). Named, reusable templates live in the
 * settings table (key `label_templates`) instead.
 */
import { create } from "zustand";
import {
  autoFormatElements,
  createDefaultTemplate,
  makeElement,
  newId,
  type LabelElement,
  type LabelElementKind,
  type LabelTemplate,
} from "@/lib/label-template";
import type { LabelItem } from "@/lib/label-render";

const MIN_W = 1;
const MIN_H = 0.3;

/** localStorage key holding the last-used working template. */
const TEMPLATE_STORAGE_KEY = "label-designer:last-template";

function loadStoredTemplate(): LabelTemplate | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LabelTemplate;
    if (!parsed || !Array.isArray(parsed.elements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeTemplate(t: LabelTemplate): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(t));
  } catch {
    // Ignore unavailable / full storage — persistence is best-effort.
  }
}

function clampElement(el: LabelElement, t: LabelTemplate): LabelElement {
  const w = Math.max(MIN_W, Math.min(el.w, t.widthMm));
  const h = Math.max(MIN_H, Math.min(el.h, t.heightMm));
  return {
    ...el,
    w,
    h,
    x: Math.max(0, Math.min(el.x, t.widthMm - 0.5)),
    y: Math.max(0, Math.min(el.y, t.heightMm - 0.5)),
  };
}

interface LabelDesignerState {
  template: LabelTemplate;
  selectedId: string | null;
  zoom: number;
  snap: boolean;
  clipboard: LabelElement | null;
  basket: LabelItem[];
  previewIndex: number;

  reset: () => void;
  loadTemplate: (t: LabelTemplate) => void;
  setSize: (widthMm: number, heightMm: number) => void;
  select: (id: string | null) => void;
  addElement: (kind: LabelElementKind) => void;
  updateElement: (id: string, patch: Partial<LabelElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  copy: () => void;
  paste: () => void;
  nudge: (dxMm: number, dyMm: number) => void;
  autoFormat: () => void;
  setZoom: (z: number) => void;
  setSnap: (b: boolean) => void;

  setBasket: (items: LabelItem[]) => void;
  addBasketItem: (item: LabelItem) => void;
  removeBasketItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  setPreviewIndex: (i: number) => void;
}

export const useLabelDesignerStore = create<LabelDesignerState>((set, get) => ({
  template: loadStoredTemplate() ?? createDefaultTemplate(),
  selectedId: null,
  zoom: 2.6,
  snap: true,
  clipboard: null,
  basket: [],
  previewIndex: 0,

  // Starts a fresh print session while keeping the last-used template layout.
  reset: () =>
    set({
      selectedId: null,
      basket: [],
      previewIndex: 0,
    }),

  loadTemplate: (t) =>
    set({
      // Deep-clone so editing never mutates the saved copy.
      template: {
        ...t,
        elements: t.elements.map((e) => ({ ...e })),
      },
      selectedId: null,
    }),

  setSize: (widthMm, heightMm) =>
    set((s) => {
      const template = { ...s.template, widthMm, heightMm };
      return {
        template: {
          ...template,
          elements: template.elements.map((e) => clampElement(e, template)),
        },
      };
    }),

  select: (id) => set({ selectedId: id }),

  addElement: (kind) =>
    set((s) => {
      const el = makeElement(kind, s.template.widthMm, s.template.heightMm);
      return {
        template: { ...s.template, elements: [...s.template.elements, el] },
        selectedId: el.id,
      };
    }),

  updateElement: (id, patch) =>
    set((s) => ({
      template: {
        ...s.template,
        elements: s.template.elements.map((e) =>
          e.id === id ? clampElement({ ...e, ...patch }, s.template) : e,
        ),
      },
    })),

  removeElement: (id) =>
    set((s) => ({
      template: {
        ...s.template,
        elements: s.template.elements.filter((e) => e.id !== id),
      },
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  duplicateElement: (id) =>
    set((s) => {
      const src = s.template.elements.find((e) => e.id === id);
      if (!src) return s;
      const copy = clampElement(
        { ...src, id: newId(), x: src.x + 2, y: src.y + 2 },
        s.template,
      );
      return {
        template: { ...s.template, elements: [...s.template.elements, copy] },
        selectedId: copy.id,
      };
    }),

  copy: () => {
    const { template, selectedId } = get();
    const el = template.elements.find((e) => e.id === selectedId);
    if (el) set({ clipboard: { ...el } });
  },

  paste: () =>
    set((s) => {
      if (!s.clipboard) return s;
      const copy = clampElement(
        {
          ...s.clipboard,
          id: newId(),
          x: s.clipboard.x + 2,
          y: s.clipboard.y + 2,
        },
        s.template,
      );
      return {
        template: { ...s.template, elements: [...s.template.elements, copy] },
        selectedId: copy.id,
      };
    }),

  nudge: (dxMm, dyMm) =>
    set((s) => {
      if (!s.selectedId) return s;
      return {
        template: {
          ...s.template,
          elements: s.template.elements.map((e) =>
            e.id === s.selectedId
              ? clampElement({ ...e, x: e.x + dxMm, y: e.y + dyMm }, s.template)
              : e,
          ),
        },
      };
    }),

  autoFormat: () =>
    set((s) => ({
      template: {
        ...s.template,
        elements: autoFormatElements(
          s.template.elements,
          s.template.widthMm,
          s.template.heightMm,
        ),
      },
    })),

  setZoom: (z) => set({ zoom: Math.max(0.5, Math.min(8, z)) }),
  setSnap: (b) => set({ snap: b }),

  setBasket: (items) => set({ basket: items, previewIndex: 0 }),

  addBasketItem: (item) =>
    set((s) => {
      if (s.basket.some((b) => b.key === item.key)) return s;
      return { basket: [...s.basket, item] };
    }),

  removeBasketItem: (key) =>
    set((s) => {
      const basket = s.basket.filter((b) => b.key !== key);
      return {
        basket,
        previewIndex: Math.min(s.previewIndex, Math.max(0, basket.length - 1)),
      };
    }),

  setQty: (key, qty) =>
    set((s) => ({
      basket: s.basket.map((b) =>
        b.key === key ? { ...b, qty: Math.max(1, qty) } : b,
      ),
    })),

  setPreviewIndex: (i) => set({ previewIndex: i }),
}));

// Persist the working template whenever it changes, so the next session reopens
// on the last-used layout (loading a saved template counts as "last-used" too).
useLabelDesignerStore.subscribe((state, prev) => {
  if (state.template !== prev.template) storeTemplate(state.template);
});
