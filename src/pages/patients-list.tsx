import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Phone,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { PatientAvatar } from "@/components/patient-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  FacetFilters,
  facetSelectionToFilters,
  type FacetSelection,
} from "@/components/facet-filters";
import { useArchivePatient, usePatients } from "@/hooks/use-patients";
import { usePatientFacetAttributes } from "@/hooks/use-attributes";
import { formatDate } from "@/lib/format";

export default function PatientsListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({});
  const [toDelete, setToDelete] = useState<number | null>(null);
  const { data: facetAttributes } = usePatientFacetAttributes();
  const filters = useMemo(
    () => ({
      search,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      attributes: facetSelectionToFilters(facets),
    }),
    [search, dateFrom, dateTo, facets],
  );
  const patientsQuery = usePatients(filters);
  const { data: patients, isLoading } = patientsQuery;
  const del = useArchivePatient();
  const navigate = useNavigate();

  async function handleDelete() {
    if (toDelete == null) return;
    try {
      await del.mutateAsync(toDelete);
      toast.success(t("patients.archived"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder={t("patients.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
          </div>
          <Button
            variant={showAdvanced ? "secondary" : "outline"}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <SlidersHorizontal className="size-4" /> {t("patients.advanced")}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/patients/import">
              <Upload className="size-4" /> {t("import.title")}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/patients/new">
              <Plus className="size-4" /> {t("patients.newPatient")}
            </Link>
          </Button>
        </div>
      </div>

      {showAdvanced && (
        <Card className="flex flex-wrap items-end gap-4 p-4">
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("patients.addedFrom")}
            </span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("patients.addedTo")}
            </span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              {t("common.clear")}
            </Button>
          )}
          {!!facetAttributes?.length && (
            <div className="w-full">
              <FacetFilters
                attributes={facetAttributes}
                value={facets}
                onChange={setFacets}
              />
            </div>
          )}
        </Card>
      )}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("patients.dateOfBirth")}</TableHead>
              <TableHead>{t("patients.added")}</TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : patientsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <ErrorState
                    className="border-0"
                    onRetry={() => patientsQuery.refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : !patients?.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-10 text-center"
                >
                  {search ? t("patients.noMatch") : t("patients.empty")}
                </TableCell>
              </TableRow>
            ) : (
              patients.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/patients/${p.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-3">
                      <PatientAvatar name={p.full_name} photo={p.photo} />
                      <span>
                        {p.full_name}
                        {p.code && (
                          <span className="text-muted-foreground ms-2 text-xs">
                            {p.code}
                          </span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="text-muted-foreground size-3.5" />{" "}
                        {p.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(p.date_of_birth)}</TableCell>
                  <TableCell>{formatDate(p.created_at)}</TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/patients/${p.id}`}>
                          <Eye className="size-4" /> {t("common.view")}
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/patients/${p.id}/edit`}>
                          <Pencil className="size-4" /> {t("common.edit")}
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setToDelete(p.id)}
                      >
                        <Trash2 className="size-4" /> {t("common.delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("patients.archiveTitle")}
        description={t("patients.archiveDesc")}
        confirmText={t("patients.archive")}
        onConfirm={handleDelete}
      />
    </div>
  );
}
