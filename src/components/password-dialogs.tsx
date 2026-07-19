import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useUnlockStore } from "@/store/use-unlock-store";
import {
  MIN_PASSWORD_LENGTH,
  changePassword,
  clearPassword,
  createPassword,
  formatRecoveryCode,
  verifyPassword,
} from "@/lib/auth";
import { notifyError } from "@/lib/errors";

/** Shared field wrapper for the credential inputs. `dir="ltr"` because a
 *  password rendered right-to-left in Arabic is genuinely confusing to read. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        dir="ltr"
        type="password"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The recovery code, plus the acknowledgement that gates dismissal. Shared by
 *  first-time setup and "show a new recovery code". */
function RecoveryReveal({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [ack, setAck] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatRecoveryCode(code));
      toast.success(t("auth.recoveryCopied"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("auth.recoveryTitle")}</DialogTitle>
        <DialogDescription>{t("auth.recoveryDesc")}</DialogDescription>
      </DialogHeader>

      <div className="bg-muted rounded-lg py-6 text-center">
        <p dir="ltr" className="font-mono text-2xl font-semibold tracking-wider">
          {formatRecoveryCode(code)}
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={copy} className="w-full">
        <Copy className="size-4" /> {t("auth.recoveryCopy")}
      </Button>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="recovery_ack"
          checked={ack}
          onCheckedChange={(c) => setAck(c === true)}
          className="mt-0.5"
        />
        <Label htmlFor="recovery_ack" className="text-sm leading-snug">
          {t("auth.recoveryConfirm")}
        </Label>
      </div>

      <DialogFooter>
        <Button disabled={!ack} onClick={onDone}>
          {t("common.close")}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * First-time setup: new password, typed twice, then the recovery code revealed
 * once. The reveal step cannot be dismissed by Escape, an outside click or the
 * X — once it closes the code is gone for good.
 */
export function PasswordCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const unlock = useUnlockStore((s) => s.unlock);

  const [step, setStep] = useState<"set" | "reveal">("set");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset on the way out rather than in an effect on `open`: the fields are
  // always clean by the next open, and nothing re-renders twice to get there.
  function close() {
    setStep("set");
    setPw("");
    setConfirm("");
    setCode("");
    setError("");
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (pw !== confirm) {
      setError(t("auth.mismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const generated = await createPassword(pw);
      // The password is now live. Flip the unlock flag BEFORE the settings query
      // refreshes: the moment isPasswordSet() goes true, the route gate would
      // otherwise replace the Settings page — and this dialog with it — while
      // the only copy of the recovery code is still on screen.
      unlock();
      setCode(generated);
      setStep("reveal");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    close();
    toast.success(t("auth.passwordSet"));
  }

  const revealing = step === "reveal";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !revealing && close()}>
      <DialogContent
        showCloseButton={!revealing}
        onEscapeKeyDown={(e) => revealing && e.preventDefault()}
        onInteractOutside={(e) => revealing && e.preventDefault()}
        className="space-y-2"
      >
        {revealing ? (
          <RecoveryReveal code={code} onDone={finish} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("auth.setPassword")}</DialogTitle>
              <DialogDescription>{t("auth.hint")}</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <PasswordField
                id="create_pw"
                label={t("auth.newPassword")}
                value={pw}
                onChange={setPw}
                autoFocus
              />
              <PasswordField
                id="create_confirm"
                label={t("auth.confirmPassword")}
                value={confirm}
                onChange={setConfirm}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Standalone reveal, for "show a new recovery code" on an existing password. */
export function RecoveryRevealDialog({
  open,
  code,
  onOpenChange,
}: {
  open: boolean;
  code: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="space-y-2"
      >
        <RecoveryReveal code={code} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Change: current password first, then the new one typed twice. */
export function PasswordChangeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setCurrent("");
    setPw("");
    setConfirm("");
    setError("");
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!current.trim()) {
      setError(t("auth.currentRequired"));
      return;
    }
    if (pw.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (pw !== confirm) {
      setError(t("auth.mismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!(await changePassword(current, pw))) {
        // Wrong current password: clear only that field and stay open, so the
        // new password the user already typed twice is not thrown away.
        setError(t("auth.wrongPassword"));
        setCurrent("");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("auth.passwordChanged"));
      close();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.changePassword")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <PasswordField
            id="chg_current"
            label={t("auth.currentPassword")}
            value={current}
            onChange={setCurrent}
            autoFocus
          />
          <PasswordField
            id="chg_new"
            label={t("auth.newPassword")}
            value={pw}
            onChange={setPw}
          />
          <PasswordField
            id="chg_confirm"
            label={t("auth.confirmPassword")}
            value={confirm}
            onChange={setConfirm}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Removal: the current password, plus a plain warning about what is lost. */
export function PasswordRemoveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setCurrent("");
    setError("");
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!current.trim()) {
      setError(t("auth.currentRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPassword(current))) {
        setError(t("auth.wrongPassword"));
        setCurrent("");
        return;
      }
      await clearPassword();
      // Deliberately NOT calling lock() here. The settings query still holds the
      // old hash for the moment between this write and the refetch below, so
      // clearing the unlock flag first would make the gate see "password set,
      // not unlocked" and throw up the lock screen — unmounting the Settings
      // page and this dialog mid-flow. Leaving the flag set is harmless anyway:
      // with no password, isPasswordSet() is false, so the gate is transparent
      // and the Lock button hides itself regardless.
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("auth.passwordRemoved"));
      close();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.removePassword")}</DialogTitle>
          <DialogDescription>
            {t("auth.removePasswordConfirm")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <PasswordField
            id="rm_current"
            label={t("auth.currentPassword")}
            value={current}
            onChange={setCurrent}
            autoFocus
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <Spinner />}
              {t("auth.removePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
