import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "@/db/notifications";
import { useSettings } from "@/hooks/use-settings";
import { useNotificationsStore } from "@/store/use-notifications-store";

/** All currently-active alerts (refreshed periodically). */
export function useNotifications() {
  const { data: settings } = useSettings();
  const warnDays = Number(settings?.expiry_warn_days) || 30;
  return useQuery({
    queryKey: ["notifications", warnDays],
    queryFn: () => listNotifications(warnDays),
    refetchInterval: 60_000,
  });
}

/** Active alerts split into unread (not dismissed) + the dismissed set, for the bell. */
export function useNotificationFeed() {
  const { data: all = [], isLoading } = useNotifications();
  const dismissed = useNotificationsStore((s) => s.dismissed);
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const unread = useMemo(
    () => all.filter((n) => !dismissedSet.has(n.id)),
    [all, dismissedSet],
  );
  return { all, unread, isLoading };
}
