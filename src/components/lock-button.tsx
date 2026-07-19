import { useTranslation } from "react-i18next";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";
import { useUnlockStore } from "@/store/use-unlock-store";
import { isPasswordSet } from "@/lib/auth";

/**
 * Re-locks the manager sections on demand. Lives in the header rather than in
 * Settings so a manager can lock up from wherever they finished working.
 *
 * Renders nothing unless there is something to lock: no password configured, or
 * already locked.
 */
export function LockButton() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const unlocked = useUnlockStore((s) => s.unlocked);
  const lock = useUnlockStore((s) => s.lock);

  if (!isPasswordSet(settings) || !unlocked) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={lock}
      className="text-muted-foreground hover:text-foreground"
    >
      <LockKeyhole className="size-4" />
      <span className="hidden sm:inline">{t("auth.lock")}</span>
    </Button>
  );
}
