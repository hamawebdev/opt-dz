import { cva, type VariantProps } from "class-variance-authority";
import { differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { DraggableEvent } from "@/features/calendar/dnd/draggable-event";
import { ResizableEvent } from "@/features/calendar/dnd/resizable-event";
import { formatTime, HOUR_HEIGHT_PX } from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

/**
 * `colored` paints the whole chip; `dot` keeps it neutral and carries the
 * status in a small swatch instead. Cancelled appointments are struck through
 * so they read as dead at a glance.
 */
const chipVariants = cva(
  "flex w-full select-none items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs",
  {
    variants: {
      color: {
        blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
        green:
          "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300",
        orange:
          "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
        red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300",
        gray: "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
      },
      neutral: {
        true: "bg-card hover:bg-accent border-border text-foreground",
        false: "",
      },
    },
    defaultVariants: { neutral: false },
  },
);

/** Small colour swatch shown in `dot` mode. */
const dotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    color: {
      blue: "bg-blue-600 dark:bg-blue-500",
      green: "bg-green-600 dark:bg-green-500",
      orange: "bg-orange-500 dark:bg-orange-400",
      red: "bg-red-600 dark:bg-red-500",
      gray: "bg-gray-500 dark:bg-gray-400",
    },
  },
});

type ChipColor = NonNullable<VariantProps<typeof chipVariants>["color"]>;

function ChipInner({
  event,
  showTime,
  height,
}: {
  event: ICalendarEvent;
  showTime: boolean;
  height?: number;
}) {
  const { badgeVariant, use24HourFormat, openDetails } = useCalendar();
  const isDot = badgeVariant === "dot";
  const Icon = STATUS_META[event.status].icon;
  const color = event.color as ChipColor;

  // Below ~35 minutes there is no room for a second line of text.
  const compact = height !== undefined && height < 44;

  return (
    <button
      type="button"
      onClick={() => openDetails(event)}
      title={`${formatTime(event.start, use24HourFormat)} ${event.title}`}
      className={cn(
        chipVariants({ color, neutral: isDot }),
        // In a time grid the Resizable wrapper owns the height; filling it
        // keeps a single source of truth while a resize is in flight.
        height !== undefined ? "h-full flex-col items-start gap-0 py-1" : "h-6.5",
        compact && "justify-center py-0",
        event.status === "cancelled" && "line-through opacity-70",
      )}
    >
      <span className="flex w-full items-center gap-1.5 overflow-hidden">
        {isDot && <span className={cn(dotVariants({ color }))} />}
        <Icon className="size-3.5 shrink-0" />
        <span className="flex-1 truncate font-semibold">{event.title}</span>
        {showTime && height === undefined && (
          <span className="hidden shrink-0 sm:inline">
            {formatTime(event.start, use24HourFormat)}
          </span>
        )}
      </span>

      {height !== undefined && !compact && (
        <span className="truncate">
          {formatTime(event.start, use24HourFormat)} –{" "}
          {formatTime(event.end, use24HourFormat)}
        </span>
      )}
    </button>
  );
}

/** One-line chip for the month grid and multi-appointment lists. */
export function MonthEventChip({
  event,
  className,
}: {
  event: ICalendarEvent;
  className?: string;
}) {
  return (
    <DraggableEvent event={event} className={className}>
      <ChipInner event={event} showTime />
    </DraggableEvent>
  );
}

/** Time-proportional block for the day and week grids: draggable to reschedule,
 * resizable from the bottom edge to change duration. */
export function EventBlock({ event }: { event: ICalendarEvent }) {
  const durationMin = differenceInMinutes(event.end, event.start);
  const height = (durationMin / 60) * HOUR_HEIGHT_PX - 8;

  return (
    <ResizableEvent event={event} height={height}>
      {(currentHeight) => (
        <DraggableEvent event={event} className="h-full">
          <ChipInner event={event} showTime={false} height={currentHeight} />
        </DraggableEvent>
      )}
    </ResizableEvent>
  );
}
