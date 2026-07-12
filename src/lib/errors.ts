import { toast } from "sonner";
import { error as logError } from "@tauri-apps/plugin-log";

/** Renders any thrown value into a readable line for logs (Error, string, or object). */
export function describeError(error: unknown): string {
  if (error instanceof Error)
    return error.stack ?? `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** True for SQLite's transient contention error ("database is locked", SQLITE_BUSY).
 * Callers show a calmer "the app is busy, try again" message for these. */
export function isDatabaseBusy(error: unknown): boolean {
  return /database( table)? is locked|SQLITE_BUSY/i.test(describeError(error));
}

/**
 * Surfaces a failure to the user as a short, plain-language message while
 * preserving the technical detail for developers/support.
 *
 * Low-literacy users should never see a raw exception string (see UX review,
 * error handling). Call sites pass an already-translated `userMessage`, e.g.
 * `notifyError(err, t("problem.saveFailed"))`.
 *
 * The real error is written both to the devtools console and, via the Tauri log
 * plugin, to the app's log file so failures can be diagnosed without devtools.
 */
export function notifyError(error: unknown, userMessage: string): void {
  // Keep the real error for diagnosis; never show it to the user.
  const detail = describeError(error);
  console.error(error);
  // Fire-and-forget: persisting the detail must never itself surface to the user.
  void logError(`${userMessage} :: ${detail}`).catch(() => {});
  // Keyed by message so the global React Query fallback and a local handler
  // reporting the same failure collapse into one toast instead of stacking.
  toast.error(userMessage, { id: `err:${userMessage}` });
}
