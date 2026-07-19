import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Hammer,
  MoreVertical,
  Phone,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { HelpHint } from "@/components/help-hint";
import { NewJobDialog } from "@/components/new-job-dialog";
import { JobDetailsDialog } from "@/components/job-details-dialog";
import { PatientAvatar } from "@/components/patient-avatar";
import { JobStatusPill, StatusPill } from "@/components/status-pill";
import { JOB_META } from "@/lib/job-meta";
import { useJobs, useJobStageCounts, useUpdateJobStatus } from "@/hooks/use-jobs";
import { JOB_FLOW, nextJobStatus, prevJobStatus } from "@/db/jobs";
import { formatDate } from "@/lib/format";
import { notifyError } from "@/lib/errors";
import type { JobRow, JobStatus } from "@/types";

const PAGE_SIZE = 20;

/** Primary-action label, keyed by the stage the tap moves the job INTO. */
const ACTION_LABEL: Partial<Record<JobStatus, string>> = {
  in_progress: "jobs.actionToInProgress",
  ready: "jobs.actionToReady",
  delivered: "jobs.actionToDelivered",
};

type Stage = "active" | JobStatus;

function parseStage(raw: string | null): Stage {
  return raw === "active" || (JOB_FLOW as string[]).includes(raw ?? "")
    ? (raw as Stage)
    : "active";
}

export default function JobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const stage = parseStage(searchParams.get("stage"));
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<JobRow | null>(null);
  const [confirmDeliver, setConfirmDeliver] = useState<JobRow | null>(null);
  const [confirmBack, setConfirmBack] = useState<JobRow | null>(null);

  const countsQuery = useJobStageCounts();
  const counts = countsQuery.data;
  const activeCount = counts
    ? counts.ordered + counts.in_progress + counts.ready
    : 0;

  const jobsQuery = useJobs({
    ...(stage === "active" ? { activeOnly: true } : { status: stage }),
    search: search || null,
    overdueOnly,
  });
  const jobs = jobsQuery.data;
  const setStatus = useUpdateJobStatus();

  const pageCount = Math.max(1, Math.ceil((jobs?.length ?? 0) / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageJobs = useMemo(
    () => (jobs ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [jobs, safePage],
  );

  function selectStage(next: Stage) {
    setSearchParams(next === "active" ? {} : { stage: next }, {
      replace: true,
    });
    // Delivered orders can't be late — the combination would always be empty.
    if (next === "delivered") setOverdueOnly(false);
    setPage(1);
  }

  async function moveTo(job: JobRow, status: JobStatus) {
    try {
      await setStatus.mutateAsync({ id: job.id, status });
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  /** One tap forward; handing over to the client asks for confirmation first. */
  function advance(job: JobRow) {
    const next = nextJobStatus(job.status);
    if (!next) return;
    if (next === "delivered") setConfirmDeliver(job);
    else void moveTo(job, next);
  }

  const stages: { key: Stage; icon: typeof Hammer; label: string; count: number }[] =
    [
      {
        key: "active",
        icon: Hammer,
        label: t("jobs.stageAll"),
        count: activeCount,
      },
      ...JOB_FLOW.map((s) => ({
        key: s as Stage,
        icon: JOB_META[s].icon,
        label: t(`jobStatus.${s}`),
        count: counts?.[s] ?? 0,
      })),
    ];

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Header: what this page is + the one way to add an order manually. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {t("jobs.title")}
            <HelpHint text={t("help.labFlow")} />
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("jobs.description")}
          </p>
        </div>
        <Button size="lg" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> {t("jobs.newOrder")}
        </Button>
      </div>

      {/* 2. Pipeline stages as big tappable tabs: icon + word + count. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {stages.map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectStage(key)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-sm font-medium transition-colors",
              stage === key
                ? "ring-primary bg-primary/5 ring-2"
                : "hover:bg-muted/50",
            )}
            aria-pressed={stage === key}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="text-muted-foreground size-4" />
              {label}
            </span>
            <span className="text-lg font-bold tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      {/* 3. Late banner — doubles as an overdue-only filter toggle. */}
      {(counts?.overdue ?? 0) > 0 && stage !== "delivered" && (
        <button
          type="button"
          onClick={() => {
            setOverdueOnly((v) => !v);
            setPage(1);
          }}
          aria-pressed={overdueOnly}
          className={cn(
            "bg-warning/15 flex items-center gap-2 rounded-lg border p-3 text-sm font-medium",
            overdueOnly && "ring-warning ring-2",
          )}
        >
          <AlertTriangle className="text-warning size-5 shrink-0" />
          {t("jobs.lateWithCount", { count: counts?.overdue ?? 0 })}
        </button>
      )}

      {/* 4. Search by client name. */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("jobs.searchPlaceholder")}
          className="ps-9"
        />
      </div>

      {/* 5. Job cards. */}
      {jobsQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : jobsQuery.isError ? (
        <ErrorState onRetry={() => jobsQuery.refetch()} />
      ) : !jobs?.length ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {stage === "active" && !search && !overdueOnly
            ? t("jobs.noJobs")
            : t("jobs.noJobsInStage")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pageJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onOpen={() => navigate(`/jobs/${job.id}`)}
              onAdvance={() => advance(job)}
              onBack={() => setConfirmBack(job)}
              onEdit={() => setEditing(job)}
            />
          ))}
        </div>
      )}

      {/* 6. Pagination. */}
      {!jobsQuery.isLoading &&
        !jobsQuery.isError &&
        (jobs?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {t("jobs.resultsCount", { count: jobs?.length ?? 0 })}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  aria-label={t("common.previous")}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </Button>
                <span className="text-sm tabular-nums">
                  {t("sales.pageOf", { page: safePage, total: pageCount })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage(safePage + 1)}
                  aria-label={t("common.next")}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </Button>
              </div>
            )}
          </div>
        )}

      <NewJobDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => navigate(`/jobs/${id}`)}
      />

      <JobDetailsDialog
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        job={editing}
      />

      {/* Handing the glasses to the client archives the order — confirm it. */}
      <ConfirmDialog
        open={confirmDeliver != null}
        onOpenChange={(o) => !o && setConfirmDeliver(null)}
        title={t("jobs.confirmDeliveredTitle")}
        description={t("jobs.confirmDeliveredDesc")}
        confirmText={t("jobs.actionToDelivered")}
        destructive={false}
        onConfirm={() => {
          if (confirmDeliver) void moveTo(confirmDeliver, "delivered");
          setConfirmDeliver(null);
        }}
      />

      {/* Backward moves exist only for fixing mistakes — tucked away + confirmed. */}
      <ConfirmDialog
        open={confirmBack != null}
        onOpenChange={(o) => !o && setConfirmBack(null)}
        title={t("jobs.moveBackTitle")}
        description={t("jobs.moveBackDesc")}
        confirmText={t("jobs.moveBack")}
        destructive={false}
        onConfirm={() => {
          const prev = confirmBack && prevJobStatus(confirmBack.status);
          if (confirmBack && prev) void moveTo(confirmBack, prev);
          setConfirmBack(null);
        }}
      />
    </div>
  );
}

function JobCard({
  job,
  onOpen,
  onAdvance,
  onBack,
  onEdit,
}: {
  job: JobRow;
  onOpen: () => void;
  onAdvance: () => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const next = nextJobStatus(job.status);
  const NextIcon = next ? JOB_META[next].icon : null;
  const patientName = job.patient_name ?? t("sales.walkIn");

  return (
    <Card
      className="cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/30"
      onClick={onOpen}
    >
      <div className="flex flex-wrap items-center gap-3">
        <PatientAvatar name={patientName} className="size-11" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{patientName}</span>
            <JobStatusPill status={job.status} />
            {!!job.overdue && (
              <StatusPill
                tone="danger"
                icon={AlertTriangle}
                label={t("jobs.late")}
              />
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t("jobs.orderNumber", { id: job.id })}
            {job.invoice_number ? ` · ${job.invoice_number}` : ""}
            {job.lab ? ` · ${job.lab}` : ""}
            {job.expected_ready
              ? ` · ${t("jobs.expected")}: ${formatDate(job.expected_ready)}`
              : ""}
          </p>
          {/* Ready = call the client: surface the phone right on the card. */}
          {job.status === "ready" && (
            <p className="mt-1 flex items-center gap-2">
              <Phone className="text-success size-4 shrink-0" />
              {job.patient_phone ? (
                <span dir="ltr" className="text-lg font-bold tabular-nums">
                  {job.patient_phone}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t("jobs.noPhone")}
                </span>
              )}
            </p>
          )}
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {next && NextIcon && (
            <Button className="h-11" onClick={onAdvance}>
              <NextIcon className="size-4" />
              {t(ACTION_LABEL[next] ?? "")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t("common.actions")}
              >
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>
                {t("jobs.open")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                {t("dlg.editJob")}
              </DropdownMenuItem>
              {prevJobStatus(job.status) && (
                <DropdownMenuItem onSelect={onBack}>
                  {t("jobs.moveBack")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
