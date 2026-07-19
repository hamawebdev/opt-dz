import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { PrescriptionDialog } from "@/components/prescription-dialog";
import { Calendar } from "@/features/calendar/calendar";
import { CalendarProvider } from "@/features/calendar/contexts/calendar-context";
import { useLinkAppointmentPrescription } from "@/hooks/use-appointments";
import type { Appointment, AppointmentRow } from "@/types";

/**
 * The appointment book.
 *
 * The calendar itself lives in `features/calendar`; this page owns the two
 * dialogs it hands off to — booking/editing an appointment, and recording the
 * exam that closes one out — so they are never nested inside another dialog.
 */
export default function AppointmentsPage() {
  const { t } = useTranslation();
  const linkPrescription = useLinkAppointmentPrescription();

  const [editing, setEditing] = useState<Appointment | null>(null);
  const [presetStartsAt, setPresetStartsAt] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [examFor, setExamFor] = useState<AppointmentRow | null>(null);

  const openNew = useCallback((startsAt?: string) => {
    setEditing(null);
    setPresetStartsAt(startsAt);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((appointment: Appointment) => {
    setEditing(appointment);
    setPresetStartsAt(undefined);
    setDialogOpen(true);
  }, []);

  const openExam = useCallback((appointment: AppointmentRow) => {
    setExamFor(appointment);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("appointments.title")}</h1>

      <CalendarProvider onNew={openNew} onEdit={openEdit} onExam={openExam}>
        <Calendar />
      </CalendarProvider>

      <AppointmentDialog
        key={editing ? `edit-${editing.id}` : `new-${presetStartsAt ?? ""}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editing}
        presetStartsAt={presetStartsAt}
      />

      {examFor && (
        <PrescriptionDialog
          key={`exam-${examFor.id}`}
          patientId={examFor.patient_id}
          defaultPrescriber={examFor.optometrist ?? undefined}
          open
          onOpenChange={(open) => !open && setExamFor(null)}
          onSaved={(prescriptionId) => {
            // Linking also flips the appointment to "done", which is what puts
            // the "start a sale" button in front of the cashier.
            linkPrescription.mutate({ id: examFor.id, prescriptionId });
            setExamFor(null);
          }}
        />
      )}
    </div>
  );
}
