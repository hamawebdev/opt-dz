import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileText,
  Hammer,
  MoreVertical,
  PhoneCall,
  Receipt,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { JobDetailsDialog } from "@/components/job-details-dialog";
import { JobStageStepper } from "@/components/job-stage-stepper";
import { PatientAvatar } from "@/components/patient-avatar";
import { JobStatusPill, StatusPill } from "@/components/status-pill";
import { JOB_META } from "@/lib/job-meta";
import {
  useJob,
  useJobEvents,
  useUpdateJobStatus,
} from "@/hooks/use-jobs";
import { nextJobStatus, prevJobStatus } from "@/db/jobs";
import { formatDate, formatDateTime } from "@/lib/format";
import { notifyError } from "@/lib/errors";
import { useSimpleMode } from "@/store/use-app-store";
import type { JobStatus } from "@/types";

/** Primary-action label, keyed by the stage the tap moves the job INTO. */
const ACTION_LABEL: Partial<Record<JobStatus, string>> = {
  in_progress: "jobs.actionToInProgress",
  ready: "jobs.actionToReady",
  delivered: "jobs.actionToDelivered",
};

export default function JobDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const jobId = Number(id);
  const simpleMode = useSimpleMode();

  const jobQuery = useJob(Number.isFinite(jobId) ? jobId : undefined);
  const job = jobQuery.data;
  const eventsQuery = useJobEvents(job?.id);
  const setStatus = useUpdateJobStatus();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  if (jobQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }
  if (jobQuery.isError) {
    return <ErrorState onRetry={() => jobQuery.refetch()} />;
  }
  if (!job) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Hammer />
          </EmptyMedia>
          <EmptyTitle>{t("jobs.orderNotFound")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const next = nextJobStatus(job.status);
  const prev = prevJobStatus(job.status);
  const NextIcon = next ? JOB_META[next].icon : null;
  const patientName = job.patient_name ?? t("sales.walkIn");

  async function moveTo(status: JobStatus) {
    try {
      await setStatus.mutateAsync({ id: job!.id, status });
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  function advance() {
    if (!next) return;
    if (next === "delivered") setConfirmDeliver(true);
    else void moveTo(next);
  }

  async function copyPhone() {
    if (!job?.patient_phone) return;
    try {
      await navigator.clipboard.writeText(job.patient_phone);
      toast.success(t("jobs.phoneCopied"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.jobs")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.actions")}
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              {t("dlg.editJob")}
            </DropdownMenuItem>
            {prev && (
              <DropdownMenuItem onSelect={() => setConfirmBack(true)}>
                {t("jobs.moveBack")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 1. Where the order is in the pipeline + the one next action. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Hammer className="text-muted-foreground size-5" />
              {t("jobs.orderNumber", { id: job.id })}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t("jobs.createdOn", { date: formatDate(job.created_at) })}
            </p>
          </div>
          <JobStatusPill status={job.status} />
        </CardHeader>
        <CardContent className="space-y-5">
          <JobStageStepper status={job.status} />
          {next && NextIcon && (
            <Button
              className="h-12 w-full text-base"
              onClick={advance}
              disabled={setStatus.isPending}
            >
              <NextIcon className="size-5" />
              {t(ACTION_LABEL[next] ?? "")}
            </Button>
          )}
          {job.status === "delivered" && job.delivered_at && (
            <p className="text-success flex items-center justify-center gap-2 font-medium">
              <CheckCircle2 className="size-5" />
              {t("jobs.deliveredOn", { date: formatDate(job.delivered_at) })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Who to hand the glasses to — phone front and center when ready. */}
      <Card className={cn(job.status === "ready" && "ring-success/40 ring-2")}>
        <CardContent className="flex flex-wrap items-center gap-4">
          <PatientAvatar name={patientName} className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            {job.patient_id != null ? (
              <Link
                to={`/patients/${job.patient_id}`}
                className="flex w-fit items-center gap-2 font-semibold hover:underline"
              >
                <User className="text-muted-foreground size-4" /> {patientName}
              </Link>
            ) : (
              <p className="flex w-fit items-center gap-2 font-semibold">
                <User className="text-muted-foreground size-4" /> {patientName}
              </p>
            )}
            {job.status === "ready" && (
              <p className="text-success mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                <PhoneCall className="size-4" /> {t("jobs.readyWaiting")}
              </p>
            )}
          </div>
          {job.patient_phone ? (
            <div className="flex flex-wrap items-center gap-3">
              <span dir="ltr" className="text-3xl font-bold tracking-wide tabular-nums">
                {job.patient_phone}
              </span>
              <Button variant="outline" onClick={copyPhone}>
                <Copy className="size-4" /> {t("jobs.copyPhone")}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("jobs.noPhone")}</p>
          )}
        </CardContent>
      </Card>

      {/* 3. Order details. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("jobs.details")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            {t("common.edit")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {job.sale_id != null && (
            <p className="flex items-center gap-2">
              <Receipt className="text-muted-foreground size-4 shrink-0" />
              <Link
                to={`/sales/${job.sale_id}`}
                className="font-medium hover:underline"
              >
                {job.invoice_number ?? `#${job.sale_id}`}
              </Link>
            </p>
          )}
          {job.prescription_id != null && job.patient_id != null && (
            <p className="flex items-center gap-2">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <Link
                to={`/patients/${job.patient_id}`}
                className="font-medium hover:underline"
              >
                {t("jobs.viewPrescription")}
              </Link>
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{t("jobs.lab")}:</span>{" "}
            {job.lab ?? "—"}
          </p>
          <p className="flex items-center gap-2">
            <span>
              <span className="text-muted-foreground">
                {t("jobs.expected")}:
              </span>{" "}
              {job.expected_ready ? formatDate(job.expected_ready) : "—"}
            </span>
            {!!job.overdue && (
              <StatusPill
                tone="danger"
                icon={AlertTriangle}
                label={t("jobs.late")}
              />
            )}
          </p>
          {job.notes && (
            <p className="text-muted-foreground pt-2 whitespace-pre-wrap">
              {job.notes}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4. Stage history — advanced info, hidden in simple mode. */}
      {!simpleMode && (
        <Card>
          <CardHeader>
            <CardTitle>{t("jobs.historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !eventsQuery.data?.length ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <ul className="space-y-3">
                {eventsQuery.data.map((e, i, all) => {
                  const Icon = JOB_META[e.status]?.icon ?? Hammer;
                  // The list is newest-first; the oldest 'ordered' row is creation.
                  const isCreation =
                    i === all.length - 1 && e.status === "ordered";
                  return (
                    <li key={e.id} className="flex items-center gap-3 text-sm">
                      <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                        <Icon className="text-muted-foreground size-4" />
                      </span>
                      <span className="font-medium">
                        {isCreation
                          ? t("jobs.createdEvent")
                          : t(`jobStatus.${e.status}`)}
                      </span>
                      {e.note && (
                        <span className="text-muted-foreground truncate">
                          {e.note}
                        </span>
                      )}
                      <span className="text-muted-foreground ms-auto tabular-nums">
                        {formatDateTime(e.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <JobDetailsDialog open={editOpen} onOpenChange={setEditOpen} job={job} />

      <ConfirmDialog
        open={confirmDeliver}
        onOpenChange={setConfirmDeliver}
        title={t("jobs.confirmDeliveredTitle")}
        description={t("jobs.confirmDeliveredDesc")}
        confirmText={t("jobs.actionToDelivered")}
        destructive={false}
        onConfirm={() => {
          void moveTo("delivered");
          setConfirmDeliver(false);
        }}
      />

      <ConfirmDialog
        open={confirmBack}
        onOpenChange={setConfirmBack}
        title={t("jobs.moveBackTitle")}
        description={t("jobs.moveBackDesc")}
        confirmText={t("jobs.moveBack")}
        destructive={false}
        onConfirm={() => {
          if (prev) void moveTo(prev);
          setConfirmBack(false);
        }}
      />
    </div>
  );
}
