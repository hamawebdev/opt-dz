import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  addYears,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isSameYear,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { WEEK_STARTS_ON } from "@/lib/date-range";
import type { AppointmentRow, AppointmentStatus } from "@/types";
import type {
  ICalendarCell,
  ICalendarEvent,
} from "@/features/calendar/interfaces";
import type { TCalendarView, TEventColor } from "@/features/calendar/types";

/** One hour of the day grid, in pixels. Drives every absolute position in the
 * day/week views, so resizing maths must use the same constant. */
export const HOUR_HEIGHT_PX = 96;
const MINUTES_PER_DAY = 1440;

/** Colour is a read-out of status, never chosen by hand: upcoming work is blue,
 * a patient in the shop is amber, finished is green, and the two failure
 * endings are red (no-show) and grey (cancelled). */
const STATUS_COLORS: Record<AppointmentStatus, TEventColor> = {
  booked: "blue",
  arrived: "orange",
  done: "green",
  no_show: "red",
  cancelled: "gray",
};

/** Order used by the header legend — the lifecycle, left to right. */
export const STATUS_ORDER: AppointmentStatus[] = [
  "booked",
  "arrived",
  "done",
  "no_show",
  "cancelled",
];

export const statusColor = (status: AppointmentStatus): TEventColor =>
  STATUS_COLORS[status];

/** SQLite stores `'YYYY-MM-DD HH:MM'` in *local* shop time. Parsing it with
 * `new Date()` would treat it as UTC in some engines, shifting every
 * appointment; parse the components explicitly instead. */
export function parseLocal(value: string): Date {
  const [datePart = "", timePart = "00:00"] = value.split(/[ T]/);
  const parsed = parse(
    `${datePart} ${timePart.slice(0, 5)}`,
    "yyyy-MM-dd HH:mm",
    new Date(),
  );
  return isValid(parsed) ? parsed : new Date(NaN);
}

/** The inverse of `parseLocal` — the storage format the appointments table and
 * the conflict query both expect. */
export const formatLocal = (date: Date): string =>
  format(date, "yyyy-MM-dd HH:mm");

/** Turns a joined appointment row into the calendar's event shape. */
export function toEvent(row: AppointmentRow): ICalendarEvent {
  const start = parseLocal(row.starts_at);
  return {
    id: row.id,
    start,
    end: addMinutes(start, row.duration_min),
    title: row.patient_name,
    color: statusColor(row.status),
    status: row.status,
    optometrist: row.optometrist,
    reason: row.reason,
    row,
  };
}

/** The `{ from, to }` day range the current view needs from the database. Kept
 * deliberately wide (whole month/year) so navigation inside a view is instant. */
export function viewRange(
  view: TCalendarView,
  date: Date,
): { from: string; to: string } {
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (view) {
    case "checkin": {
      const today = iso(new Date());
      return { from: today, to: today };
    }
    case "day":
      return { from: iso(date), to: iso(date) };
    case "week":
      return {
        from: iso(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })),
        to: iso(endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })),
      };
    case "year":
      return { from: iso(startOfYear(date)), to: iso(endOfYear(date)) };
    default:
      // month + agenda: pad by a week so the grid's spill-over days are filled.
      return {
        from: iso(addDays(startOfMonth(date), -7)),
        to: iso(addDays(endOfMonth(date), 7)),
      };
  }
}

/** Label under the month/year title, e.g. "12 Jan 2026 – 18 Jan 2026". */
export function rangeText(view: TCalendarView, date: Date): string {
  const fmt = (d: Date) => format(d, "d MMM yyyy");
  switch (view) {
    case "checkin":
    case "day":
      return fmt(date);
    case "week":
      return `${fmt(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }))} – ${fmt(
        endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }),
      )}`;
    case "year":
      return `${fmt(startOfYear(date))} – ${fmt(endOfYear(date))}`;
    default:
      return `${fmt(startOfMonth(date))} – ${fmt(endOfMonth(date))}`;
  }
}

/** Steps the anchor date by one unit of the active view. */
export function navigateDate(
  date: Date,
  view: TCalendarView,
  direction: "previous" | "next",
): Date {
  const next = direction === "next";
  switch (view) {
    case "checkin":
    case "day":
      return next ? addDays(date, 1) : subDays(date, 1);
    case "week":
      return next ? addWeeks(date, 1) : subWeeks(date, 1);
    case "year":
      return next ? addYears(date, 1) : subYears(date, 1);
    default:
      return next ? addMonths(date, 1) : subMonths(date, 1);
  }
}

/** Count shown in the header badge — how many appointments fall in the period
 * currently on screen. */
export function getEventsCount(
  events: ICalendarEvent[],
  date: Date,
  view: TCalendarView,
): number {
  const compare: Record<TCalendarView, (a: Date, b: Date) => boolean> = {
    checkin: isSameDay,
    day: isSameDay,
    week: (a, b) => isSameWeek(a, b, { weekStartsOn: WEEK_STARTS_ON }),
    month: isSameMonth,
    agenda: isSameMonth,
    year: isSameYear,
  };
  return events.filter((event) => compare[view](event.start, date)).length;
}

/**
 * Packs a day's appointments into columns so overlapping ones sit side by side.
 * Each group is a set of events that do not overlap each other, so the group
 * index becomes the column index.
 */
export function groupEvents(dayEvents: ICalendarEvent[]): ICalendarEvent[][] {
  const sorted = [...dayEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const groups: ICalendarEvent[][] = [];

  for (const event of sorted) {
    const group = groups.find(
      (candidate) => event.start >= candidate[candidate.length - 1].end,
    );
    if (group) group.push(event);
    else groups.push([event]);
  }

  return groups;
}

/** Absolute position of an event block inside a day column. */
export function getEventBlockStyle(
  event: ICalendarEvent,
  day: Date,
  groupIndex: number,
  groupSize: number,
) {
  const dayStart = startOfDay(day);
  const eventStart = event.start < dayStart ? dayStart : event.start;
  const startMinutes = differenceInMinutes(eventStart, dayStart);
  const width = 100 / groupSize;

  return {
    top: `${(startMinutes / MINUTES_PER_DAY) * 100}%`,
    width: `${width}%`,
    insetInlineStart: `${groupIndex * width}%`,
  };
}

/** The 7-column grid for a month, padded with the neighbouring months' days so
 * every row is full. Respects the Saturday week start used across the app. */
export function getCalendarCells(selectedDate: Date): ICalendarCell[] {
  const monthStart = startOfMonth(selectedDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  const daysInMonth = endOfMonth(selectedDate).getDate();
  const leading = Math.round(
    (monthStart.getTime() - gridStart.getTime()) / 86_400_000,
  );
  const total = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: total }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      day: date.getDate(),
      currentMonth: isSameMonth(date, selectedDate),
      date,
    };
  });
}

export const getEventsForDay = (
  events: ICalendarEvent[],
  date: Date,
): ICalendarEvent[] => events.filter((event) => isSameDay(event.start, date));

/** Weekday labels starting on Saturday, localised via date-fns. */
export const getWeekDays = (date: Date): Date[] => {
  const start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const getEventsForMonth = (
  events: ICalendarEvent[],
  date: Date,
): ICalendarEvent[] => events.filter((event) => isSameMonth(event.start, date));

export function formatTime(date: Date, use24HourFormat: boolean): string {
  if (!isValid(date)) return "";
  return format(date, use24HourFormat ? "HH:mm" : "h:mm a");
}

/** Initials for the avatar fallback on agenda rows. */
export const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
};

/** Soft-tinted block used for filled chips and agenda rows. */
export const getColorClass = (color: TEventColor): string =>
  ({
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    green:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
    orange:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    gray: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
  })[color];

/** Solid fill — avatar fallbacks and the legend swatches. */
export const getBgColor = (color: TEventColor): string =>
  ({
    blue: "bg-blue-600 dark:bg-blue-500",
    green: "bg-green-600 dark:bg-green-500",
    orange: "bg-orange-500 dark:bg-orange-400",
    red: "bg-red-600 dark:bg-red-500",
    gray: "bg-gray-500 dark:bg-gray-400",
  })[color];
