import { format, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addMonths, subMonths } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { getCalendarCells, getWeekDays } from "@/features/calendar/helpers";

/**
 * Small month picker in the day view's sidebar.
 *
 * Built from the same `getCalendarCells` the month grid uses rather than
 * pulling in a date-picker library, so the Saturday week start and RTL layout
 * come for free.
 */
export function MiniMonth() {
  const { t } = useTranslation();
  const { selectedDate, setSelectedDate } = useCalendar();
  const [month, setMonth] = useState(selectedDate);

  const cells = getCalendarCells(month);
  const weekDays = getWeekDays(month);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("common.previous")}
          onClick={() => setMonth(subMonths(month, 1))}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Button>
        <span className="text-sm font-medium">
          {format(month, "MMMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("common.next")}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>

      <div className="text-muted-foreground grid grid-cols-7 text-center text-[0.65rem]">
        {weekDays.map((day) => (
          <span key={day.toISOString()} className="py-1">
            {format(day, "EEEEE")}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell) => (
          <button
            key={cell.date.toISOString()}
            type="button"
            onClick={() => setSelectedDate(cell.date)}
            className={cn(
              "hover:bg-accent flex size-8 items-center justify-center rounded-md text-xs",
              !cell.currentMonth && "text-muted-foreground/50",
              isToday(cell.date) && "font-bold",
              isSameDay(cell.date, selectedDate) &&
                "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}
