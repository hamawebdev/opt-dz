import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  slideFromEnd,
  slideFromStart,
  transition,
} from "@/features/calendar/animations";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { DateNavigator } from "@/features/calendar/header/date-navigator";
import { OptometristSelect } from "@/features/calendar/header/optometrist-select";
import { StatusLegend } from "@/features/calendar/header/status-legend";
import { TodayButton } from "@/features/calendar/header/today-button";
import ViewTabs from "@/features/calendar/header/view-tabs";
import { CalendarSettings } from "@/features/calendar/settings/calendar-settings";

export function CalendarHeader() {
  const { t } = useTranslation();
  const { openNew } = useCalendar();

  return (
    <div className="flex flex-col gap-4 border-b p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <motion.div
          className="flex items-center gap-3"
          variants={slideFromStart}
          initial="initial"
          animate="animate"
          transition={transition}
        >
          <TodayButton />
          <DateNavigator />
        </motion.div>

        <motion.div
          className="flex flex-col gap-2 lg:flex-row lg:items-center"
          variants={slideFromEnd}
          initial="initial"
          animate="animate"
          transition={transition}
        >
          <ViewTabs />
          <div className="flex items-center gap-2">
            <OptometristSelect />
            <Button onClick={() => openNew()} className="flex-1 lg:flex-none">
              <Plus className="size-4" />
              {t("appointments.new")}
            </Button>
            <CalendarSettings />
          </div>
        </motion.div>
      </div>

      <StatusLegend />
    </div>
  );
}
