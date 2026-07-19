import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { differenceInMinutes } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { findAppointmentConflicts } from "@/db/appointments";
import { useUpdateAppointment } from "@/hooks/use-appointments";
import { notifyError } from "@/lib/errors";
import { formatLocal, formatTime } from "@/features/calendar/helpers";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import type { ICalendarEvent } from "@/features/calendar/interfaces";

/** A move or resize that is waiting on the double-booking confirmation. */
interface PendingChange {
  event: ICalendarEvent;
  start: Date;
  durationMin: number;
  /** Name + time of the appointment it clashes with. */
  conflictWith: { name: string; time: string };
}

interface DragDropContextType {
  draggedEvent: ICalendarEvent | null;
  isDragging: boolean;
  startDrag: (event: ICalendarEvent) => void;
  endDrag: () => void;
  /** Called by a droppable slot once an event is released over it. */
  handleEventDrop: (date: Date, hour?: number, minute?: number) => void;
  /** Called by a resize handle when the drag settles. */
  commitResize: (event: ICalendarEvent, durationMin: number) => void;
}

const DragDropContext = createContext<DragDropContextType | null>(null);

export function DndProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { use24HourFormat } = useCalendar();
  const update = useUpdateAppointment();

  const [draggedEvent, setDraggedEvent] = useState<ICalendarEvent | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);

  const startDrag = useCallback((event: ICalendarEvent) => {
    setDraggedEvent(event);
  }, []);

  const endDrag = useCallback(() => setDraggedEvent(null), []);

  /** Writes the new slot to the database, keeping every other field intact. */
  const save = useCallback(
    async (event: ICalendarEvent, start: Date, durationMin: number) => {
      try {
        await update.mutateAsync({
          id: event.id,
          input: {
            patient_id: event.row.patient_id,
            starts_at: formatLocal(start),
            duration_min: durationMin,
            optometrist: event.row.optometrist,
            reason: event.row.reason,
            notes: event.row.notes,
          },
        });
      } catch (err) {
        notifyError(err, t("problem.saveFailed"));
      }
    },
    [update, t],
  );

  /**
   * Applies a change, pausing first if it would double-book the optometrist.
   * A clean move saves silently; a clashing one asks before proceeding.
   */
  const apply = useCallback(
    async (event: ICalendarEvent, start: Date, durationMin: number) => {
      let conflicts: Awaited<ReturnType<typeof findAppointmentConflicts>> = [];
      try {
        conflicts = await findAppointmentConflicts({
          startsAt: formatLocal(start),
          durationMin,
          optometrist: event.row.optometrist,
          excludeId: event.id,
        });
      } catch (err) {
        // A failed check must not block the reschedule — log and carry on.
        notifyError(err, t("problem.loadFailed"));
      }

      if (conflicts.length > 0) {
        const clash = conflicts[0];
        setPending({
          event,
          start,
          durationMin,
          conflictWith: {
            name: clash.patient_name,
            time: (clash.starts_at.split(/[ T]/)[1] ?? "").slice(0, 5),
          },
        });
        return;
      }

      await save(event, start, durationMin);
    },
    [save, t],
  );

  const handleEventDrop = useCallback(
    (targetDate: Date, hour?: number, minute?: number) => {
      const event = draggedEvent;
      setDraggedEvent(null);
      if (!event) return;

      const durationMin = Math.max(
        15,
        differenceInMinutes(event.end, event.start),
      );

      const start = new Date(targetDate);
      if (hour !== undefined) {
        start.setHours(hour, minute ?? 0, 0, 0);
      } else {
        // Dropped on a month cell: keep the time of day, change the date only.
        start.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);
      }

      // Dropped back where it started — nothing to write.
      if (start.getTime() === event.start.getTime()) return;

      void apply(event, start, durationMin);
    },
    [draggedEvent, apply],
  );

  const commitResize = useCallback(
    (event: ICalendarEvent, durationMin: number) => {
      if (durationMin === differenceInMinutes(event.end, event.start)) return;
      void apply(event, event.start, durationMin);
    },
    [apply],
  );

  const value = useMemo(
    () => ({
      draggedEvent,
      isDragging: draggedEvent !== null,
      startDrag,
      endDrag,
      handleEventDrop,
      commitResize,
    }),
    [draggedEvent, startDrag, endDrag, handleEventDrop, commitResize],
  );

  return (
    <DragDropContext.Provider value={value}>
      {children}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("calendar.conflictTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending &&
                t("calendar.conflictBody", {
                  patient: pending.event.title,
                  time: formatTime(pending.start, use24HourFormat),
                  other: pending.conflictWith.name,
                  otherTime: pending.conflictWith.time,
                  optometrist: pending.event.optometrist ?? "",
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) {
                  void save(pending.event, pending.start, pending.durationMin);
                }
                setPending(null);
              }}
            >
              {t("calendar.conflictProceed")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext.Provider>
  );
}

export function useDragDrop(): DragDropContextType {
  const context = useContext(DragDropContext);
  if (!context)
    throw new Error("useDragDrop must be used within a DndProvider.");
  return context;
}
