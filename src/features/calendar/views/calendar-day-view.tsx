import { useTranslation } from "react-i18next";
import { format, isWithinInterval } from "date-fns";
import { Clock, User } from "lucide-react";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { formatTime, getEventsForDay } from "@/features/calendar/helpers";
import { MiniMonth } from "@/features/calendar/views/mini-month";
import { TimeGrid } from "@/features/calendar/views/time-grid";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

export function CalendarDayView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const { selectedDate, use24HourFormat, openDetails } = useCalendar();

  const now = new Date();
  const happeningNow = getEventsForDay(events, now).filter(
    (event) =>
      event.status !== "cancelled" &&
      isWithinInterval(now, { start: event.start, end: event.end }),
  );

  return (
    <div className="flex">
      <div className="min-w-0 flex-1">
        <TimeGrid days={[selectedDate]} events={events} className="h-[720px]" />
      </div>

      <aside className="hidden w-72 shrink-0 divide-y border-s md:block">
        {/* Remounting on a month change resets the picker's own browsing, so
            stepping the day past the month end brings the sidebar along. */}
        <MiniMonth key={format(selectedDate, "yyyy-MM")} />

        <div>
          {happeningNow.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-4 pt-4">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-green-600" />
                </span>
                <p className="text-sm font-semibold">
                  {t("calendar.happeningNow")}
                </p>
              </div>

              <div className="space-y-4 p-4">
                {happeningNow.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openDetails(event)}
                    className="hover:bg-muted w-full space-y-1.5 rounded-md p-2 text-start"
                  >
                    <p className="line-clamp-2 text-sm font-semibold">
                      {event.title}
                    </p>
                    {event.optometrist && (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <User className="size-4" />
                        {event.optometrist}
                      </span>
                    )}
                    <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <Clock className="size-4" />
                      {formatTime(event.start, use24HourFormat)} –{" "}
                      {formatTime(event.end, use24HourFormat)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground p-4 text-center text-sm">
              {t("calendar.nothingRightNow")}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
