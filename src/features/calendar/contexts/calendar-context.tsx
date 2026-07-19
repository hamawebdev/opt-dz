import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppointments } from "@/hooks/use-appointments";
import { useLocalStorage } from "@/features/calendar/hooks";
import {
  HOUR_HEIGHT_PX,
  toEvent,
  viewRange,
} from "@/features/calendar/helpers";
import type { ICalendarEvent } from "@/features/calendar/interfaces";
import type {
  TBadgeVariant,
  TCalendarView,
} from "@/features/calendar/types";
import type { Appointment, AppointmentRow } from "@/types";

/** Hours the day/week grid can be scrolled to open at. 16 leaves the rest of
 * the evening visible below the fold. */
export const MIN_START_HOUR = 0;
export const MAX_START_HOUR = 16;

/** Preferences that survive a restart. */
interface CalendarSettings {
  view: TCalendarView;
  badgeVariant: TBadgeVariant;
  use24HourFormat: boolean;
  startOfDayHour: number;
  agendaGroupBy: "date" | "status";
}

const DEFAULT_SETTINGS: CalendarSettings = {
  view: "checkin",
  badgeVariant: "colored",
  // Algeria reads 24-hour time; the shop opens at 8.
  use24HourFormat: true,
  startOfDayHour: 8,
  agendaGroupBy: "date",
};

interface ICalendarContext extends CalendarSettings {
  selectedDate: Date;
  setSelectedDate: (date: Date | undefined) => void;
  setView: (view: TCalendarView) => void;
  setBadgeVariant: (variant: TBadgeVariant) => void;
  toggleTimeFormat: () => void;
  setStartOfDayHour: (hour: number) => void;
  setAgendaGroupBy: (groupBy: "date" | "status") => void;

  /** Events for the visible period, after the optometrist filter. */
  events: ICalendarEvent[];
  isLoading: boolean;
  /** Every optometrist named on an appointment in range, for the filter. */
  optometrists: string[];
  selectedOptometrist: string | "all";
  setSelectedOptometrist: (value: string | "all") => void;

  /** Opens the shared appointment dialog — the calendar never owns a form of
   * its own, it reuses the one the rest of the app already uses. */
  openNew: (startsAt?: string) => void;
  openEdit: (appointment: Appointment) => void;
  /** Opens the prescription dialog for the exam-recording step. */
  openExam: (appointment: AppointmentRow) => void;

  /** The appointment whose details panel is open, if any. */
  detailsEvent: ICalendarEvent | null;
  openDetails: (event: ICalendarEvent) => void;
  closeDetails: () => void;
}

const CalendarContext = createContext<ICalendarContext | null>(null);

interface ProviderProps {
  children: ReactNode;
  onNew: (startsAt?: string) => void;
  onEdit: (appointment: Appointment) => void;
  onExam: (appointment: AppointmentRow) => void;
}

export function CalendarProvider({
  children,
  onNew,
  onEdit,
  onExam,
}: ProviderProps) {
  const [settings, setSettings] = useLocalStorage<CalendarSettings>(
    "calendar-settings",
    DEFAULT_SETTINGS,
  );
  // Merge on read so a settings key added in a later release still gets its
  // default for users who already have a stored object.
  const {
    view,
    badgeVariant,
    use24HourFormat,
    startOfDayHour,
    agendaGroupBy,
  } = { ...DEFAULT_SETTINGS, ...settings };

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedOptometrist, setSelectedOptometrist] = useState<
    string | "all"
  >("all");
  const [detailsEvent, setDetailsEvent] = useState<ICalendarEvent | null>(null);

  const range = useMemo(
    () => viewRange(view, selectedDate),
    [view, selectedDate],
  );
  const { data: rows, isLoading } = useAppointments(range);

  const allEvents = useMemo(() => (rows ?? []).map(toEvent), [rows]);

  const optometrists = useMemo(() => {
    const names = new Set<string>();
    for (const event of allEvents) {
      const name = event.optometrist?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allEvents]);

  const events = useMemo(() => {
    if (selectedOptometrist === "all") return allEvents;
    return allEvents.filter(
      (event) =>
        event.optometrist?.trim().toLowerCase() ===
        selectedOptometrist.toLowerCase(),
    );
  }, [allEvents, selectedOptometrist]);

  const update = useCallback(
    (partial: Partial<CalendarSettings>) => {
      setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...partial }));
    },
    [setSettings],
  );

  const handleSelectDate = useCallback((date: Date | undefined) => {
    if (date) setSelectedDate(date);
  }, []);

  const value = useMemo<ICalendarContext>(
    () => ({
      view,
      badgeVariant,
      use24HourFormat,
      startOfDayHour,
      agendaGroupBy,
      selectedDate,
      setSelectedDate: handleSelectDate,
      setView: (next) => {
        // Check-in is always about today. Without this, arriving from a month
        // spent browsing next March would label today's list "March".
        if (next === "checkin") setSelectedDate(new Date());
        update({ view: next });
      },
      setBadgeVariant: (next) => update({ badgeVariant: next }),
      toggleTimeFormat: () => update({ use24HourFormat: !use24HourFormat }),
      setStartOfDayHour: (hour) => {
        if (Number.isFinite(hour) && hour >= MIN_START_HOUR && hour <= MAX_START_HOUR) {
          update({ startOfDayHour: hour });
        }
      },
      setAgendaGroupBy: (next) => update({ agendaGroupBy: next }),
      events,
      isLoading,
      optometrists,
      selectedOptometrist,
      setSelectedOptometrist,
      openNew: onNew,
      openEdit: onEdit,
      openExam: onExam,
      // Re-read the open appointment from the live list so the details panel
      // reflects a status change made elsewhere instead of a stale snapshot.
      detailsEvent: detailsEvent
        ? (allEvents.find((e) => e.id === detailsEvent.id) ?? detailsEvent)
        : null,
      openDetails: setDetailsEvent,
      closeDetails: () => setDetailsEvent(null),
    }),
    [
      view,
      badgeVariant,
      use24HourFormat,
      startOfDayHour,
      agendaGroupBy,
      selectedDate,
      handleSelectDate,
      update,
      events,
      allEvents,
      isLoading,
      optometrists,
      selectedOptometrist,
      detailsEvent,
      onNew,
      onEdit,
      onExam,
    ],
  );

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar(): ICalendarContext {
  const context = useContext(CalendarContext);
  if (!context)
    throw new Error("useCalendar must be used within a CalendarProvider.");
  return context;
}

/** Pixel offset the day/week grid should open at. */
export function useScrollPosition(): number {
  const { startOfDayHour } = useCalendar();
  return startOfDayHour * HOUR_HEIGHT_PX;
}
