import { useRef } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  elementBarcodeSvg,
  resolveElement,
  type LabelItem,
} from "@/lib/label-render";
import type { LabelElement } from "@/lib/label-template";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";

/** Points → millimetres (1pt = 1/72in, 1in = 25.4mm). */
const PT_TO_MM = 0.352778;

interface Props {
  el: LabelElement;
  item: LabelItem;
  symbol: string | undefined;
  scale: number; // pixels per millimetre on the canvas
  selected: boolean;
}

/**
 * One element rendered on the canvas, bound to the current preview item.
 * Hosts the pointer-driven move / resize / rotate interactions; geometry is
 * stored in millimetres so the canvas and print output stay in lock-step.
 */
export function LabelElementView({ el, item, symbol, scale, selected }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const select = useLabelDesignerStore((s) => s.select);
  const update = useLabelDesignerStore((s) => s.updateElement);
  const snap = useLabelDesignerStore((s) => s.snap);

  const snapMm = (v: number) =>
    snap ? Math.round(v) : Math.round(v * 10) / 10;

  /** Begin a pointer drag; `onMove` receives px deltas + absolute coords. */
  function beginDrag(
    e: React.PointerEvent,
    onMove: (dx: number, dy: number, absX: number, absY: number) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev: PointerEvent) =>
      onMove(ev.clientX - startX, ev.clientY - startY, ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onBodyDown(e: React.PointerEvent) {
    select(el.id);
    const sx = el.x;
    const sy = el.y;
    beginDrag(e, (dx, dy) =>
      update(el.id, { x: snapMm(sx + dx / scale), y: snapMm(sy + dy / scale) }),
    );
  }

  function onResizeDown(e: React.PointerEvent) {
    select(el.id);
    const sw = el.w;
    const sh = el.h;
    beginDrag(e, (dx, dy) =>
      update(el.id, { w: snapMm(sw + dx / scale), h: snapMm(sh + dy / scale) }),
    );
  }

  function onRotateDown(e: React.PointerEvent) {
    select(el.id);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    beginDrag(e, (_dx, _dy, absX, absY) => {
      const ang = (Math.atan2(absY - cy, absX - cx) * 180) / Math.PI + 90;
      const snapped = snap ? Math.round(ang / 15) * 15 : Math.round(ang);
      // Normalise into [-180, 180] so the rotation slider stays in sync.
      const rot = ((((snapped + 180) % 360) + 360) % 360) - 180;
      update(el.id, { rotation: rot });
    });
  }

  const wrapperStyle: CSSProperties = {
    position: "absolute",
    left: el.x * scale,
    top: el.y * scale,
    width: el.w * scale,
    height: el.h * scale,
    transform: `rotate(${el.rotation}deg)`,
    transformOrigin: "center center",
    boxShadow: selected ? "0 0 0 1.5px var(--primary)" : undefined,
  };

  return (
    <div
      ref={ref}
      onPointerDown={onBodyDown}
      style={wrapperStyle}
      className={cn("box-border cursor-move overflow-hidden")}
    >
      <ElementContent el={el} item={item} symbol={symbol} scale={scale} />

      {selected && (
        <>
          {/* rotate handle */}
          <span
            onPointerDown={onRotateDown}
            className="border-background bg-primary absolute start-1/2 -top-5 size-3 -translate-x-1/2 cursor-grab rounded-full border"
          />
          {/* resize handle (bottom-end corner) */}
          <span
            onPointerDown={onResizeDown}
            className="border-background bg-primary absolute -end-1 -bottom-1 size-3 cursor-nwse-resize rounded-sm border"
          />
        </>
      )}
    </div>
  );
}

function ElementContent({
  el,
  item,
  symbol,
  scale,
}: {
  el: LabelElement;
  item: LabelItem;
  symbol: string | undefined;
  scale: number;
}) {
  if (el.kind === "line") {
    return (
      <div className="flex h-full w-full items-center">
        <div
          style={{
            height: (el.thickness ?? 0.3) * scale,
            background: el.color,
          }}
          className="w-full"
        />
      </div>
    );
  }

  if (el.kind === "frame") {
    return (
      <div
        className="box-border h-full w-full"
        style={{
          border: `${(el.thickness ?? 0.4) * scale}px solid ${el.color}`,
          borderRadius: (el.radius ?? 0) * scale,
        }}
      />
    );
  }

  if (el.kind === "barcode") {
    const markup = elementBarcodeSvg(el, resolveElement(el, item, symbol));
    if (!markup) {
      return (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center bg-white text-[8px]">
          barcode
        </div>
      );
    }
    return (
      <div
        className="h-full w-full bg-white"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  // Text-ish elements
  const text = resolveElement(el, item, symbol);
  return (
    <div
      dir="auto"
      className="flex h-full w-full items-center overflow-hidden"
      style={{
        justifyContent:
          el.align === "left"
            ? "flex-start"
            : el.align === "right"
              ? "flex-end"
              : "center",
        textAlign: el.align,
        fontSize: el.fontSize * PT_TO_MM * scale,
        fontWeight: el.bold ? 700 : 400,
        color: el.color,
        lineHeight: 1.05,
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
}
