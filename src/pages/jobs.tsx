import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PromptDialog } from "@/components/prompt-dialog";
import { JobStatusPill } from "@/components/status-pill";
import {
  useJobs,
  useUpdateJobStatus,
  useUpdateJobDetails,
} from "@/hooks/use-jobs";
import { formatDate } from "@/lib/format";
import { notifyError } from "@/lib/errors";
import type { JobStatus } from "@/types";

const JOB_STATUSES: JobStatus[] = [
  "ordered",
  "at_lab",
  "edging",
  "ready",
  "collected",
];

interface EditingJob {
  id: number;
  lab: string | null;
  expected_ready: string | null;
  notes: string | null;
}

export default function JobsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"active" | "all" | JobStatus>("active");
  const [editing, setEditing] = useState<EditingJob | null>(null);
  const { data: jobs } = useJobs(
    filter === "active"
      ? { activeOnly: true }
      : filter === "all"
        ? {}
        : { status: filter },
  );
  const setStatus = useUpdateJobStatus();
  const setDetails = useUpdateJobDetails();

  async function advance(id: number, status: JobStatus) {
    try {
      await setStatus.mutateAsync({ id, status });
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    }
  }

  async function saveDetails(values: Record<string, string>) {
    if (!editing) return;
    try {
      await setDetails.mutateAsync({
        id: editing.id,
        input: {
          lab: values.lab.trim() || null,
          expected_ready: values.expected_ready.trim() || null,
          notes: editing.notes,
        },
      });
      toast.success(t("jobs.jobUpdated"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{t("jobs.title")}</CardTitle>
          <CardDescription>{t("jobs.description")}</CardDescription>
        </div>
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("jobs.active")}</SelectItem>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`jobStatus.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!jobs?.length ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("jobs.noJobs")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.patient")}</TableHead>
                <TableHead>{t("common.invoice")}</TableHead>
                <TableHead>{t("jobs.lab")}</TableHead>
                <TableHead>{t("jobs.expected")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">
                  {t("common.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/patients/${j.patient_id}`}
                      className="hover:underline"
                    >
                      {j.patient_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {j.sale_id ? (
                      <Link
                        to={`/sales/${j.sale_id}`}
                        className="hover:underline"
                      >
                        {j.invoice_number ?? `#${j.sale_id}`}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{j.lab ?? "—"}</TableCell>
                  <TableCell>
                    {j.expected_ready ? formatDate(j.expected_ready) : "—"}
                  </TableCell>
                  <TableCell>
                    <JobStatusPill status={j.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={j.status}
                        onValueChange={(v) => advance(j.id, v as JobStatus)}
                      >
                        <SelectTrigger className="h-10 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`jobStatus.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: j.id,
                            lab: j.lab,
                            expected_ready: j.expected_ready,
                            notes: j.notes,
                          })
                        }
                      >
                        {t("common.edit")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PromptDialog
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t("dlg.editJob")}
        confirmText={t("common.save")}
        fields={[
          { name: "lab", label: t("dlg.labName"), placeholder: t("jobs.lab") },
          {
            name: "expected_ready",
            label: t("dlg.expectedReady"),
            type: "date",
          },
        ]}
        initial={{
          lab: editing?.lab ?? "",
          expected_ready: editing?.expected_ready ?? "",
        }}
        onSubmit={saveDetails}
      />
    </Card>
  );
}
