import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  areIntervalsOverlapping,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  useCalendar,
  useScrollPosition,
} from "@/features/calendar/contexts/calendar-context";
import { useDragDrop } from "@/features/calendar/contexts/dnd-context";
import { DroppableArea } from "@/features/calendar/dnd/droppable-area";
import {
  getEventsForDay,
  groupEvents,
  getEventBlockStyle,
  HOUR_HEIGHT_PX,
} from "@/features/calendar/helpers";
import { CalendarTimeline } from "@/features/calendar/views/calendar-timeline";
import { EventBlock } from "@/features/calendar/views/event-chip";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TimeGridProps {
  days: Date[];
  events: ICalendarEvent[];
  /** Height of the scrolling area. Day and week views size differently. */
  className?: string;
}

/**
 * The 24-hour grid shared by the day and week views.
 *
 * Each hour is split into two half-hour slots: clicking one starts a new
 * appointment there, dropping an existing one moves it there. The grid opens
 * scrolled to the shop's start-of-day so the empty small hours stay out of the
 * way without being unreachable.
 */
export function TimeGrid({ days, events, className }: TimeGridProps) {
  const { t } = useTranslation();
  const { use24HourFormat, openNew } = useCalendar();
  const { isDragging } = useDragDrop();
  const scrollPosition = useScrollPosition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollPosition });
  }, [scrollPosition]);

  // Auto-scroll when a chip is dragged towards the top or bottom edge,
  // otherwise an 08:00 appointment could never be dropped at 18:00.
  useEffect(() => {
    if (!isDragging) return;
    const onDragOver = (e: DragEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (e.clientY < rect.top + 60) el.scrollTop -= 12;
      else if (e.clientY > rect.bottom - 60) el.scrollTop += 12;
    };
    document.addEventListener("dragover", onDragOver);
    return () => document.removeEventListener("dragover", onDragOver);
  }, [isDragging]);

  return (
    <div className="flex flex-col">
      {/* Day headings */}
      <div className="relative z-20 flex border-b">
        <div className="w-18 shrink-0" />
        <div
          className="grid flex-1 border-s"
          style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
        >
          {days.map((day) => (
            <span
              key={day.toISOString()}
              className={cn(
                "text-muted-foreground py-2 text-center text-xs font-medium",
                isToday(day) && "text-primary",
              )}
            >
              {format(day, "EEE")}{" "}
              <span className="text-foreground font-semibold">
                {format(day, "d")}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className={cn("overflow-y-auto", className)}>
        <div className="flex">
          {/* Hour labels */}
          <div className="w-18 shrink-0">
            {HOURS.map((hour, index) => (
              <div
                key={hour}
                className="relative"
                style={{ height: HOUR_HEIGHT_PX }}
              >
                {index !== 0 && (
                  <span className="text-muted-foreground absolute -top-2 end-2 text-xs">
                    {format(
                      new Date().setHours(hour, 0, 0, 0),
                      use24HourFormat ? "HH:00" : "h a",
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            className="relative grid flex-1 border-s"
            style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
          >
            {days.map((day) => {
              const dayEvents = getEventsForDay(events, day);
              const grouped = groupEvents(dayEvents);
              const dayKey = format(day, "yyyy-MM-dd");

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative",
                    days.length > 1 && "border-s first:border-s-0",
                  )}
                >
                  {HOURS.map((hour, index) => (
                    <div
                      key={hour}
                      className="relative"
                      style={{ height: HOUR_HEIGHT_PX }}
                    >
                      {index !== 0 && (
                        <div className="pointer-events-none absolute inset-x-0 top-0 border-b" />
                      )}
                      {[0, 30].map((minute) => (
                        <DroppableArea
                          key={minute}
                          date={day}
                          hour={hour}
                          minute={minute}
                          className={cn(
                            "absolute inset-x-0",
                            minute === 0 ? "top-0" : "bottom-0",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={t("appointments.newAt", {
                              time: `${String(hour).padStart(2, "0")}:${String(
                                minute,
                              ).padStart(2, "0")}`,
                              date: format(day, "EEE d MMM"),
                            })}
                            onClick={() =>
                              openNew(
                                `${dayKey} ${String(hour).padStart(2, "0")}:${String(
                                  minute,
                                ).padStart(2, "0")}`,
                              )
                            }
                            className="hover:bg-secondary block w-full cursor-pointer transition-colors"
                            style={{ height: HOUR_HEIGHT_PX / 2 }}
                          />
                        </DroppableArea>
                      ))}
                      <div className="border-b-border/60 pointer-events-none absolute inset-x-0 top-1/2 border-b border-dashed" />
                    </div>
                  ))}

                  {grouped.map((group, groupIndex) =>
                    group.map((event) => {
                      const style = getEventBlockStyle(
                        event,
                        day,
                        groupIndex,
                        grouped.length,
                      );
                      // A lone appointment gets the full column width.
                      const overlaps = grouped.some(
                        (other, otherIndex) =>
                          otherIndex !== groupIndex &&
                          other.some((o) =>
                            areIntervalsOverlapping(
                              { start: event.start, end: event.end },
                              { start: o.start, end: o.end },
                            ),
                          ),
                      );

                      return (
                        <div
                          key={event.id}
                          className="absolute z-10 p-1"
                          style={
                            overlaps
                              ? style
                              : {
                                  ...style,
                                  width: "100%",
                                  insetInlineStart: "0%",
                                }
                          }
                        >
                          <EventBlock event={event} />
                        </div>
                      );
                    }),
                  )}
                </div>
              );
            })}

            {days.some((day) => isSameDay(day, new Date())) && (
              <CalendarTimeline />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
