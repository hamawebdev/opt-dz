import { useCallback, useState, type ReactNode } from "react";
import { addMinutes, differenceInMinutes } from "date-fns";
import { Resizable } from "re-resizable";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { useDragDrop } from "@/features/calendar/contexts/dnd-context";
import { formatTime, HOUR_HEIGHT_PX } from "@/features/calendar/helpers";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

const MINUTES_PER_PIXEL = 60 / HOUR_HEIGHT_PX;
/** Appointments are booked in quarter-hours, so snap to 15. */
const STEP_MINUTES = 15;
const MIN_DURATION = 15;
const MAX_DURATION = 8 * 60;

interface ResizableEventProps {
  event: ICalendarEvent;
  /** Height in pixels for the event's stored duration. */
  height: number;
  children: (height: number) => ReactNode;
}

/**
 * Drag the bottom edge of an appointment to change how long it runs.
 *
 * Only the bottom edge is draggable: the top edge would move the start time,
 * which is a reschedule and belongs to drag-and-drop. The database is written
 * once, when the drag settles — not on every pixel of movement.
 */
export function ResizableEvent({
  event,
  height,
  children,
}: ResizableEventProps) {
  const { use24HourFormat } = useCalendar();
  const { commitResize } = useDragDrop();
  const [preview, setPreview] = useState<number | null>(null);

  const locked = event.status === "cancelled";
  const baseDuration = differenceInMinutes(event.end, event.start);

  /** Snapped duration for a pixel delta on the bottom edge. */
  const durationFor = useCallback(
    (deltaPx: number) => {
      const raw = baseDuration + deltaPx * MINUTES_PER_PIXEL;
      const snapped = Math.round(raw / STEP_MINUTES) * STEP_MINUTES;
      return Math.min(MAX_DURATION, Math.max(MIN_DURATION, snapped));
    },
    [baseDuration],
  );

  // Cancelled appointments are not resizable, but still need the wrapper that
  // gives the chip its height.
  if (locked) return <div style={{ height }}>{children(height)}</div>;

  const previewHeight =
    preview === null ? height : (preview / 60) * HOUR_HEIGHT_PX - 8;

  return (
    <div className="relative">
      <Resizable
        size={{ width: "100%", height: previewHeight }}
        minHeight={(MIN_DURATION / 60) * HOUR_HEIGHT_PX - 8}
        maxHeight={(MAX_DURATION / 60) * HOUR_HEIGHT_PX}
        enable={{ bottom: true }}
        handleStyles={{
          bottom: { height: "10px", bottom: "-5px", cursor: "ns-resize" },
        }}
        onResize={(_e, _dir, _ref, delta) => {
          setPreview(durationFor(delta.height));
        }}
        onResizeStop={(_e, _dir, _ref, delta) => {
          const duration = durationFor(delta.height);
          setPreview(null);
          commitResize(event, duration);
        }}
        className={cn(preview !== null && "z-50")}
      >
        {children(previewHeight)}
      </Resizable>

      {preview !== null && (
        <div className="bg-foreground text-background pointer-events-none absolute -top-7 start-1/2 z-50 -translate-x-1/2 rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
          {formatTime(event.start, use24HourFormat)} –{" "}
          {formatTime(addMinutes(event.start, preview), use24HourFormat)}
        </div>
      )}
    </div>
  );
}
