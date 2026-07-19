import { CalendarBody } from "@/features/calendar/calendar-body";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { DndProvider } from "@/features/calendar/contexts/dnd-context";
import { EventDetailsDialog } from "@/features/calendar/dialogs/event-details-dialog";
import { CalendarHeader } from "@/features/calendar/header/calendar-header";

/**
 * The appointment calendar. Expects a `CalendarProvider` above it — the page
 * owns that, because it also owns the appointment and prescription dialogs the
 * calendar opens.
 */
export function Calendar() {
  const { detailsEvent, closeDetails } = useCalendar();

  return (
    <DndProvider>
      <div className="bg-card w-full overflow-hidden rounded-xl border">
        <CalendarHeader />
        <CalendarBody />
      </div>

      <EventDetailsDialog
        event={detailsEvent}
        onOpenChange={(open) => !open && closeDetails()}
      />
    </DndProvider>
  );
}
