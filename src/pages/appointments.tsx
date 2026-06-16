import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Eye,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { PrescriptionDialog } from "@/components/prescription-dialog";
import {
  useAppointments,
  useSetAppointmentStatus,
  useLinkAppointmentPrescription,
} from "@/hooks/use-appointments";
import type { Appointment, AppointmentRow, AppointmentStatus } from "@/types";

type View = "day" | "week" | "agenda" | "checkin";
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00–19:00
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const timeOf = (s: string) => (s.split(/[ T]/)[1] ?? "").slice(0, 5);
const dateOf = (s: string) => s.split(/[ T]/)[0] ?? "";
const hourOf = (s: string) => Number(timeOf(s).slice(0, 2));

const statusVariant: Record<
  AppointmentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  booked: "secondary",
  arrived: "default",
  done: "outline",
  no_show: "destructive",
  cancelled: "destructive",
};

export default function AppointmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [presetStartsAt, setPresetStartsAt] = useState<string | undefined>();
  const [examFor, setExamFor] = useState<AppointmentRow | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 6 });
      return { from: iso(start), to: iso(addDays(start, 6)) };
    }
    if (view === "checkin") {
      const today = iso(new Date());
      return { from: today, to: today };
    }
    return { from: iso(anchor), to: iso(anchor) };
  }, [view, anchor]);

  const { data: appts } = useAppointments(range);
  const setStatus = useSetAppointmentStatus();
  const linkRx = useLinkAppointmentPrescription();

  function openNew(startsAt?: string) {
    setEditing(null);
    setPresetStartsAt(startsAt);
    setDialogOpen(true);
  }
  function openEdit(a: Appointment) {
    setEditing(a);
    setPresetStartsAt(undefined);
    setDialogOpen(true);
  }

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 6 });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }, [anchor]);

  function shift(dir: number) {
    setAnchor((d) => addDays(d, view === "week" ? dir * 7 : dir));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("appointments.title")}</h1>
        <Button onClick={() => openNew()}>
          <Plus className="size-4" /> {t("appointments.new")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["day", "week", "agenda", "checkin"] as View[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "secondary" : "outline"}
              onClick={() => setView(v)}
            >
              {t(`appointments.view_${v}`)}
            </Button>
          ))}
        </div>
        {view !== "checkin" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              {t("appointments.today")}
            </Button>
            <Button variant="outline" size="icon" onClick={() => shift(1)}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Button>
            <span className="text-muted-foreground text-sm">
              {view === "week"
                ? `${format(weekDays[0], "dd MMM")} – ${format(weekDays[6], "dd MMM yyyy")}`
                : format(anchor, "EEEE dd MMM yyyy")}
            </span>
          </div>
        )}
      </div>

      {view === "day" && (
        <DayGrid
          day={anchor}
          appts={appts ?? []}
          onSlot={openNew}
          onOpen={openEdit}
        />
      )}
      {view === "week" && (
        <WeekGrid
          days={weekDays}
          appts={appts ?? []}
          onSlot={openNew}
          onOpen={openEdit}
        />
      )}
      {(view === "agenda" || view === "checkin") && (
        <AgendaList
          appts={appts ?? []}
          checkin={view === "checkin"}
          onOpen={openEdit}
          onStatus={(id, status) => setStatus.mutate({ id, status })}
          onExam={(a) => setExamFor(a)}
          onSale={(a) =>
            navigate(
              `/sales/new?patient=${a.patient_id}${a.prescription_id ? `&prescription=${a.prescription_id}` : ""}`,
            )
          }
        />
      )}

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
          open={examFor != null}
          onOpenChange={(o) => !o && setExamFor(null)}
          onSaved={(rxId) => {
            linkRx.mutate({ id: examFor.id, prescriptionId: rxId });
            setExamFor(null);
          }}
        />
      )}
    </div>
  );
}

function ApptChip({
  a,
  onOpen,
}: {
  a: AppointmentRow;
  onOpen: (a: Appointment) => void;
}) {
  return (
    <button
      onClick={() => onOpen(a)}
      className="bg-primary/10 hover:bg-primary/20 w-full truncate rounded px-1.5 py-1 text-start text-xs"
      title={`${timeOf(a.starts_at)} ${a.patient_name}`}
    >
      <span className="font-medium">{timeOf(a.starts_at)}</span> {a.patient_name}
    </button>
  );
}

function DayGrid({
  day,
  appts,
  onSlot,
  onOpen,
}: {
  day: Date;
  appts: AppointmentRow[];
  onSlot: (startsAt: string) => void;
  onOpen: (a: Appointment) => void;
}) {
  const dayStr = iso(day);
  const todays = appts.filter((a) => dateOf(a.starts_at) === dayStr);
  return (
    <Card className="p-0">
      <div className="divide-y">
        {HOURS.map((h) => {
          const hh = String(h).padStart(2, "0");
          const items = todays.filter((a) => hourOf(a.starts_at) === h);
          return (
            <div key={h} className="flex gap-2 p-2">
              <button
                onClick={() => onSlot(`${dayStr} ${hh}:00`)}
                className="text-muted-foreground hover:text-foreground w-14 shrink-0 text-end text-xs"
              >
                {hh}:00
              </button>
              <div className="flex flex-1 flex-col gap-1">
                {items.map((a) => (
                  <ApptChip key={a.id} a={a} onOpen={onOpen} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekGrid({
  days,
  appts,
  onSlot,
  onOpen,
}: {
  days: Date[];
  appts: AppointmentRow[];
  onSlot: (startsAt: string) => void;
  onOpen: (a: Appointment) => void;
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b">
          <div />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={`p-2 text-center text-xs font-medium ${
                isSameDay(d, new Date()) ? "text-primary" : ""
              }`}
            >
              {format(d, "EEE dd")}
            </div>
          ))}
        </div>
        {HOURS.map((h) => {
          const hh = String(h).padStart(2, "0");
          return (
            <div
              key={h}
              className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b"
            >
              <div className="text-muted-foreground p-1 text-end text-xs">
                {hh}:00
              </div>
              {days.map((d) => {
                const dayStr = iso(d);
                const items = appts.filter(
                  (a) => dateOf(a.starts_at) === dayStr && hourOf(a.starts_at) === h,
                );
                return (
                  <button
                    key={dayStr}
                    onClick={() => onSlot(`${dayStr} ${hh}:00`)}
                    className="hover:bg-muted/50 min-h-10 space-y-1 border-s p-1 text-start"
                  >
                    {items.map((a) => (
                      <ApptChip key={a.id} a={a} onOpen={onOpen} />
                    ))}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AgendaList({
  appts,
  checkin,
  onOpen,
  onStatus,
  onExam,
  onSale,
}: {
  appts: AppointmentRow[];
  checkin: boolean;
  onOpen: (a: Appointment) => void;
  onStatus: (id: number, status: AppointmentStatus) => void;
  onExam: (a: AppointmentRow) => void;
  onSale: (a: AppointmentRow) => void;
}) {
  const { t } = useTranslation();
  if (!appts.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          {t("appointments.none")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {appts.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="w-14 text-sm font-semibold">{timeOf(a.starts_at)}</div>
            <div className="min-w-40 flex-1">
              <Link
                to={`/patients/${a.patient_id}`}
                className="font-medium hover:underline"
              >
                {a.patient_name}
              </Link>
              <div className="text-muted-foreground text-xs">
                {[a.reason, a.optometrist].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <Badge variant={statusVariant[a.status]}>
              {t(`appointments.status_${a.status}`)}
            </Badge>
            <div className="flex flex-wrap gap-1">
              {checkin && a.status === "booked" && (
                <Button size="sm" variant="outline" onClick={() => onStatus(a.id, "arrived")}>
                  {t("appointments.markArrived")}
                </Button>
              )}
              {checkin && a.status === "arrived" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onExam(a)}>
                    <Stethoscope className="size-4" /> {t("appointments.recordExam")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onStatus(a.id, "no_show")}
                  >
                    {t("appointments.markNoShow")}
                  </Button>
                </>
              )}
              {a.status === "done" && (
                <Button size="sm" variant="outline" onClick={() => onSale(a)}>
                  <ShoppingCart className="size-4" /> {t("patients.newSale")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpen(a)}
                aria-label={t("common.edit")}
              >
                <Eye className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
