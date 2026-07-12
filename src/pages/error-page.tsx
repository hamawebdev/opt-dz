import { useEffect, useState } from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Compass, Copy } from "lucide-react";
import { error as logError } from "@tauri-apps/plugin-log";
import { describeError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

/**
 * Full-screen fallback for the router's `errorElement`. A thrown render error
 * previously left a blank white window; this gives the user a readable message
 * and two ways out (reload, or back to the dashboard). Self-contained — it
 * renders without the app chrome because the error may come from the layout.
 *
 * The technical detail is never shown on screen (low-literacy users; UX review):
 * it goes to the log file, and a "copy details" button puts it on the clipboard
 * so staff can pass it to support.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const detail = notFound ? undefined : describeError(error);

  // Persist the crash detail for support, even if the user just restarts.
  useEffect(() => {
    if (detail) {
      console.error(error);
      void logError(`render crash :: ${detail}`).catch(() => {});
    }
  }, [detail, error]);

  return (
    <ErrorScreen variant={notFound ? "notFound" : "boundary"} detail={detail} />
  );
}

/** Catch-all `*` route target. */
export function NotFoundPage() {
  return <ErrorScreen variant="notFound" />;
}

function ErrorScreen({
  variant,
  detail,
}: {
  variant: "boundary" | "notFound";
  detail?: string;
}) {
  const { t } = useTranslation();
  const isNotFound = variant === "notFound";
  // Toasts don't render here (the Toaster lives in the crashed layout tree), so
  // the copy button confirms inline by flipping its own label.
  const [copied, setCopied] = useState(false);

  async function copyDetails() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
    } catch {
      /* clipboard unavailable — the detail is already in the log file */
    }
  }

  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div
        className={
          "flex size-14 items-center justify-center rounded-2xl ring-1 " +
          (isNotFound
            ? "bg-primary/10 text-primary ring-primary/15"
            : "bg-destructive/10 text-destructive ring-destructive/20")
        }
      >
        {isNotFound ? (
          <Compass className="size-7" />
        ) : (
          <AlertTriangle className="size-7" />
        )}
      </div>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {t(isNotFound ? "errors.notFoundTitle" : "errors.boundaryTitle")}
        </h1>
        <p className="text-muted-foreground text-sm/relaxed text-balance">
          {t(
            isNotFound
              ? "errors.notFoundDescription"
              : "errors.boundaryDescription",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!isNotFound && (
          <Button variant="outline" onClick={() => location.reload()}>
            {t("errors.reload")}
          </Button>
        )}
        {/* Hash-router home; avoids importing router state into this self-contained screen. */}
        <Button asChild>
          <a href="#/">{t("errors.goHome")}</a>
        </Button>
        {detail && (
          <Button variant="ghost" onClick={copyDetails}>
            {copied ? (
              <Check className="me-1 size-4" />
            ) : (
              <Copy className="me-1 size-4" />
            )}
            {t(copied ? "errors.detailsCopied" : "errors.copyDetails")}
          </Button>
        )}
      </div>
    </main>
  );
}
