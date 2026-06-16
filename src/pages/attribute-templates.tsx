import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Pencil, Archive } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useAttributeDefs,
  useAllAttributeTargets,
  useAttributeTargets,
  useCreateAttributeDef,
  useUpdateAttributeDef,
  useSetAttributeArchived,
  useSetAttributeTargets,
} from "@/hooks/use-attributes";
import { useCategories } from "@/hooks/use-taxonomy";
import { parseOptions, type AttributeTargetInput } from "@/db/attributes";
import type {
  AttributeDefinition,
  AttributeFieldType,
  ProductCategory,
} from "@/types";

const FIELD_TYPES: AttributeFieldType[] = [
  "text",
  "number",
  "select",
  "multiselect",
];
const OPTICAL_TYPES: ProductCategory[] = ["frame", "lens", "accessory"];

export default function AttributeTemplatesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: defs } = useAttributeDefs();
  const { data: allTargets } = useAllAttributeTargets();
  const setArchived = useSetAttributeArchived();

  const [editing, setEditing] = useState<AttributeDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  function targetSummary(id: number): string {
    const tgts = allTargets?.[id] ?? [];
    if (tgts.some((x) => x.target_kind === "patient"))
      return t("attributes.patientField");
    if (tgts.some((x) => x.target_kind === "global")) return t("attributes.global");
    const parts = tgts.map((x) =>
      x.target_kind === "type"
        ? t(`category.${x.target_value}`)
        : t("attributes.categoryN"),
    );
    return parts.join(", ") || "—";
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/settings")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.settings")}
      </Button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("attributes.title")}</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> {t("attributes.new")}
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("attributes.label")}</TableHead>
              <TableHead>{t("attributes.fieldType")}</TableHead>
              <TableHead>{t("attributes.appliesTo")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!defs?.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("attributes.noAttributes")}
                </TableCell>
              </TableRow>
            ) : (
              defs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {d.label}
                      {d.is_builtin ? (
                        <Badge variant="outline">{t("attributes.builtin")}</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>{t(`attributes.${d.field_type}`)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {targetSummary(d.id)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.edit")}
                        onClick={() => setEditing(d)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.archive")}
                        onClick={async () => {
                          await setArchived.mutateAsync({
                            id: d.id,
                            archived: true,
                          });
                          toast.success(t("common.archived"));
                        }}
                      >
                        <Archive className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {(creating || editing) && (
        <AttributeDialog
          def={editing}
          open={creating || editing != null}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AttributeDialog({
  def,
  open,
  onClose,
}: {
  def: AttributeDefinition | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAttributeDef();
  const update = useUpdateAttributeDef();
  const setTargets = useSetAttributeTargets();
  const { data: categories } = useCategories();
  const { data: existingTargets } = useAttributeTargets(def?.id);

  const [label, setLabel] = useState(def?.label ?? "");
  const [key, setKey] = useState(def?.key ?? "");
  const [fieldType, setFieldType] = useState<AttributeFieldType>(
    def?.field_type ?? "text",
  );
  const [unit, setUnit] = useState(def?.unit ?? "");
  const [optionsText, setOptionsText] = useState(
    def ? parseOptions(def).join(", ") : "",
  );
  const [filterable, setFilterable] = useState(
    def ? def.is_filterable === 1 : true,
  );
  const [global, setGlobal] = useState(false);
  const [patient, setPatient] = useState(false);
  const [types, setTypes] = useState<Set<ProductCategory>>(new Set());
  const [catIds, setCatIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!existingTargets) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setGlobal(existingTargets.some((x) => x.target_kind === "global"));
    setPatient(existingTargets.some((x) => x.target_kind === "patient"));
    setTypes(
      new Set(
        existingTargets
          .filter((x) => x.target_kind === "type")
          .map((x) => x.target_value as ProductCategory),
      ),
    );
    setCatIds(
      new Set(
        existingTargets
          .filter((x) => x.target_kind === "category")
          .map((x) => Number(x.target_value)),
      ),
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [existingTargets]);

  const needsOptions = fieldType === "select" || fieldType === "multiselect";
  const autoKey = useMemo(
    () =>
      label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    [label],
  );

  async function save() {
    if (!label.trim()) return;
    const finalKey = (key.trim() || autoKey).trim();
    if (!finalKey) {
      toast.error(t("attributes.keyRequired"));
      return;
    }
    const options = needsOptions
      ? optionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const input = {
      key: finalKey,
      label: label.trim(),
      field_type: fieldType,
      unit: fieldType === "number" ? unit.trim() || null : null,
      options,
      is_filterable: filterable,
      sort_order: def?.sort_order ?? 100,
    };
    const targets: AttributeTargetInput[] = patient
      ? [{ target_kind: "patient", target_value: null }]
      : global
        ? [{ target_kind: "global", target_value: null }]
        : [
            ...[...types].map((tp) => ({
              target_kind: "type" as const,
              target_value: tp,
            })),
            ...[...catIds].map((id) => ({
              target_kind: "category" as const,
              target_value: String(id),
            })),
          ];
    try {
      const id = def
        ? (await update.mutateAsync({ id: def.id, input }), def.id)
        : await create.mutateAsync(input);
      await setTargets.mutateAsync({ id, targets });
      toast.success(t("attributes.saved"));
      onClose();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {def ? t("attributes.edit") : t("attributes.new")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="a_label">{t("attributes.label")}</Label>
              <Input
                id="a_label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="a_key">{t("attributes.key")}</Label>
              <Input
                id="a_key"
                value={key}
                placeholder={autoKey}
                onChange={(e) => setKey(e.target.value)}
                disabled={def?.is_builtin === 1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("attributes.fieldType")}</Label>
              <Select
                value={fieldType}
                onValueChange={(v) => setFieldType(v as AttributeFieldType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {t(`attributes.${ft}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldType === "number" && (
              <div className="grid gap-1.5">
                <Label htmlFor="a_unit">{t("attributes.unit")}</Label>
                <Input
                  id="a_unit"
                  value={unit}
                  placeholder="mm"
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            )}
          </div>

          {needsOptions && (
            <div className="grid gap-1.5">
              <Label htmlFor="a_opts">{t("attributes.options")}</Label>
              <Input
                id="a_opts"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={t("attributes.optionsHint")}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="a_filter">{t("attributes.filterable")}</Label>
            <Switch
              id="a_filter"
              checked={filterable}
              onCheckedChange={setFilterable}
            />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label>{t("attributes.patientField")}</Label>
              <Switch checked={patient} onCheckedChange={setPatient} />
            </div>
            {!patient && (
              <div className="flex items-center justify-between">
                <Label>{t("attributes.global")}</Label>
                <Switch checked={global} onCheckedChange={setGlobal} />
              </div>
            )}
            {!patient && !global && (
              <>
                <div className="text-muted-foreground text-xs">
                  {t("attributes.appliesTo")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {OPTICAL_TYPES.map((tp) => {
                    const on = types.has(tp);
                    return (
                      <Button
                        key={tp}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() =>
                          setTypes((prev) => {
                            const n = new Set(prev);
                            if (on) n.delete(tp);
                            else n.add(tp);
                            return n;
                          })
                        }
                      >
                        {t(`category.${tp}`)}
                      </Button>
                    );
                  })}
                  {categories?.map((c) => {
                    const on = catIds.has(c.id);
                    return (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={on ? "secondary" : "outline"}
                        onClick={() =>
                          setCatIds((prev) => {
                            const n = new Set(prev);
                            if (on) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                      >
                        {c.name}
                      </Button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
