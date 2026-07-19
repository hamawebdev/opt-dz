import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Merge,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { ColorSwatch } from "@/components/color-swatch";
import {
  useColors,
  useColorReview,
  useColorUsageCounts,
  useCreateColor,
  useUpdateColor,
  useSetColorArchived,
  useMergeColor,
  useResolveColorReview,
} from "@/hooks/use-colors";
import type { Color } from "@/types";
import type { ColorInput } from "@/db/colors";

export default function ColorsManagerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: colors } = useColors(true); // include archived in the manager
  const { data: usage } = useColorUsageCounts();
  const archive = useSetColorArchived();

  const [editing, setEditing] = useState<Color | null>(null);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState<Color | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.settings")}
      </Button>

      <ColorImportReview />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("colors.manageTitle")}</CardTitle>
            <CardDescription>{t("colors.manageDesc")}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> {t("colors.add")}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t("colors.name")}</TableHead>
                <TableHead>{t("colors.fr")}</TableHead>
                <TableHead>{t("colors.ar")}</TableHead>
                <TableHead className="text-right">
                  {t("colors.usage")}
                </TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(colors ?? []).map((c) => (
                <TableRow key={c.id} className={c.archived ? "opacity-50" : ""}>
                  <TableCell>
                    <ColorSwatch hex={c.hex} className="size-5" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.archived ? (
                      <Badge variant="outline" className="ms-2">
                        {t("common.archived")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.name_fr ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.name_ar ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usage?.[c.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMerging(c)}
                        disabled={!!c.archived}
                      >
                        <Merge className="size-4" /> {t("colors.merge")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="size-4" /> {t("common.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          archive.mutate({ id: c.id, archived: !c.archived })
                        }
                      >
                        {c.archived ? (
                          <>
                            <ArchiveRestore className="size-4" />{" "}
                            {t("common.unarchive")}
                          </>
                        ) : (
                          <>
                            <Archive className="size-4" /> {t("common.archive")}
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ColorEditDialog
        open={creating || editing != null}
        color={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <MergeColorDialog
        source={merging}
        colors={(colors ?? []).filter((c) => !c.archived)}
        onClose={() => setMerging(null)}
      />
    </div>
  );
}

/** Add / edit a colour: canonical name + FR/AR translations + hex swatch. */
function ColorEditDialog({
  open,
  color,
  onClose,
}: {
  open: boolean;
  color: Color | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateColor();
  const update = useUpdateColor();

  const [form, setForm] = useState<ColorInput>({ name: "" });
  // Re-seed the form whenever the dialog opens for a different row (render-phase
  // sync per the React "adjusting state on prop change" pattern).
  const key = `${open}-${color?.id ?? "new"}`;
  const [seedKey, setSeedKey] = useState("");
  if (open && seedKey !== key) {
    setSeedKey(key);
    setForm({
      name: color?.name ?? "",
      name_fr: color?.name_fr ?? "",
      name_ar: color?.name_ar ?? "",
      hex: color?.hex ?? "",
      sort_order: color?.sort_order ?? 0,
    });
  }

  async function save() {
    if (!form.name.trim()) return;
    try {
      if (color) await update.mutateAsync({ id: color.id, input: form });
      else await create.mutateAsync(form);
      toast.success(t("colors.saved"));
      onClose();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {color ? t("colors.editTitle") : t("colors.add")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t("colors.name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("colors.fr")}</Label>
              <Input
                value={form.name_fr ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name_fr: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("colors.ar")}</Label>
              <Input
                dir="rtl"
                value={form.name_ar ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name_ar: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("colors.swatch")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-9 cursor-pointer rounded border bg-transparent"
                value={form.hex || "#000000"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hex: e.target.value }))
                }
              />
              <Input
                placeholder="#RRGGBB"
                value={form.hex ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hex: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, hex: "" }))}
              >
                {t("colors.noSwatch")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={create.isPending || update.isPending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Merge a duplicate colour into another; re-points all references then archives it. */
function MergeColorDialog({
  source,
  colors,
  onClose,
}: {
  source: Color | null;
  colors: Color[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const merge = useMergeColor();
  const [target, setTarget] = useState<string>("");

  const candidates = colors.filter((c) => c.id !== source?.id);

  async function run() {
    if (!source || !target) return;
    try {
      await merge.mutateAsync({ fromId: source.id, intoId: Number(target) });
      toast.success(t("colors.merged"));
      setTarget("");
      onClose();
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Dialog open={source != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("colors.mergeTitle", { name: source?.name })}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>{t("colors.mergeInto")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder={t("colors.pick")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={run} disabled={!target || merge.isPending}>
            {t("colors.merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One-time cleanup of free-text colours the v18 migration couldn't auto-map. */
function ColorImportReview() {
  const { t } = useTranslation();
  const { data: rows } = useColorReview();
  const { data: colors } = useColors();
  const resolve = useResolveColorReview();

  if (!rows?.length) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle>{t("colors.reviewTitle")}</CardTitle>
        <CardDescription>{t("colors.reviewDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.raw_value}
            className="flex items-center justify-between gap-3 rounded-md border p-2"
          >
            <div className="min-w-0">
              <span className="font-medium">{r.raw_value}</span>
              <Badge variant="secondary" className="ms-2">
                {r.count}
              </Badge>
            </div>
            <Select
              onValueChange={(v) =>
                resolve.mutate({ rawValue: r.raw_value, colorId: Number(v) })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t("colors.mapTo")} />
              </SelectTrigger>
              <SelectContent>
                {(colors ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
