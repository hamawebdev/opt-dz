import { toast } from "sonner";

/**
 * Surfaces a failure to the user as a short, plain-language message while
 * preserving the technical detail in the console for developers/support.
 *
 * Low-literacy users should never see a raw exception string (see UX review,
 * error handling). Call sites pass an already-translated `userMessage`, e.g.
 * `notifyError(err, t("problem.saveFailed"))`.
 */
export function notifyError(error: unknown, userMessage: string): void {
  // Keep the real error for diagnosis; never show it to the user.
  console.error(error);
  toast.error(userMessage);
}
