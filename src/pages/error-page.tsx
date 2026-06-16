import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Full-screen fallback for the router's `errorElement`. A thrown render error
 * previously left a blank white window; this gives the user a readable message
 * and two ways out (reload, or back to the dashboard). Self-contained — it
 * renders without the app chrome because the error may come from the layout.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <ErrorScreen
      variant={notFound ? "notFound" : "boundary"}
      detail={
        !notFound && error instanceof Error ? error.message : undefined
      }
    />
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

      {detail && (
        <pre className="bg-muted text-muted-foreground max-w-md overflow-x-auto rounded-lg px-3 py-2 text-start text-xs">
          {detail}
        </pre>
      )}

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
      </div>
    </main>
  );
}
