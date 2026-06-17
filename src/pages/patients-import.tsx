import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { parseCsv, downloadFile } from "@/lib/csv";
import { isEmail, isNin, isPhone } from "@/lib/validators";
import { createPatient, findPatientDuplicates } from "@/db/patients";
import type { PatientInput } from "@/db/patients";
import { useQueryClient } from "@tanstack/react-query";

const COLUMNS = [
  "full_name",
  "phone",
  "phone2",
  "email",
  "national_id",
  "date_of_birth",
  "address",
  "notes",
] as const;
type Col = (typeof COLUMNS)[number];

// Accepted header aliases → canonical column.
const ALIASES: Record<string, Col> = {
  name: "full_name",
  full_name: "full_name",
  nom: "full_name",
  phone: "phone",
  tel: "phone",
  telephone: "phone",
  phone2: "phone2",
  mobile: "phone2",
  email: "email",
  nin: "national_id",
  national_id: "national_id",
  dob: "date_of_birth",
  date_of_birth: "date_of_birth",
  birth: "date_of_birth",
  address: "address",
  adresse: "address",
  notes: "notes",
};

interface PreviewRow {
  input: PatientInput;
  errors: string[];
  duplicate: boolean;
}

export default function PatientsImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [importing, setImporting] = useState(false);

  function downloadTemplate() {
    downloadFile("clients-template.csv", `${COLUMNS.join(",")}\n`);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const grid = parseCsv(text);
    if (!grid.length) {
      toast.error(t("import.empty"));
      return;
    }
    const header = grid[0].map((h) => h.trim().toLowerCase());
    const colIndex: Partial<Record<Col, number>> = {};
    header.forEach((h, i) => {
      const col = ALIASES[h];
      if (col && colIndex[col] === undefined) colIndex[col] = i;
    });
    if (colIndex.full_name === undefined) {
      toast.error(t("import.missingName"));
      return;
    }

    const get = (r: string[], c: Col) =>
      colIndex[c] !== undefined ? (r[colIndex[c]!] ?? "").trim() : "";

    const preview: PreviewRow[] = [];
    for (const r of grid.slice(1)) {
      const input: PatientInput = {
        full_name: get(r, "full_name"),
        phone: get(r, "phone") || null,
        phone2: get(r, "phone2") || null,
        email: get(r, "email") || null,
        national_id: get(r, "national_id") || null,
        date_of_birth: get(r, "date_of_birth") || null,
        address: get(r, "address") || null,
        notes: get(r, "notes") || null,
      };
      const errors: string[] = [];
      if (!input.full_name) errors.push(t("validation.nameRequired"));
      if (!isPhone(input.phone ?? ""))
        errors.push(t("validation.invalidPhone"));
      if (!isPhone(input.phone2 ?? ""))
        errors.push(t("validation.invalidPhone"));
      if (!isEmail(input.email ?? ""))
        errors.push(t("validation.invalidEmail"));
      if (!isNin(input.national_id ?? ""))
        errors.push(t("validation.invalidNationalId"));
      const dups = errors.length
        ? []
        : await findPatientDuplicates(
            input.phone ?? null,
            input.national_id ?? null,
          );
      preview.push({ input, errors, duplicate: dups.length > 0 });
    }
    setRows(preview);
  }

  const importable = rows.filter(
    (r) => !r.errors.length && (includeDuplicates || !r.duplicate),
  );

  async function runImport() {
    setImporting(true);
    let ok = 0;
    try {
      for (const r of importable) {
        await createPatient(r.input);
        ok++;
      }
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(t("import.done", { count: ok }));
      navigate("/patients");
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/patients")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.patients")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t("import.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("import.help")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" /> {t("import.template")}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> {t("import.choose")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
            />
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              {t("import.summary", {
                total: rows.length,
                ok: importable.length,
              })}
            </div>
            <div className="flex items-center gap-3">
              <Label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={includeDuplicates}
                  onCheckedChange={(v) => setIncludeDuplicates(v === true)}
                />
                {t("import.includeDuplicates")}
              </Label>
              <Button
                onClick={runImport}
                disabled={importing || !importable.length}
              >
                {t("import.import", { count: importable.length })}
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("patients.fullName")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("patients.nationalId")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {r.input.full_name || "—"}
                  </TableCell>
                  <TableCell>{r.input.phone || "—"}</TableCell>
                  <TableCell>{r.input.national_id || "—"}</TableCell>
                  <TableCell>
                    {r.errors.length ? (
                      <span className="text-destructive flex items-center gap-1 text-xs">
                        <AlertCircle className="size-3.5" />
                        {r.errors.join(", ")}
                      </span>
                    ) : r.duplicate ? (
                      <Badge variant="secondary">
                        {t("patients.duplicateTitle")}
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="size-3.5" />{" "}
                        {t("import.ready")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
