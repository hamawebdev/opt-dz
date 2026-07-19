import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";

/** Tear-off calendar page showing today's date; jumps the view back to today. */
export function TodayButton() {
  const { t } = useTranslation();
  const { setSelectedDate } = useCalendar();
  const today = new Date();

  return (
    <Button
      variant="outline"
      className="flex size-14 shrink-0 flex-col items-center justify-center overflow-hidden p-0 text-center"
      aria-label={t("appointments.today")}
      title={t("appointments.today")}
      onClick={() => setSelectedDate(new Date())}
    >
      <span className="bg-primary text-primary-foreground w-full py-1 text-xs font-semibold">
        {format(today, "MMM").toUpperCase()}
      </span>
      <span className="text-lg font-bold">{today.getDate()}</span>
    </Button>
  );
}
