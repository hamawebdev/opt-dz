import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import {
  isSphere,
  isCylinder,
  isAxis,
  isAddition,
  isPd,
  isBaseDir,
} from "@/lib/validators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/help-hint";
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
import { useCreatePrescription } from "@/hooks/use-patients";

interface PrescriptionDialogProps {
  patientId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the prescriber (e.g. the appointment's optometrist). */
  defaultPrescriber?: string;
  /** Called with the new prescription id after a successful save (exam loop). */
  onSaved?: (prescriptionId: number) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Parses a numeric input to number|null (blank/invalid -> null). */
function num(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

type EyeKey = "r" | "l";
// Numeric per-eye fields shown in the main grid.
const numFields = [
  "sphere",
  "cylinder",
  "axis",
  "add",
  "pd",
  "prism",
  "seg",
] as const;
type NumField = (typeof numFields)[number];
const numLabels: Record<NumField, string> = {
  sphere: "SPH",
  cylinder: "CYL",
  axis: "AXIS",
  add: "ADD",
  pd: "PD",
  prism: "PRISM",
  seg: "SEG",
};

// Plain-language one-liner behind a "?" next to each cryptic column header.
const numHelpKeys: Record<NumField | "base", string> = {
  sphere: "help.rxSphere",
  cylinder: "help.rxCylinder",
  axis: "help.rxAxis",
  add: "help.rxAdd",
  pd: "help.rxPd",
  prism: "help.rxPrism",
  seg: "help.rxSeg",
  base: "help.rxBase",
};

type EyeState = Record<NumField, string> & { base: string };
const emptyEye = (): EyeState => ({
  sphere: "",
  cylinder: "",
  axis: "",
  add: "",
  pd: "",
  prism: "",
  seg: "",
  base: "",
});

// Which fields failed validation, so each offending input can be marked in red
// instead of one vague toast over ~30 numeric cells.
type InvalidMap = Partial<Record<NumField | "base", boolean>>;
const hasInvalid = (m: InvalidMap) => Object.values(m).some(Boolean);
function eyeInvalid(s: EyeState): InvalidMap {
  return {
    sphere: !isSphere(s.sphere),
    cylinder: !isCylinder(s.cylinder),
    axis: !isAxis(s.axis),
    add: !isAddition(s.add),
    pd: !isPd(s.pd),
    base: !isBaseDir(s.base),
  };
}

export function PrescriptionDialog({
  patientId,
  open,
  onOpenChange,
  defaultPrescriber,
  onSaved,
}: PrescriptionDialogProps) {
  const { t } = useTranslation();
  const [examDate, setExamDate] = useState(today());
  const [right, setRight] = useState<EyeState>(emptyEye());
  const [left, setLeft] = useState<EyeState>(emptyEye());
  const [lensType, setLensType] = useState("none");
  const [prescriber, setPrescriber] = useState(defaultPrescriber ?? "");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [invalidR, setInvalidR] = useState<InvalidMap>({});
  const [invalidL, setInvalidL] = useState<InvalidMap>({});
  const create = useCreatePrescription();

  function reset() {
    setExamDate(today());
    setRight(emptyEye());
    setLeft(emptyEye());
    setLensType("none");
    setPrescriber("");
    setExpiry("");
    setNotes("");
    setInvalidR({});
    setInvalidL({});
  }

  function setEye(eye: EyeKey, key: keyof EyeState, value: string) {
    const setter = eye === "r" ? setRight : setLeft;
    setter((prev) => ({ ...prev, [key]: value }));
    // Editing a highlighted field clears its mark until the next save attempt.
    const setInv = eye === "r" ? setInvalidR : setInvalidL;
    setInv((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  }

  async function handleSave() {
    // Optical sanity check before anything reaches the lab (audit finding G1).
    const invR = eyeInvalid(right);
    const invL = eyeInvalid(left);
    setInvalidR(invR);
    setInvalidL(invL);
    if (hasInvalid(invR) || hasInvalid(invL)) {
      toast.error(t("prescription.invalidValues"));
      return;
    }
    try {
      const newId = await create.mutateAsync({
        patient_id: patientId,
        exam_date: examDate || today(),
        r_sphere: num(right.sphere),
        r_cylinder: num(right.cylinder),
        r_axis: num(right.axis),
        r_add: num(right.add),
        r_pd: num(right.pd),
        r_prism: num(right.prism),
        r_base: right.base.trim() || null,
        r_seg_height: num(right.seg),
        l_sphere: num(left.sphere),
        l_cylinder: num(left.cylinder),
        l_axis: num(left.axis),
        l_add: num(left.add),
        l_pd: num(left.pd),
        l_prism: num(left.prism),
        l_base: left.base.trim() || null,
        l_seg_height: num(left.seg),
        lens_type: lensType === "none" ? null : lensType,
        prescriber: prescriber.trim() || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
      });
      toast.success(t("prescription.added"));
      reset();
      onOpenChange(false);
      onSaved?.(newId);
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  function renderEyeRow(
    label: string,
    eye: EyeKey,
    state: EyeState,
    invalid: InvalidMap,
  ) {
    return (
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)_3rem] items-center gap-1.5">
        <span className="text-muted-foreground text-sm font-semibold">
          {label}
        </span>
        {numFields.map((f) => (
          <Input
            key={f}
            type="number"
            step="0.25"
            inputMode="decimal"
            aria-label={`${label} ${numLabels[f]}`}
            aria-invalid={invalid[f] || undefined}
            value={state[f]}
            onChange={(e) => setEye(eye, f, e.target.value)}
            className="h-9 px-1 text-center"
          />
        ))}
        <Input
          aria-label={`${label} base`}
          aria-invalid={invalid.base || undefined}
          value={state.base}
          onChange={(e) => setEye(eye, "base", e.target.value)}
          className="h-9 px-1 text-center"
          placeholder="BU"
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("prescription.title")}</DialogTitle>
          <DialogDescription>{t("prescription.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="grid w-44 gap-1.5">
              <Label htmlFor="exam_date">{t("prescription.examDate")}</Label>
              <Input
                id="exam_date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>
            <div className="grid w-48 gap-1.5">
              <Label htmlFor="lens_type">{t("prescription.lensType")}</Label>
              <Select value={lensType} onValueChange={setLensType}>
                <SelectTrigger id="lens_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="single-vision">
                    {t("prescription.singleVision")}
                  </SelectItem>
                  <SelectItem value="bifocal">
                    {t("prescription.bifocal")}
                  </SelectItem>
                  <SelectItem value="progressive">
                    {t("prescription.progressive")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-40 gap-1.5">
              <Label htmlFor="rx_expiry">{t("prescription.expiryDate")}</Label>
              <Input
                id="rx_expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[3.5rem_repeat(7,1fr)_3rem] gap-1.5">
              <span />
              {numFields.map((f) => (
                <span
                  key={f}
                  className="text-muted-foreground inline-flex items-center justify-center gap-0.5 text-center text-xs font-medium"
                >
                  {numLabels[f]}
                  <HelpHint text={t(numHelpKeys[f])} label={numLabels[f]} />
                </span>
              ))}
              <span className="text-muted-foreground inline-flex items-center justify-center gap-0.5 text-center text-xs font-medium">
                BASE
                <HelpHint text={t(numHelpKeys.base)} label="BASE" />
              </span>
            </div>
            {renderEyeRow(t("prescription.rightEye"), "r", right, invalidR)}
            {renderEyeRow(t("prescription.leftEye"), "l", left, invalidL)}
            <p className="text-muted-foreground text-xs">
              {t("prescription.legend")}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rx_prescriber">
              {t("prescription.prescriber")}
            </Label>
            <Input
              id="rx_prescriber"
              value={prescriber}
              onChange={(e) => setPrescriber(e.target.value)}
              placeholder={t("prescription.prescriberPlaceholder")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rx_notes">{t("common.notes")}</Label>
            <Textarea
              id="rx_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("prescription.notesPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {t("prescription.savePrescription")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
