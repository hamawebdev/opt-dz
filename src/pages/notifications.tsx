import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  PackageX,
  CalendarClock,
  Check,
  RotateCcw,
  Bell,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotificationFeed } from "@/hooks/use-notifications";
import { useNotificationsStore } from "@/store/use-notifications-store";
import type { AppNotification, NotificationKind } from "@/db/notifications";

const ICON: Record<NotificationKind, typeof Bell> = {
  out_of_stock: PackageX,
  low_stock: AlertTriangle,
  expired: CalendarClock,
  expiring_soon: CalendarClock,
};

function notifLink(n: AppNotification): string {
  return n.kind === "expired" || n.kind === "expiring_soon"
    ? "/tracking"
    : `/inventory/${n.productId}/edit`;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { all } = useNotificationFeed();
  const dismissed = useNotificationsStore((s) => s.dismissed);
  const dismissedSet = new Set(dismissed);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const restoreAll = useNotificationsStore((s) => s.restoreAll);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("nav.notifications")}</h2>
        {dismissed.length > 0 && (
          <Button variant="outline" size="sm" onClick={restoreAll}>
            <RotateCcw className="size-4" /> {t("notifications.restoreAll")}
          </Button>
        )}
      </div>

      {!all.length ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {t("notifications.empty")}
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {all.map((n) => {
            const Icon = ICON[n.kind];
            const isRead = dismissedSet.has(n.id);
            return (
              <div
                key={n.id}
                className={
                  "flex items-center gap-3 px-4 py-3 " +
                  (isRead ? "opacity-50" : "")
                }
              >
                <Icon
                  className={
                    "size-4 shrink-0 " +
                    (n.severity === "error"
                      ? "text-destructive"
                      : "text-warning")
                  }
                />
                <Link
                  to={notifLink(n)}
                  className="flex-1 text-sm hover:underline"
                >
                  {t(`notifications.${n.kind}`, {
                    name: n.productName,
                    meta: n.meta,
                  })}
                </Link>
                {isRead ? (
                  <Badge variant="outline">{t("notifications.read")}</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("notifications.markRead")}
                    onClick={() => dismiss(n.id)}
                  >
                    <Check className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
