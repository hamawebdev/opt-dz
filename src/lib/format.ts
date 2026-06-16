import { format, parseISO } from "date-fns";

/** Default currency symbol; overridden by the shop settings at call sites. */
export const DEFAULT_CURRENCY = "DA";

/**
 * Formats an amount given in **integer centimes** as Algerian Dinar with thousands
 * separators. DZD is conventionally shown without decimals, but we keep up to 2 when
 * the amount isn't a whole dinar. Centimes are the canonical money unit across the
 * app — every stored/computed money value is an integer centime count (see types.ts).
 */
export function formatDZD(centimes: number | null | undefined, symbol = DEFAULT_CURRENCY): string {
  const value = Number(centimes ?? 0) / 100;
  const hasFraction = Math.abs(value % 1) > 0.0001;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
  return `${formatted} ${symbol}`;
}

/** Converts a user-entered dinar value (string or number) to integer centimes. */
export function toCentimes(dinar: string | number | null | undefined): number {
  const v = Number(dinar ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

/** Converts integer centimes back to a dinar number for editing in form inputs. */
export function fromCentimes(centimes: number | null | undefined): number {
  const v = Number(centimes ?? 0);
  return Number.isFinite(v) ? v / 100 : 0;
}

/** Parses an ISO/SQLite datetime string safely; returns null on failure. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // SQLite "YYYY-MM-DD HH:MM:SS" -> ISO-ish; date-fns parseISO needs a 'T'.
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Human date, e.g. "13 Jun 2026". */
export function formatDate(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy") : "—";
}

/** Human date + time, e.g. "13 Jun 2026, 14:05". */
export function formatDateTime(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy, HH:mm") : "—";
}

/**
 * Formats a dioptric value with an explicit sign and 2 decimals (e.g. +1.25, -0.50).
 * Used for sphere/cylinder/addition on prescriptions.
 */
export function formatDiopter(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(2)}`;
}

/** Formats axis (whole degrees) and PD (mm) without forced sign. */
export function formatPlain(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value)}${suffix}`;
}
