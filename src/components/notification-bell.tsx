import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  AlertTriangle,
  PackageX,
  CalendarClock,
  CheckCheck,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotificationFeed } from "@/hooks/use-notifications";
import { useNotificationsStore } from "@/store/use-notifications-store";
import { notificationLink, type NotificationKind } from "@/db/notifications";

const ICON: Record<NotificationKind, typeof Bell> = {
  out_of_stock: PackageX,
  low_stock: AlertTriangle,
  expired: CalendarClock,
  expiring_soon: CalendarClock,
  job_overdue: CalendarClock,
  job_ready: PackageCheck,
};

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { unread } = useNotificationFeed();
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const dismissMany = useNotificationsStore((s) => s.dismissMany);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          <span className="relative">
            <Bell className="size-5" />
            {unread.length > 0 && (
              <span className="bg-destructive text-destructive-foreground absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                {unread.length > 9 ? "9+" : unread.length}
              </span>
            )}
          </span>
          {t("nav.notifications")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">
            {t("nav.notifications")}
          </span>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => dismissMany(unread.map((n) => n.id))}
            >
              <CheckCheck className="size-3.5" />{" "}
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {!unread.length ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              {t("notifications.empty")}
            </p>
          ) : (
            unread.slice(0, 8).map((n) => {
              const Icon = ICON[n.kind];
              return (
                <Link
                  key={n.id}
                  to={notificationLink(n)}
                  onClick={() => {
                    dismiss(n.id);
                    setOpen(false);
                  }}
                  className="hover:bg-accent flex items-start gap-2.5 border-b px-3 py-2.5 last:border-0"
                >
                  <Icon
                    className={
                      "mt-0.5 size-4 shrink-0 " +
                      (n.severity === "error"
                        ? "text-destructive"
                        : "text-warning")
                    }
                  />
                  <span className="text-sm">
                    {t(`notifications.${n.kind}`, {
                      name: n.name || t("sales.walkIn"),
                      meta: n.meta,
                    })}
                  </span>
                </Link>
              );
            })
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link to="/notifications">{t("notifications.viewAll")}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
