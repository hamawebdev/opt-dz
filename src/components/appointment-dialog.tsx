import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/search-select";
import { usePatients } from "@/hooks/use-patients";
import {
  useCreateAppointment,
  useUpdateAppointment,
} from "@/hooks/use-appointments";
import type { Appointment } from "@/types";

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edits an existing appointment. */
  appointment?: Appointment | null;
  /** Locks the patient (e.g. when opened from a patient profile). */
  presetPatientId?: number;
  /** Pre-fills the date/time when opening from a calendar slot ('YYYY-MM-DD HH:MM'). */
  presetStartsAt?: string;
}

const DURATIONS = [15, 30, 45, 60, 90];

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  presetPatientId,
  presetStartsAt,
}: AppointmentDialogProps) {
  const { t } = useTranslation();
  const { data: patients } = usePatients();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const isEdit = appointment != null;

  const [patientId, setPatientId] = useState<string | null>(
    presetPatientId ? String(presetPatientId) : null,
  );
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [optometrist, setOptometrist] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (appointment) {
      const [d, tm] = appointment.starts_at.split(/[ T]/);
      setPatientId(String(appointment.patient_id));
      setDate(d ?? "");
      setTime((tm ?? "09:00").slice(0, 5));
      setDuration(String(appointment.duration_min));
      setOptometrist(appointment.optometrist ?? "");
      setReason(appointment.reason ?? "");
      setNotes(appointment.notes ?? "");
    } else {
      const [d, tm] = (presetStartsAt ?? "").split(/[ T]/);
      setPatientId(presetPatientId ? String(presetPatientId) : null);
      setDate(d || new Date().toISOString().slice(0, 10));
      setTime(tm ? tm.slice(0, 5) : "09:00");
      setDuration("30");
      setOptometrist("");
      setReason("");
      setNotes("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, appointment, presetPatientId, presetStartsAt]);

  const patientOptions = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: `${p.code ?? ""} ${p.phone ?? ""}`,
      })),
    [patients],
  );

  async function handleSave() {
    if (!patientId) {
      toast.error(t("appointments.patientRequired"));
      return;
    }
    if (!date) {
      toast.error(t("appointments.dateRequired"));
      return;
    }
    const input = {
      patient_id: Number(patientId),
      starts_at: `${date} ${time}`,
      duration_min: Number(duration),
      optometrist: optometrist.trim() || null,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: appointment.id, input });
        toast.success(t("appointments.updated"));
      } else {
        await create.mutateAsync(input);
        toast.success(t("appointments.created"));
      }
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("appointments.edit") : t("appointments.new")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!presetPatientId && (
            <div className="grid gap-1.5">
              <Label>{t("nav.patients")}</Label>
              <SearchSelect
                options={patientOptions}
                value={patientId}
                onChange={setPatientId}
                placeholder={t("appointments.selectPatient")}
              />
            </div>
          )}
          <div className="flex gap-3">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="appt_date">{t("common.date")}</Label>
              <Input
                id="appt_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid w-28 gap-1.5">
              <Label htmlFor="appt_time">{t("appointments.time")}</Label>
              <Input
                id="appt_time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("appointments.duration")}</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t("appointments.minutes", { n: d })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appt_opto">{t("appointments.optometrist")}</Label>
            <Input
              id="appt_opto"
              value={optometrist}
              onChange={(e) => setOptometrist(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appt_reason">{t("appointments.reason")}</Label>
            <Input
              id="appt_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("appointments.reasonPlaceholder")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appt_notes">{t("common.notes")}</Label>
            <Textarea
              id="appt_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={create.isPending || update.isPending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
