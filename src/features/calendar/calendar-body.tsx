import { motion } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";
import { fadeIn, transition } from "@/features/calendar/animations";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { CalendarAgendaView } from "@/features/calendar/views/calendar-agenda-view";
import { CalendarCheckinView } from "@/features/calendar/views/calendar-checkin-view";
import { CalendarDayView } from "@/features/calendar/views/calendar-day-view";
import { CalendarMonthView } from "@/features/calendar/views/calendar-month-view";
import { CalendarWeekView } from "@/features/calendar/views/calendar-week-view";
import { CalendarYearView } from "@/features/calendar/views/calendar-year-view";

export function CalendarBody() {
  const { view, events, isLoading } = useCalendar();

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <motion.div
      key={view}
      initial="initial"
      animate="animate"
      variants={fadeIn}
      transition={transition}
    >
      {view === "checkin" && <CalendarCheckinView events={events} />}
      {view === "agenda" && <CalendarAgendaView events={events} />}
      {view === "day" && <CalendarDayView events={events} />}
      {view === "week" && <CalendarWeekView events={events} />}
      {view === "month" && <CalendarMonthView events={events} />}
      {view === "year" && <CalendarYearView events={events} />}
    </motion.div>
  );
}
