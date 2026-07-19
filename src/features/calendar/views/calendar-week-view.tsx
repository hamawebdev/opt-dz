import { useTranslation } from "react-i18next";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { getWeekDays } from "@/features/calendar/helpers";
import { TimeGrid } from "@/features/calendar/views/time-grid";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

export function CalendarWeekView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const { selectedDate } = useCalendar();
  const days = getWeekDays(selectedDate);

  return (
    <>
      <p className="text-muted-foreground border-b p-4 text-center text-sm sm:hidden">
        {t("calendar.weekOnSmallScreen")}
      </p>
      <div className="hidden sm:block">
        <TimeGrid days={days} events={events} className="h-[720px]" />
      </div>
    </>
  );
}
