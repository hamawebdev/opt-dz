import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/use-settings";
import { sampleLabelItem } from "@/lib/label-render";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";
import { LabelElementView } from "./label-element-view";

/** Screen pixels per millimetre at zoom = 1 (≈ 96 dpi). */
export const PX_PER_MM = 96 / 25.4;

/**
 * The WYSIWYG label preview. Renders the working template at the current zoom,
 * with a 1mm grid, the selected element's handles, qty stacking, and keyboard
 * shortcuts (copy / paste / duplicate / delete / nudge).
 */
export function DesignCanvas() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const wrapRef = useRef<HTMLDivElement>(null);

  const template = useLabelDesignerStore((s) => s.template);
  const zoom = useLabelDesignerStore((s) => s.zoom);
  const selectedId = useLabelDesignerStore((s) => s.selectedId);
  const basket = useLabelDesignerStore((s) => s.basket);
  const previewIndex = useLabelDesignerStore((s) => s.previewIndex);
  const select = useLabelDesignerStore((s) => s.select);
  const copy = useLabelDesignerStore((s) => s.copy);
  const paste = useLabelDesignerStore((s) => s.paste);
  const duplicateElement = useLabelDesignerStore((s) => s.duplicateElement);
  const removeElement = useLabelDesignerStore((s) => s.removeElement);
  const nudge = useLabelDesignerStore((s) => s.nudge);

  const scale = zoom * PX_PER_MM;
  const item = basket[previewIndex] ?? sampleLabelItem();
  const labelW = template.widthMm * scale;
  const labelH = template.heightMm * scale;
  const ghostCount = Math.min(3, Math.max(0, item.qty - 1));

  function onKeyDown(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copy();
    } else if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      paste();
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (selectedId) duplicateElement(selectedId);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      e.preventDefault();
      removeElement(selectedId);
    } else if (e.key.startsWith("Arrow") && selectedId) {
      e.preventDefault();
      const step = e.shiftKey ? 0.2 : 1;
      if (e.key === "ArrowLeft") nudge(-step, 0);
      if (e.key === "ArrowRight") nudge(step, 0);
      if (e.key === "ArrowUp") nudge(0, -step);
      if (e.key === "ArrowDown") nudge(0, step);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold">
            {t("labelDesigner.previewTitle")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t("labelDesigner.previewSubtitle")}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          {basket.length > 0
            ? t("labelDesigner.previewOf", {
                index: previewIndex + 1,
                total: basket.length,
              })
            : t("labelDesigner.previewSample")}
        </span>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={() => select(null)}
        className="bg-muted/40 relative flex flex-1 items-center justify-center overflow-auto p-6 outline-none"
      >
        <div className="relative" style={{ width: labelW, height: labelH }}>
          {/* qty stacking ghosts */}
          {Array.from({ length: ghostCount }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-sm border bg-white shadow-sm"
              style={{
                width: labelW,
                height: labelH,
                top: (i + 1) * 6,
                insetInlineStart: (i + 1) * 6,
                opacity: 0.5 - i * 0.12,
                zIndex: 0,
              }}
            />
          ))}

          {/* the editable label */}
          <div
            onPointerDown={(e) => {
              // Clicks on the label background (not an element) clear selection.
              if (e.target === e.currentTarget) {
                e.stopPropagation();
                select(null);
              } else {
                e.stopPropagation();
              }
            }}
            className="absolute start-0 top-0 overflow-hidden border bg-white shadow-md"
            style={{
              width: labelW,
              height: labelH,
              zIndex: 1,
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
              backgroundSize: `${scale}px ${scale}px`,
            }}
          >
            {template.elements.map((el) => (
              <LabelElementView
                key={el.id}
                el={el}
                item={item}
                symbol={symbol}
                scale={scale}
                selected={el.id === selectedId}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground border-t px-4 py-2 text-[11px] leading-snug">
        {t("labelDesigner.canvasTip")}
      </p>
    </div>
  );
}
