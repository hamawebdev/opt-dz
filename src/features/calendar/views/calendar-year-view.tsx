import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, getYear, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { EventsListDialog } from "@/features/calendar/dialogs/events-list-dialog";
import {
  getBgColor,
  getCalendarCells,
  getEventsForDay,
  getWeekDays,
} from "@/features/calendar/helpers";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

/** Twelve-month overview: how busy the year is at a glance. Clicking a month
 * name drops into that month; clicking a day with work opens its list. */
export function CalendarYearView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const { selectedDate, setSelectedDate, setView } = useCalendar();
  const [listFor, setListFor] = useState<Date | null>(null);

  const year = getYear(selectedDate);
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const listEvents = listFor ? getEventsForDay(events, listFor) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => {
          const cells = getCalendarCells(month);
          const weekDays = getWeekDays(month);

          return (
            <div
              key={month.toISOString()}
              className="flex flex-col overflow-hidden rounded-lg border"
            >
              <button
                type="button"
                className="hover:bg-accent px-3 py-2 text-center text-sm font-semibold transition-colors"
                onClick={() => {
                  setSelectedDate(month);
                  setView("month");
                }}
              >
                {format(month, "MMMM")}
              </button>

              <div className="text-muted-foreground grid grid-cols-7 py-1 text-center text-[0.6rem]">
                {weekDays.map((day) => (
                  <span key={day.toISOString()}>{format(day, "EEEEE")}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 p-1.5 text-xs">
                {cells.map((cell) => {
                  const dayEvents = cell.currentMonth
                    ? getEventsForDay(events, cell.date)
                    : [];
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <button
                      key={cell.date.toISOString()}
                      type="button"
                      disabled={!hasEvents}
                      onClick={() => setListFor(cell.date)}
                      aria-label={
                        hasEvents
                          ? t("calendar.dayWithCount", {
                              date: format(cell.date, "d MMM"),
                              n: dayEvents.length,
                            })
                          : undefined
                      }
                      className={cn(
                        "flex min-h-8 flex-col items-center gap-0.5 rounded-md p-0.5",
                        !cell.currentMonth && "text-muted-foreground/40",
                        hasEvents && "hover:bg-accent cursor-pointer",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center font-medium",
                          isToday(cell.date) &&
                            cell.currentMonth &&
                            "bg-primary text-primary-foreground rounded-full",
                        )}
                      >
                        {cell.day}
                      </span>
                      {hasEvents && (
                        <span className="flex items-center gap-0.5">
                          {dayEvents.length <= 2 ? (
                            dayEvents.map((event) => (
                              <span
                                key={event.id}
                                className={cn(
                                  "size-1.5 rounded-full",
                                  getBgColor(event.color),
                                )}
                              />
                            ))
                          ) : (
                            <span className="text-[0.6rem] font-semibold">
                              {dayEvents.length}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <EventsListDialog
        date={listFor}
        events={listEvents}
        onOpenChange={(open) => !open && setListFor(null)}
      />
    </>
  );
}
