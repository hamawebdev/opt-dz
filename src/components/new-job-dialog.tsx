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
import { SearchSelect } from "@/components/search-select";
import { ManageSelect } from "@/components/manage-select";
import { usePatients } from "@/hooks/use-patients";
import { useCreateJob, useLabNames } from "@/hooks/use-jobs";
import { todayISO } from "@/lib/format";

interface NewJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fills and locks context when opened from a sale (walk-in sales pass
   * saleId with no patientId — the patient then stays optional). */
  defaults?: {
    patientId?: number;
    saleId?: number;
    prescriptionId?: number;
  };
  onCreated?: (jobId: number) => void;
}

/** Manual "New lab order" entry point (auto-creation from lens sales stays). */
export function NewJobDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: NewJobDialogProps) {
  const { t } = useTranslation();
  const { data: patients } = usePatients();
  const { data: labNames } = useLabNames();
  const create = useCreateJob();

  const [patientId, setPatientId] = useState<string | null>(null);
  const [lab, setLab] = useState<string | null>(null);
  // Lab names typed in this dialog, so the picker can display them before any
  // job carrying them is saved.
  const [createdLabs, setCreatedLabs] = useState<string[]>([]);
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPatientId(defaults?.patientId ? String(defaults.patientId) : null);
    setLab(null);
    setCreatedLabs([]);
    setExpected("");
    setNotes("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, defaults?.patientId]);

  const patientOptions = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: `${p.code ?? ""} ${p.phone ?? ""}`,
      })),
    [patients],
  );

  const labOptions = useMemo(() => {
    const names = new Set([...(labNames ?? []), ...createdLabs]);
    return [...names].map((name) => ({ value: name, label: name }));
  }, [labNames, createdLabs]);

  async function handleSave() {
    // A job needs someone to hand the glasses to: a patient, unless it hangs
    // off a walk-in sale.
    if (!patientId && !defaults?.saleId) {
      toast.error(t("appointments.patientRequired"));
      return;
    }
    try {
      const id = await create.mutateAsync({
        patient_id: patientId ? Number(patientId) : null,
        sale_id: defaults?.saleId ?? null,
        prescription_id: defaults?.prescriptionId ?? null,
        lab,
        expected_ready: expected || null,
        notes: notes.trim() || null,
      });
      toast.success(t("jobs.orderCreated"));
      onOpenChange(false);
      if (id) onCreated?.(id);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("jobs.newOrder")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>{t("jobs.chooseClient")}</Label>
            <SearchSelect
              options={patientOptions}
              value={patientId}
              onChange={setPatientId}
              placeholder={t("appointments.selectPatient")}
              disabled={defaults?.patientId != null}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("jobs.labOptional")}</Label>
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
            <Label htmlFor="job_expected">{t("jobs.expectedOptional")}</Label>
            <Input
              id="job_expected"
              type="date"
              min={todayISO()}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="job_notes">{t("common.notes")}</Label>
            <Textarea
              id="job_notes"
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
          <Button onClick={handleSave} disabled={create.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
