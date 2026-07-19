import type { AppointmentRow, AppointmentStatus } from "@/types";
import type { TEventColor } from "@/features/calendar/types";

/**
 * A single appointment in the shape the calendar views want: absolute start/end
 * `Date`s instead of the `'YYYY-MM-DD HH:MM'` + `duration_min` pair stored in
 * SQLite, plus a colour derived from the status.
 *
 * `row` keeps the untouched database record so dialogs can hand it straight to
 * the existing appointment/prescription flows without a second lookup.
 */
export interface ICalendarEvent {
  id: number;
  start: Date;
  end: Date;
  /** Patient name — what staff actually read on a chip. */
  title: string;
  color: TEventColor;
  status: AppointmentStatus;
  optometrist: string | null;
  reason: string | null;
  row: AppointmentRow;
}

/** One square in a month grid. Days spilling in from the neighbouring months
 * have `currentMonth: false` and are drawn dimmed. */
export interface ICalendarCell {
  day: number;
  currentMonth: boolean;
  date: Date;
}
