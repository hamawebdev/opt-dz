import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { transition } from "@/features/calendar/animations";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import {
  getEventsCount,
  navigateDate,
  rangeText,
} from "@/features/calendar/helpers";

/** Month + year, the appointment count for the period on screen, and the
 * previous/next stepper. */
export function DateNavigator() {
  const { t } = useTranslation();
  const { view, events, selectedDate, setSelectedDate } = useCalendar();

  const count = useMemo(
    () => getEventsCount(events, selectedDate, view),
    [events, selectedDate, view],
  );

  // Check-in is always today; stepping through days there makes no sense.
  const canNavigate = view !== "checkin";

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">
          {format(selectedDate, "MMMM yyyy")}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={count}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={transition}
          >
            <Badge variant="secondary">
              {t("appointments.countBadge", { n: count })}
            </Badge>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2">
        {canNavigate && (
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            aria-label={t("common.previous")}
            onClick={() =>
              setSelectedDate(navigateDate(selectedDate, view, "previous"))
            }
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
        )}

        <p className="text-muted-foreground text-sm">
          {rangeText(view, selectedDate)}
        </p>

        {canNavigate && (
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            aria-label={t("common.next")}
            onClick={() =>
              setSelectedDate(navigateDate(selectedDate, view, "next"))
            }
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}
