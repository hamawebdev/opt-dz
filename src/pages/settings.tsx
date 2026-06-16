import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { platform, version } from "@tauri-apps/plugin-os";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { format } from "date-fns";
import {
  Upload,
  Trash2,
  FolderOpen,
  Download,
  Save as SaveIcon,
  Plus,
  Pencil,
  Archive,
  SlidersHorizontal,
  Palette,
  Receipt as ReceiptIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/use-app-store";
import { useSaveSettings, useSettings } from "@/hooks/use-settings";
import {
  useBrandRows,
  useCategories,
  useCreateBrand,
  useCreateCategory,
  useSetBrandArchived,
  useSetCategoryArchived,
  useUpdateBrand,
  useUpdateCategory,
} from "@/hooks/use-taxonomy";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PromptDialog } from "@/components/prompt-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { notifyError } from "@/lib/errors";
import { getDb, unwrap } from "@/lib/db";
import { commands } from "@/lib/bindings";
import { toCentimes, fromCentimes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ShopSettings } from "@/types";
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n";

const themes = ["light", "dark", "system"] as const;
const themeLabelKey: Record<(typeof themes)[number], string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};
const languageLabel: Record<Language, string> = {
  fr: "Français",
  ar: "العربية",
  en: "English",
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const { data: settings } = useSettings();

  // plugin-os exposes platform()/version() synchronously under Tauri.
  const osInfo = `${platform()} ${version()}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-4">
      {settings ? (
        <ShopInfoForm initial={settings} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.shopInformation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
          <CardDescription>{t("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {SUPPORTED_LANGUAGES.map((lng) => (
            <Button
              key={lng}
              variant={language === lng ? "default" : "outline"}
              onClick={() => setLanguage(lng)}
            >
              {languageLabel[lng]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance")}</CardTitle>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {themes.map((th) => (
            <Button
              key={th}
              variant={theme === th ? "default" : "outline"}
              onClick={() => setTheme(th)}
            >
              {t(themeLabelKey[th])}
            </Button>
          ))}
        </CardContent>
      </Card>

      <InterfaceModeSettings />

      {settings && <TaxInvoiceSettings settings={settings} />}

      {settings && <CatalogSettings settings={settings} />}

      {settings && <ReceiptPrinterSettings settings={settings} />}

      {settings && <RemindersSettings settings={settings} />}

      {settings && <DataBackupSection settings={settings} />}

      {import.meta.env.DEV && <DemoDataSection />}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.system")}</CardTitle>
          <CardDescription>{t("settings.systemDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{osInfo || "…"}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Simple/full interface mode toggle + optional sample data. Lowers cognitive
 * load for low-literacy staff (see UX review). */
function InterfaceModeSettings() {
  const { t } = useTranslation();
  const simpleMode = useAppStore((s) => s.simpleMode);
  const setSimpleMode = useAppStore((s) => s.setSimpleMode);
  const [busy, setBusy] = useState(false);

  async function addSampleData() {
    setBusy(true);
    try {
      const { seedDatabase } = await import("@/db/seed");
      await seedDatabase({ reset: false });
      toast.success(t("dlg.sampleLoaded"));
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      notifyError(err, t("dlg.sampleFailed"));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mode.label")}</CardTitle>
        <CardDescription>{t("mode.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-primary size-5 shrink-0" />
            <span className="font-medium">
              {simpleMode ? t("mode.on") : t("mode.off")}
            </span>
          </div>
          <Switch
            checked={simpleMode}
            onCheckedChange={setSimpleMode}
            aria-label={t("mode.use")}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("dlg.sampleData")}</Label>
          <p className="text-muted-foreground text-sm">
            {t("dlg.sampleDataDesc")}
          </p>
          <Button variant="outline" onClick={addSampleData} disabled={busy}>
            <Sparkles className="size-4" /> {t("dlg.loadSample")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** TVA, droit de timbre, and invoice-numbering configuration. */
function TaxInvoiceSettings({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  // Edited in display units (percent / dinars); persisted as basis points / centimes.
  const [tva, setTva] = useState(String(Number(settings.tva_rate) / 100));
  const [timbreRate, setTimbreRate] = useState(
    String(Number(settings.timbre_rate) / 100),
  );
  const [timbreMin, setTimbreMin] = useState(
    String(fromCentimes(Number(settings.timbre_min))),
  );
  const [timbreMax, setTimbreMax] = useState(
    String(fromCentimes(Number(settings.timbre_max))),
  );
  const [prefix, setPrefix] = useState(settings.invoice_prefix);
  const [padding, setPadding] = useState(settings.invoice_padding);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await save.mutateAsync({
        tva_rate: String(Math.round(Number(tva) * 100)),
        timbre_rate: String(Math.round(Number(timbreRate) * 100)),
        timbre_min: String(toCentimes(timbreMin)),
        timbre_max: String(toCentimes(timbreMax)),
        invoice_prefix: prefix.trim(),
        invoice_padding: String(Math.max(1, Math.floor(Number(padding) || 1))),
      });
      toast.success(t("settings.taxSaved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.taxInvoicing")}</CardTitle>
        <CardDescription>{t("settings.taxInvoicingDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tva">{t("settings.tvaRate")}</Label>
            <Input
              id="tva"
              type="number"
              min="0"
              step="0.01"
              value={tva}
              onChange={(e) => setTva(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timbre_rate">{t("settings.timbreRate")}</Label>
            <Input
              id="timbre_rate"
              type="number"
              min="0"
              step="0.01"
              value={timbreRate}
              onChange={(e) => setTimbreRate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timbre_min">{t("settings.timbreMin")}</Label>
            <Input
              id="timbre_min"
              type="number"
              min="0"
              value={timbreMin}
              onChange={(e) => setTimbreMin(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timbre_max">{t("settings.timbreMax")}</Label>
            <Input
              id="timbre_max"
              type="number"
              min="0"
              value={timbreMax}
              onChange={(e) => setTimbreMax(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv_prefix">{t("settings.invoicePrefix")}</Label>
            <Input
              id="inv_prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={t("settings.invoicePrefixPlaceholder")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv_padding">{t("settings.invoiceDigits")}</Label>
            <Input
              id="inv_padding"
              type="number"
              min="1"
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {t("settings.saveTaxSettings")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A compact add / rename / archive manager for a named taxonomy (categories/brands). */
function ManagedList({
  title,
  items,
  onCreate,
  onRename,
  onArchive,
}: {
  title: string;
  items: { id: number; name: string }[];
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: number, name: string) => Promise<unknown>;
  onArchive: (id: number) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(
    null,
  );

  async function add() {
    if (!name.trim()) return;
    try {
      await onCreate(name.trim());
      setName("");
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground text-xs">{title}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it.id} variant="secondary" className="gap-1 py-1 pe-1">
            {it.name}
            <button
              type="button"
              aria-label={t("settings.rename")}
              className="hover:text-foreground"
              onClick={() => setRenaming({ id: it.id, name: it.name })}
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              aria-label={t("common.archive")}
              className="hover:text-destructive"
              onClick={() => onArchive(it.id)}
            >
              <Archive className="size-3" />
            </button>
          </Badge>
        ))}
        {!items.length && (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={title}
        />
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> {t("common.add")}
        </Button>
      </div>

      <PromptDialog
        open={renaming != null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title={t("dlg.renameTitle")}
        fields={[{ name: "name", label: t("dlg.newName") }]}
        initial={{ name: renaming?.name ?? "" }}
        onSubmit={(values) => {
          const next = values.name.trim();
          if (next && renaming) void onRename(renaming.id, next);
        }}
      />
    </div>
  );
}

/** Catalog taxonomy management: categories, brands, attribute templates, expiry window. */
function CatalogSettings({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const { data: categories } = useCategories();
  const { data: brands } = useBrandRows();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const archiveCat = useSetCategoryArchived();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const archiveBrand = useSetBrandArchived();
  const [warnDays, setWarnDays] = useState(settings.expiry_warn_days);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.catalogManagement")}</CardTitle>
        <CardDescription>{t("settings.catalogManagementDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ManagedList
          title={t("settings.categories")}
          items={categories ?? []}
          onCreate={(n) => createCat.mutateAsync(n)}
          onRename={(id, n) => updateCat.mutateAsync({ id, name: n })}
          onArchive={(id) => archiveCat.mutateAsync({ id, archived: true })}
        />
        <ManagedList
          title={t("settings.brands")}
          items={brands ?? []}
          onCreate={(n) => createBrand.mutateAsync(n)}
          onRename={(id, n) => updateBrand.mutateAsync({ id, name: n })}
          onArchive={(id) => archiveBrand.mutateAsync({ id, archived: true })}
        />

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="warn_days">{t("settings.expiryWarnDays")}</Label>
            <Input
              id="warn_days"
              type="number"
              min="1"
              className="w-40"
              value={warnDays}
              onChange={(e) => setWarnDays(e.target.value)}
            />
          </div>
          <Button
            onClick={async () => {
              await save.mutateAsync({
                expiry_warn_days: String(
                  Math.max(1, Math.floor(Number(warnDays) || 30)),
                ),
              });
              toast.success(t("settings.settingsSaved"));
            }}
          >
            {t("common.save")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant="outline" asChild>
            <Link to="/settings/attributes">
              <SlidersHorizontal className="size-4" />{" "}
              {t("settings.attributeTemplates")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings/colors">
              <Palette className="size-4" /> {t("colors.manageTitle")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings/receipt">
              <ReceiptIcon className="size-4" />{" "}
              {t("settings.receiptCustomization")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Patient recall reminder interval. */
function RemindersSettings({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [months, setMonths] = useState(settings.recall_months);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await save.mutateAsync({
        recall_months: String(Math.max(1, Math.floor(Number(months) || 24))),
      });
      toast.success(t("settings.reminderSaved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.reminders")}</CardTitle>
        <CardDescription>{t("settings.remindersDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="recall_months">{t("settings.recallInterval")}</Label>
          <Input
            id="recall_months"
            type="number"
            min="1"
            className="w-40"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Thermal (ESC/POS) receipt printer configuration. */
function ReceiptPrinterSettings({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [target, setTarget] = useState(settings.receipt_target);
  const [width, setWidth] = useState(settings.receipt_width);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await save.mutateAsync({
        receipt_target: target.trim(),
        receipt_width: String(Math.max(24, Math.floor(Number(width) || 48))),
      });
      toast.success(t("settings.receiptPrinterSaved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.receiptPrinter")}</CardTitle>
        <CardDescription>
          {t("settings.receiptPrinterDesc", { path: "/dev/usb/lp0" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rcpt_target">{t("settings.devicePathQueue")}</Label>
            <Input
              id="rcpt_target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="/dev/usb/lp0"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rcpt_width">{t("settings.charsPerLine")}</Label>
            <Input
              id="rcpt_width"
              type="number"
              min="24"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {t("settings.savePrinter")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Renders a flat array of DB rows as CSV (RFC-4180-ish quoting). */
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
  ].join("\n");
}

/** Manual database backup/restore and CSV export. */
function DataBackupSection({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save_ = useSaveSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreSrc, setRestoreSrc] = useState<string | null>(null);

  async function chooseFolder() {
    const chosen = await open({
      directory: true,
      title: t("settings.chooseBackupFolder"),
    });
    if (!chosen || Array.isArray(chosen)) return;
    await save_.mutateAsync({ backup_dir: chosen });
    toast.success(t("settings.backupFolderUpdated"));
  }

  async function backupNow() {
    setBusy("backup");
    try {
      let dir = settings.backup_dir;
      if (!dir) {
        const chosen = await open({
          directory: true,
          title: t("settings.chooseBackupFolder"),
        });
        if (!chosen || Array.isArray(chosen)) return;
        dir = chosen;
        await save_.mutateAsync({ backup_dir: dir });
      }
      const dest = await join(
        dir,
        `optdz-backup-${format(new Date(), "yyyyMMdd-HHmmss")}.db`,
      );
      const path = unwrap(await commands.backupDatabase(dest));
      toast.success(t("settings.backupSaved", { path }));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function pickRestore() {
    const src = await open({
      title: t("settings.chooseBackupRestore"),
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (!src || Array.isArray(src)) return;
    // Confirm via a styled dialog instead of a native window.confirm.
    setRestoreSrc(src);
  }

  async function doRestore() {
    const src = restoreSrc;
    setRestoreSrc(null);
    if (!src) return;
    setBusy("restore");
    try {
      const safety = await join(
        await appConfigDir(),
        `app-pre-restore-${format(new Date(), "yyyyMMdd-HHmmss")}.db`,
      );
      unwrap(await commands.restoreDatabase(src, safety));
      toast.success(t("settings.databaseRestored"));
      await relaunch();
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
      setBusy(null);
    }
  }

  async function exportCsv(kind: "patients" | "products" | "sales") {
    setBusy(`csv-${kind}`);
    try {
      const db = await getDb();
      const query =
        kind === "patients"
          ? "SELECT * FROM patients ORDER BY id"
          : kind === "products"
            ? "SELECT * FROM products ORDER BY id"
            : `SELECT s.*, p.full_name AS patient_name
               FROM sales s JOIN patients p ON p.id = s.patient_id ORDER BY s.id`;
      const rows = await db.select<Record<string, unknown>[]>(query);
      if (!rows.length) {
        toast.info(t("settings.noToExport", { kind: t(`dataKind.${kind}`) }));
        return;
      }
      const dest = await save({
        defaultPath: `${kind}-${format(new Date(), "yyyyMMdd")}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!dest) return;
      unwrap(await commands.exportTextFile(dest, toCsv(rows)));
      toast.success(
        t("settings.exported", {
          count: rows.length,
          kind: t(`dataKind.${kind}`),
        }),
      );
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.dataBackups")}</CardTitle>
        <CardDescription>{t("settings.dataBackupsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1.5">
          <Label>{t("settings.backupFolder")}</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={settings.backup_dir || t("settings.backupNotSet")}
            />
            <Button variant="outline" onClick={chooseFolder}>
              <FolderOpen className="size-4" /> {t("common.change")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={backupNow} disabled={busy === "backup"}>
            <SaveIcon className="size-4" /> {t("settings.backupNow")}
          </Button>
          <Button
            variant="outline"
            onClick={pickRestore}
            disabled={busy === "restore"}
          >
            <Upload className="size-4" /> {t("settings.restoreFromFile")}
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-muted-foreground text-xs">
            {t("settings.exportToCsv")}
          </Label>
          <div className="flex flex-wrap gap-2">
            {(["patients", "products", "sales"] as const).map((k) => (
              <Button
                key={k}
                variant="secondary"
                size="sm"
                onClick={() => exportCsv(k)}
                disabled={busy === `csv-${k}`}
              >
                <Download className="size-4" /> {t(`dataKind.${k}`)}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={restoreSrc != null}
        onOpenChange={(o) => !o && setRestoreSrc(null)}
        title={t("settings.restoreFromFile")}
        description={t("settings.restoreConfirm")}
        confirmText={t("settings.restoreFromFile")}
        onConfirm={doRestore}
      />
    </Card>
  );
}

/** Dev-only demo-data seeder (stripped from production builds). Reuses the same
 * Rust transactional commands as the app, so seeded data honours every invariant.
 * See src/db/seed.ts. */
function DemoDataSection() {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(reset: boolean) {
    setBusy(reset ? "reset" : "seed");
    try {
      const { seedDatabase } = await import("@/db/seed");
      await seedDatabase({ reset });
      toast.success("Demo data seeded. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(`Seed failed: ${String(err)}`);
      setBusy(null);
    }
  }

  async function wipe() {
    if (!window.confirm("Delete ALL seeded data (patients, products, sales…)?")) return;
    setBusy("clear");
    try {
      const { clearSeedData } = await import("@/db/seed");
      await clearSeedData();
      toast.success("Seeded data cleared. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(`Clear failed: ${String(err)}`);
      setBusy(null);
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>Demo data (dev only)</CardTitle>
        <CardDescription>
          Generate a realistic Algerian-optician dataset: catalog, clients,
          prescriptions, appointments, sales, claims, lab jobs and returns. This
          card is removed from production builds.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => run(false)} disabled={busy != null}>
          {busy === "seed" ? "Seeding…" : "Seed demo data"}
        </Button>
        <Button
          variant="outline"
          onClick={() => run(true)}
          disabled={busy != null}
        >
          {busy === "reset" ? "Resetting…" : "Reset & reseed"}
        </Button>
        <Button variant="ghost" onClick={wipe} disabled={busy != null}>
          <Trash2 className="text-destructive size-4" /> Clear seeded data
        </Button>
      </CardContent>
    </Card>
  );
}

/** Editable shop-info form, seeded once from the loaded settings. */
function ShopInfoForm({ initial }: { initial: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [form, setForm] = useState<ShopSettings>(initial);
  const fileRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof ShopSettings>(
    key: K,
    value: ShopSettings[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.chooseImageFile"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("shop_logo", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    try {
      // Save only the shop-info keys so we never clobber tax/invoice/backup settings
      // edited in their own cards.
      await save.mutateAsync({
        shop_name: form.shop_name,
        shop_address: form.shop_address,
        shop_phone: form.shop_phone,
        shop_logo: form.shop_logo,
        currency_symbol: form.currency_symbol,
        invoice_footer: form.invoice_footer,
      });
      toast.success(t("settings.settingsSaved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.shopInformation")}</CardTitle>
        <CardDescription>{t("settings.shopInfoDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
            {form.shop_logo ? (
              <img
                src={form.shop_logo}
                alt={
                  form.shop_name
                    ? t("settings.logoAlt", { name: form.shop_name })
                    : t("settings.logoAltGeneric")
                }
                className="size-full object-contain"
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                {t("settings.noLogo")}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> {t("settings.uploadLogo")}
            </Button>
            {form.shop_logo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update("shop_logo", "")}
              >
                <Trash2 className="text-destructive size-4" />{" "}
                {t("common.remove")}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="shop_name">{t("settings.shopName")}</Label>
          <Input
            id="shop_name"
            value={form.shop_name}
            onChange={(e) => update("shop_name", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="shop_address">{t("common.address")}</Label>
          <Input
            id="shop_address"
            value={form.shop_address}
            onChange={(e) => update("shop_address", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="shop_phone">{t("common.phone")}</Label>
            <Input
              id="shop_phone"
              value={form.shop_phone}
              onChange={(e) => update("shop_phone", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="currency_symbol">
              {t("settings.currencySymbol")}
            </Label>
            <Input
              id="currency_symbol"
              value={form.currency_symbol}
              onChange={(e) => update("currency_symbol", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invoice_footer">{t("settings.invoiceFooter")}</Label>
          <Textarea
            id="invoice_footer"
            rows={2}
            value={form.invoice_footer}
            onChange={(e) => update("invoice_footer", e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={save.isPending}>
            {t("settings.saveSettings")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
