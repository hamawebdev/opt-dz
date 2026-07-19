import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, LockKeyhole, Pencil, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PasswordChangeDialog,
  PasswordCreateDialog,
  PasswordRemoveDialog,
  RecoveryRevealDialog,
} from "@/components/password-dialogs";
import { isPasswordSet, regenerateRecoveryCode } from "@/lib/auth";
import { notifyError } from "@/lib/errors";
import type { ShopSettings } from "@/types";

/**
 * The shop-password control.
 *
 * Rendered outside the "Show advanced" fold for a bootstrapping reason: this is
 * the gate for that fold. Behind it, a shop running in simple mode could never
 * discover that the password exists.
 */
export function ManagerPasswordSection({
  settings,
}: {
  settings: ShopSettings;
}) {
  const { t } = useTranslation();
  const passwordSet = isPasswordSet(settings);

  const [createOpen, setCreateOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [newCode, setNewCode] = useState("");

  async function regenerate() {
    try {
      setNewCode(await regenerateRecoveryCode());
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="size-4" />
          {t("auth.shopPassword")}
          <Badge variant={passwordSet ? "default" : "secondary"}>
            {passwordSet ? t("auth.on") : t("auth.off")}
          </Badge>
        </CardTitle>
        <CardDescription>{t("auth.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {passwordSet ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setChangeOpen(true)}>
              <Pencil className="size-4" /> {t("auth.changePassword")}
            </Button>
            <Button variant="outline" onClick={regenerate}>
              <KeyRound className="size-4" /> {t("auth.recoveryNew")}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 className="size-4" /> {t("auth.removePassword")}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setCreateOpen(true)}>
            {t("auth.setPassword")}
          </Button>
        )}
      </CardContent>

      <PasswordCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PasswordChangeDialog open={changeOpen} onOpenChange={setChangeOpen} />
      <PasswordRemoveDialog open={removeOpen} onOpenChange={setRemoveOpen} />
      <RecoveryRevealDialog
        open={!!newCode}
        code={newCode}
        onOpenChange={() => {
          setNewCode("");
          toast.success(t("auth.recoveryReplaced"));
        }}
      />
    </Card>
  );
}
