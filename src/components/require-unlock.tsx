import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, LockKeyhole } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { useSettings } from "@/hooks/use-settings";
import { useUnlockStore } from "@/store/use-unlock-store";
import {
  clearPassword,
  isPasswordSet,
  verifyPassword,
  verifyRecoveryCode,
} from "@/lib/auth";
import { notifyError } from "@/lib/errors";

/**
 * Route gate for the manager sections (inventory, reports, settings).
 *
 * Used as a pathless layout route, so the prompt renders *in place* inside the
 * app shell: the URL never changes, a deep link survives the unlock, and the
 * hash router's back/forward stack is untouched. Redirecting instead would
 * rewrite history and strand the Back button.
 *
 * The gate is opt-in — with no password configured it is completely transparent.
 */
export function RequireUnlock() {
  const { data: settings, isPending, isError, refetch } = useSettings();
  const unlocked = useUnlockStore((s) => s.unlocked);

  // Never guess while the query is in flight. Rendering the outlet for one frame
  // would mount the protected page and fire its queries; rendering the prompt
  // would flash a lock screen at every shop that has no password at all.
  if (isPending) return <UnlockSkeleton />;
  // Fail closed but recoverable: a settings read that failed must not open the
  // gate, and React Query has already retried by the time we land here.
  if (isError)
    return (
      <ErrorState onRetry={() => void refetch()} className="mx-auto max-w-md" />
    );
  if (!isPasswordSet(settings)) return <Outlet />;
  if (unlocked) return <Outlet />;
  return <UnlockPrompt />;
}

function UnlockSkeleton() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <Skeleton className="mx-auto size-12 rounded-full" />
      <Skeleton className="mx-auto h-5 w-40" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/** The locked screen. Rendered inside the shell so the sidebar and header stay
 *  reachable — a user who lands here by accident can navigate away instead of
 *  being trapped on a dead end. */
function UnlockPrompt() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unlock = useUnlockStore((s) => s.unlock);

  const [mode, setMode] = useState<"password" | "recovery">("password");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: "password" | "recovery") {
    setMode(next);
    setValue("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "password") {
        if (await verifyPassword(value)) {
          unlock();
          return;
        }
        // Unlimited retries, no lockout: this guards against a curious cashier,
        // and stranding a manager mid-shift would cost more than it protects.
        setError(t("auth.wrongPassword"));
        setValue("");
      } else {
        if (await verifyRecoveryCode(value)) {
          // unlock() BEFORE clearing. The user is about to land on Settings to
          // set a new password, and without this flag they would be ejected the
          // instant that new password lands.
          unlock();
          await clearPassword();
          await qc.invalidateQueries({ queryKey: ["settings"] });
          toast.success(t("auth.recoveryUsed"));
          navigate("/settings");
          return;
        }
        setError(t("auth.recoveryWrong"));
        setValue("");
      }
    } catch (err) {
      notifyError(err, t("auth.unlockFailed"));
    } finally {
      setBusy(false);
    }
  }

  const recovery = mode === "recovery";

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="items-center text-center">
        <div className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full">
          {recovery ? (
            <KeyRound className="size-5" />
          ) : (
            <LockKeyhole className="size-5" />
          )}
        </div>
        <CardTitle className="mt-3">
          {recovery ? t("auth.recoveryEnter") : t("auth.managerArea")}
        </CardTitle>
        <CardDescription>
          {recovery ? t("auth.recoveryHint") : t("auth.lockedDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="unlock_value">
              {recovery ? t("auth.recoveryCode") : t("auth.password")}
            </Label>
            <Input
              id="unlock_value"
              // Credentials read left-to-right even in Arabic: an RTL field
              // renders a password or a digit run in a genuinely confusing order.
              dir="ltr"
              type={recovery ? "text" : "password"}
              inputMode={recovery ? "numeric" : undefined}
              autoComplete="off"
              autoFocus
              placeholder={recovery ? "1234-5678-9012-3456" : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError("");
              }}
              aria-invalid={!!error}
            />
            {/* Inline, not a toast: a wrong password is field-level feedback
                that belongs next to the field it describes. */}
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !value.trim()}
          >
            {busy && <Spinner />}
            {t("auth.unlock")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full"
            onClick={() => switchMode(recovery ? "password" : "recovery")}
          >
            {recovery ? t("auth.usePassword") : t("auth.forgotPassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
