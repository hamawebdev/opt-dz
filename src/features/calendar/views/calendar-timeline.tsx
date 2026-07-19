import { useEffect, useState } from "react";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { formatTime } from "@/features/calendar/helpers";

/** The "you are here" line across the day/week grid, refreshed every minute. */
export function CalendarTimeline() {
  const { use24HourFormat } = useCalendar();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const top = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

  return (
    <div
      className="border-primary pointer-events-none absolute inset-x-0 z-30 border-t"
      style={{ top: `${top}%` }}
    >
      <div className="bg-primary absolute -top-1.5 -start-1.5 size-3 rounded-full" />
      <div className="bg-background text-primary absolute -start-18 flex w-16 -translate-y-1/2 justify-end pe-1 text-xs font-medium">
        {formatTime(now, use24HourFormat)}
      </div>
    </div>
  );
}
