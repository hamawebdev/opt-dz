import { memo } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarRange,
  Columns,
  Grid2X2,
  Grid3X3,
  List,
  UserCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import type { TCalendarView } from "@/features/calendar/types";

const TABS: { value: TCalendarView; icon: typeof List }[] = [
  { value: "checkin", icon: UserCheck },
  { value: "agenda", icon: CalendarRange },
  { value: "day", icon: List },
  { value: "week", icon: Columns },
  { value: "month", icon: Grid3X3 },
  { value: "year", icon: Grid2X2 },
];

/** The view switcher. Only the active tab shows its label, so six views fit on
 * one row without crowding. */
function ViewTabs() {
  const { t } = useTranslation();
  const { view, setView } = useCalendar();

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as TCalendarView)}
      className="w-full sm:w-auto"
    >
      <TabsList className="h-auto w-full gap-1 rounded-xl p-1">
        {TABS.map(({ value, icon: Icon }) => {
          const isActive = view === value;
          const label = t(`appointments.view_${value}`);

          return (
            <motion.div
              key={value}
              layout
              className={cn(
                "flex h-8 items-center justify-center overflow-hidden rounded-md",
                isActive ? "flex-1" : "flex-none",
              )}
              initial={false}
              animate={{ width: isActive ? 116 : 34 }}
              transition={{ type: "tween", duration: 0.2 }}
            >
              <TabsTrigger value={value} asChild>
                <button
                  type="button"
                  aria-label={label}
                  title={label}
                  className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5"
                >
                  <Icon className="size-4 shrink-0" />
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.span
                        className="truncate text-sm font-medium"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </TabsTrigger>
            </motion.div>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export default memo(ViewTabs);
