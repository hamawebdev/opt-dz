export type ExpiryStatus = "expired" | "soon" | "ok";

/** Whole days from today (local) until `isoDate` (negative = already past). */
export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Buckets an expiry date relative to a configurable "expiring soon" window. */
export function expiryStatus(isoDate: string, warnDays: number): ExpiryStatus {
  const d = daysUntil(isoDate);
  if (d < 0) return "expired";
  if (d <= warnDays) return "soon";
  return "ok";
}
