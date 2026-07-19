import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isToday } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { DroppableArea } from "@/features/calendar/dnd/droppable-area";
import { EventsListDialog } from "@/features/calendar/dialogs/events-list-dialog";
import {
  getCalendarCells,
  getEventsForDay,
  getWeekDays,
} from "@/features/calendar/helpers";
import { MonthEventChip } from "@/features/calendar/views/event-chip";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

const MAX_VISIBLE = 3;

export function CalendarMonthView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const { selectedDate, openNew } = useCalendar();
  const [listFor, setListFor] = useState<Date | null>(null);

  const cells = useMemo(
    () => getCalendarCells(selectedDate),
    [selectedDate],
  );
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  const listEvents = listFor ? getEventsForDay(events, listFor) : [];

  return (
    <>
      <div className="grid grid-cols-7 border-b">
        {weekDays.map((day) => (
          <span
            key={day.toISOString()}
            className="text-muted-foreground py-2 text-center text-xs font-medium"
          >
            {format(day, "EEE")}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = getEventsForDay(events, cell.date);
          const hidden = dayEvents.length - MAX_VISIBLE;

          return (
            <DroppableArea
              key={cell.date.toISOString()}
              date={cell.date}
              className="group flex min-h-32 flex-col border-b border-s first:border-s-0 [&:nth-child(7n+1)]:border-s-0"
            >
              <div className="flex items-center justify-between px-1.5 pt-1.5">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    !cell.currentMonth && "opacity-40",
                    isToday(cell.date) &&
                      "bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full",
                  )}
                >
                  {cell.day}
                </span>
                <button
                  type="button"
                  aria-label={t("appointments.newOn", {
                    date: format(cell.date, "EEE d MMM"),
                  })}
                  onClick={() =>
                    openNew(`${format(cell.date, "yyyy-MM-dd")} 09:00`)
                  }
                  className="hover:bg-accent rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>

              <div
                className={cn(
                  "flex flex-col gap-1 p-1",
                  !cell.currentMonth && "opacity-50",
                )}
              >
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                  <MonthEventChip key={event.id} event={event} />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setListFor(cell.date)}
                    className="text-muted-foreground hover:text-foreground px-1 text-start text-xs font-medium"
                  >
                    {t("calendar.moreCount", { n: hidden })}
                  </button>
                )}
              </div>
            </DroppableArea>
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
