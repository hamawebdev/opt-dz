/** The calendar surfaces the appointment book in six shapes. `checkin` is the
 * today-only worklist that replaced the old page's check-in tab. */
export type TCalendarView =
  | "checkin"
  | "agenda"
  | "day"
  | "week"
  | "month"
  | "year";

/** Palette used by the ported calendar chrome. Appointments never pick a colour
 * directly — it is derived from their status (see `statusColor`). */
export type TEventColor = "blue" | "green" | "gray" | "red" | "orange";

/** How an event chip is drawn: a filled colour block, or a neutral block with a
 * coloured dot. Persisted in calendar settings. */
export type TBadgeVariant = "dot" | "colored";
