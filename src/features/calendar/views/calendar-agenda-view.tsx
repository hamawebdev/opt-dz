import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import {
  formatTime,
  getBgColor,
  getColorClass,
  getEventsForMonth,
  getInitials,
  STATUS_ORDER,
} from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";
import type { ICalendarEvent } from "@/features/calendar/interfaces";
import type { AppointmentStatus } from "@/types";

/** Searchable month-at-a-time list, grouped by day or by status. */
export function CalendarAgendaView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const {
    selectedDate,
    use24HourFormat,
    badgeVariant,
    agendaGroupBy,
    openDetails,
  } = useCalendar();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const monthEvents = getEventsForMonth(events, selectedDate);
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? monthEvents.filter((event) =>
          [event.title, event.reason, event.optometrist, event.row.patient_code]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(needle)),
        )
      : monthEvents;

    // Group into a Map to keep insertion order predictable.
    const byKey = new Map<string, ICalendarEvent[]>();
    for (const event of [...matching].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    )) {
      const key =
        agendaGroupBy === "date"
          ? format(event.start, "yyyy-MM-dd")
          : event.status;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(event);
      else byKey.set(key, [event]);
    }

    const entries = [...byKey.entries()];
    if (agendaGroupBy === "status") {
      // Show statuses in lifecycle order rather than first-seen order.
      entries.sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a[0] as AppointmentStatus) -
          STATUS_ORDER.indexOf(b[0] as AppointmentStatus),
      );
    }
    return entries;
  }, [events, selectedDate, query, agendaGroupBy]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("calendar.searchAppointments")}
          className="ps-9"
        />
      </div>

      {groups.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t("appointments.none")}
        </p>
      )}

      {groups.map(([key, groupEvents]) => (
        <section key={key} className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {agendaGroupBy === "date"
              ? format(groupEvents[0].start, "EEEE d MMMM yyyy")
              : t(`appointments.status_${key as AppointmentStatus}`)}
          </h3>

          {groupEvents.map((event) => {
            const Icon = STATUS_META[event.status].icon;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => openDetails(event)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-3 text-start transition-colors",
                  badgeVariant === "colored"
                    ? cn(getColorClass(event.color), "hover:opacity-80")
                    : "hover:bg-accent",
                  event.status === "cancelled" && "opacity-70",
                )}
              >
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback
                    className={cn(
                      getBgColor(event.color),
                      "text-xs text-white",
                    )}
                  >
                    {getInitials(event.title)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-medium",
                      event.status === "cancelled" && "line-through",
                    )}
                  >
                    {event.title}
                  </p>
                  <p className="truncate text-sm opacity-80">
                    {[event.reason, event.optometrist]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>

                <div className="shrink-0 text-end text-sm">
                  <p className="font-medium">
                    {formatTime(event.start, use24HourFormat)}
                  </p>
                  <p className="flex items-center justify-end gap-1 text-xs opacity-80">
                    <Icon className="size-3.5" />
                    {t(`appointments.status_${event.status}`)}
                  </p>
                </div>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
