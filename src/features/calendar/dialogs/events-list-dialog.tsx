import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { formatTime, getColorClass } from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

interface IProps {
  date: Date | null;
  events: ICalendarEvent[];
  onOpenChange: (open: boolean) => void;
}

/** The "+2 more" list behind a crowded month or year cell. Tapping a row opens
 * that appointment's details. */
export function EventsListDialog({ date, events, onOpenChange }: IProps) {
  const { t } = useTranslation();
  const { use24HourFormat, badgeVariant, openDetails } = useCalendar();

  if (!date) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{format(date, "EEEE d MMMM yyyy")}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {events.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("appointments.none")}
            </p>
          )}
          {events.map((event) => {
            const Icon = STATUS_META[event.status].icon;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  openDetails(event);
                }}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-2 rounded-md border p-2 text-start",
                  badgeVariant === "colored" && getColorClass(event.color),
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">
                  {event.title}
                </span>
                <span className="text-xs">
                  {formatTime(event.start, use24HourFormat)}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
