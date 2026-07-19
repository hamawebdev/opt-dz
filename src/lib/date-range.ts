import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import { todayISO } from "@/lib/format";

/** Week starts on Saturday — Algeria convention, same as the appointments page. */
export const WEEK_STARTS_ON = 6 as const;

export type ReportPreset = "today" | "yesterday" | "week" | "month" | "custom";

/** Inclusive local-day range; both ends are local `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * Range for a named preset. Week/month ranges end at *today* (not the future
 * end of the period) so the visible label never implies data that can't exist.
 */
export function presetRange(
  preset: Exclude<ReportPreset, "custom">,
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case "today": {
      const d = todayISO(now);
      return { from: d, to: d };
    }
    case "yesterday": {
      const d = todayISO(subDays(now, 1));
      return { from: d, to: d };
    }
    case "week":
      return {
        from: todayISO(startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON })),
        to: todayISO(now),
      };
    case "month":
      return {
        from: todayISO(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: todayISO(now),
      };
  }
}

// parseISO on a date-only string gives local midnight, unlike new Date("YYYY-MM-DD")
// which is UTC midnight and shifts the calendar day for UTC+ offsets.

/** Human-readable label for a range, e.g. "Sat 13 Jul – Fri 18 Jul 2026". */
export function formatRangeLabel(range: DateRange): string {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  if (range.from === range.to) return format(from, "EEE dd MMM yyyy");
  if (from.getFullYear() === to.getFullYear())
    return `${format(from, "EEE dd MMM")} – ${format(to, "EEE dd MMM yyyy")}`;
  return `${format(from, "EEE dd MMM yyyy")} – ${format(to, "EEE dd MMM yyyy")}`;
}

/** Inclusive number of local days in the range (minimum 1). */
export function rangeDayCount(range: DateRange): number {
  return Math.max(
    1,
    differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1,
  );
}

export type BucketUnit = "day" | "week" | "month";

/** One chart bar: an inclusive sub-range plus its axis label. */
export interface ChartBucket {
  from: string;
  to: string;
  label: string;
}

/**
 * Splits a range into chart buckets: daily up to a month, weekly (Saturday-start)
 * up to ~4 months, monthly beyond. First/last buckets are clipped to the range.
 */
export function buildBuckets(range: DateRange): {
  unit: BucketUnit;
  buckets: ChartBucket[];
} {
  const interval = { start: parseISO(range.from), end: parseISO(range.to) };
  const days = rangeDayCount(range);

  if (days <= 31) {
    const labelFmt = days <= 7 ? "EEE dd" : "dd MMM";
    return {
      unit: "day",
      buckets: eachDayOfInterval(interval).map((d) => {
        const key = todayISO(d);
        return { from: key, to: key, label: format(d, labelFmt) };
      }),
    };
  }

  if (days <= 120) {
    return {
      unit: "week",
      buckets: eachWeekOfInterval(interval, {
        weekStartsOn: WEEK_STARTS_ON,
      }).map((start) => {
        const end = endOfWeek(start, { weekStartsOn: WEEK_STARTS_ON });
        const from = start < interval.start ? range.from : todayISO(start);
        const to = end > interval.end ? range.to : todayISO(end);
        return { from, to, label: format(parseISO(from), "dd MMM") };
      }),
    };
  }

  return {
    unit: "month",
    buckets: eachMonthOfInterval(interval).map((start) => {
      const end = endOfMonth(start);
      const from = start < interval.start ? range.from : todayISO(start);
      const to = end > interval.end ? range.to : todayISO(end);
      return { from, to, label: format(start, "MMM yyyy") };
    }),
  };
}
