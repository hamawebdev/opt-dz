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
import { ManageSelect } from "@/components/manage-select";
import { useLabNames, useUpdateJobDetails } from "@/hooks/use-jobs";
import type { Job } from "@/types";

interface JobDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Pick<Job, "id" | "lab" | "expected_ready" | "notes"> | null;
}

/** Edits a lab order's lab, expected-ready date and notes. */
export function JobDetailsDialog({
  open,
  onOpenChange,
  job,
}: JobDetailsDialogProps) {
  const { t } = useTranslation();
  const { data: labNames } = useLabNames();
  const update = useUpdateJobDetails();

  const [lab, setLab] = useState<string | null>(null);
  const [createdLabs, setCreatedLabs] = useState<string[]>([]);
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !job) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLab(job.lab);
    setCreatedLabs([]);
    setExpected(job.expected_ready ?? "");
    setNotes(job.notes ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, job]);

  const labOptions = useMemo(() => {
    // Include the job's current lab and any name typed in this dialog so the
    // picker can display them even before they exist on a saved job.
    const names = new Set(
      [...(labNames ?? []), ...createdLabs, job?.lab ?? ""].filter(Boolean),
    );
    return [...names].map((name) => ({ value: name, label: name }));
  }, [labNames, createdLabs, job?.lab]);

  async function handleSave() {
    if (!job) return;
    try {
      await update.mutateAsync({
        id: job.id,
        input: {
          lab,
          expected_ready: expected || null,
          notes: notes.trim() || null,
        },
      });
      toast.success(t("jobs.jobUpdated"));
      onOpenChange(false);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dlg.editJob")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>{t("dlg.labName")}</Label>
            <ManageSelect
              options={labOptions}
              value={lab}
              onChange={setLab}
              onCreate={async (name) => {
                setCreatedLabs((prev) => [...prev, name]);
                return name;
              }}
              addLabel={t("jobs.addLab")}
              placeholder={t("dlg.labName")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="jobd_expected">{t("dlg.expectedReady")}</Label>
            <Input
              id="jobd_expected"
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="jobd_notes">{t("common.notes")}</Label>
            <Textarea
              id="jobd_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
