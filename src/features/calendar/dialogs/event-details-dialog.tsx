import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  CalendarDays,
  Clock,
  NotebookPen,
  ShoppingCart,
  Stethoscope,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusPill } from "@/components/status-pill";
import {
  useDeleteAppointment,
  useSetAppointmentStatus,
} from "@/hooks/use-appointments";
import { notifyError } from "@/lib/errors";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { formatTime } from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";
import type { ICalendarEvent } from "@/features/calendar/interfaces";
import type { AppointmentStatus } from "@/types";

interface IProps {
  event: ICalendarEvent | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Everything staff can do to one appointment, in one place.
 *
 * This is where the old page's check-in actions live now: marking a patient
 * arrived, recording the exam, flagging a no-show, and starting the sale once
 * the exam is done. The buttons on offer follow the appointment's status, so
 * only the next sensible step is ever visible.
 */
export function EventDetailsDialog({ event, onOpenChange }: IProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { use24HourFormat, openEdit, openExam } = useCalendar();
  const setStatus = useSetAppointmentStatus();
  const remove = useDeleteAppointment();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!event) return null;

  const { row } = event;
  const meta = STATUS_META[event.status];

  async function changeStatus(status: AppointmentStatus) {
    try {
      await setStatus.mutateAsync({ id: event!.id, status });
      toast.success(t(`appointments.status_${status}`));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync(event!.id);
      toast.success(t("appointments.deleted"));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.deleteFailed"));
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Link
                to={`/patients/${row.patient_id}`}
                className="hover:underline"
              >
                {row.patient_name}
              </Link>
              <StatusPill
                tone={meta.tone}
                icon={meta.icon}
                label={t(`appointments.status_${event.status}`)}
              />
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <Detail icon={CalendarDays} label={t("common.date")}>
              {format(event.start, "EEEE d MMMM yyyy")}
            </Detail>
            <Detail icon={Clock} label={t("appointments.time")}>
              {formatTime(event.start, use24HourFormat)} –{" "}
              {formatTime(event.end, use24HourFormat)}
              <span className="text-muted-foreground">
                {" "}
                ({t("appointments.minutes", { n: row.duration_min })})
              </span>
            </Detail>
            {row.optometrist && (
              <Detail icon={User} label={t("appointments.optometrist")}>
                {row.optometrist}
              </Detail>
            )}
            {(row.reason || row.notes) && (
              <Detail icon={NotebookPen} label={t("appointments.reason")}>
                {row.reason || "—"}
                {row.notes && (
                  <span className="text-muted-foreground block">
                    {row.notes}
                  </span>
                )}
              </Detail>
            )}
          </div>

          <Separator />

          {/* Next step first, in the order the shop actually works. */}
          <div className="flex flex-wrap gap-2">
            {event.status === "booked" && (
              <Button onClick={() => void changeStatus("arrived")}>
                <User className="size-4" /> {t("appointments.markArrived")}
              </Button>
            )}
            {event.status === "arrived" && (
              <>
                <Button
                  onClick={() => {
                    openExam(row);
                    onOpenChange(false);
                  }}
                >
                  <Stethoscope className="size-4" />{" "}
                  {t("appointments.recordExam")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void changeStatus("no_show")}
                >
                  {t("appointments.markNoShow")}
                </Button>
              </>
            )}
            {event.status === "done" && (
              <Button
                onClick={() =>
                  navigate(
                    `/pos?patient=${row.patient_id}${
                      row.prescription_id
                        ? `&prescription=${row.prescription_id}`
                        : ""
                    }`,
                  )
                }
              >
                <ShoppingCart className="size-4" /> {t("patients.newSale")}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  openEdit(row);
                  onOpenChange(false);
                }}
              >
                {t("common.edit")}
              </Button>
              {(event.status === "booked" || event.status === "arrived") && (
                <Button
                  variant="outline"
                  onClick={() => void changeStatus("cancelled")}
                >
                  {t("appointments.markCancelled")}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" /> {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("appointments.deleteTitle")}
        description={t("appointments.deleteBody", {
          name: row.patient_name,
        })}
        confirmText={t("common.delete")}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
