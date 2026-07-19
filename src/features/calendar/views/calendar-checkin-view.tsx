import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ShoppingCart, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { useSetAppointmentStatus } from "@/hooks/use-appointments";
import { notifyError } from "@/lib/errors";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { formatTime } from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";
import type { ICalendarEvent } from "@/features/calendar/interfaces";
import type { AppointmentStatus } from "@/types";

/**
 * Today's front-desk worklist — the busiest screen in the shop, so it opens by
 * default. One row per patient with only the next action showing: arrive them,
 * record the exam, then start the sale.
 */
export function CalendarCheckinView({ events }: { events: ICalendarEvent[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { use24HourFormat, openDetails, openExam } = useCalendar();
  const setStatus = useSetAppointmentStatus();

  async function changeStatus(id: number, status: AppointmentStatus) {
    try {
      await setStatus.mutateAsync({ id, status });
      toast.success(t(`appointments.status_${status}`));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t("appointments.none")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {events.map((event) => {
        const meta = STATUS_META[event.status];
        const { row } = event;

        return (
          <Card key={event.id}>
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <div className="w-14 shrink-0 text-sm font-semibold">
                {formatTime(event.start, use24HourFormat)}
              </div>

              <div className="min-w-40 flex-1">
                <Link
                  to={`/patients/${row.patient_id}`}
                  className="font-medium hover:underline"
                >
                  {row.patient_name}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {[event.reason, event.optometrist]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>

              <StatusPill
                tone={meta.tone}
                icon={meta.icon}
                label={t(`appointments.status_${event.status}`)}
              />

              <div className="flex flex-wrap gap-1">
                {event.status === "booked" && (
                  <Button
                    size="sm"
                    onClick={() => void changeStatus(event.id, "arrived")}
                  >
                    {t("appointments.markArrived")}
                  </Button>
                )}
                {event.status === "arrived" && (
                  <>
                    <Button size="sm" onClick={() => openExam(row)}>
                      <Stethoscope className="size-4" />{" "}
                      {t("appointments.recordExam")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void changeStatus(event.id, "no_show")}
                    >
                      {t("appointments.markNoShow")}
                    </Button>
                  </>
                )}
                {event.status === "done" && (
                  <Button
                    size="sm"
                    variant="outline"
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openDetails(event)}
                >
                  {t("common.details")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
