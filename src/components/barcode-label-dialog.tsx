import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings, useSaveSettings } from "@/hooks/use-settings";
import {
  renderBarcode,
  barcodeDataUrl,
  effectiveFormat,
  type BarcodeFormat,
} from "@/lib/barcode";
import { commands } from "@/lib/bindings";
import { unwrap } from "@/lib/db";
import { formatDZD } from "@/lib/format";
import type { LabelConfig, Product } from "@/types";

const DEFAULT_LABEL: LabelConfig = {
  format: "ean13",
  show_logo: false,
  show_name: true,
  show_price: true,
  show_sku: true,
  attribute_keys: [],
  width_mm: 50,
  height_mm: 30,
};

function parseLabelConfig(raw: string | undefined): LabelConfig {
  if (!raw) return DEFAULT_LABEL;
  try {
    return { ...DEFAULT_LABEL, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LABEL;
  }
}

/** The persistable shape of a label print job, read by the standalone print route. */
export interface LabelPrintJob {
  value: string;
  format: BarcodeFormat;
  name: string;
  price: string;
  sku: string;
  showLogo: boolean;
  logo: string;
  copies: number;
  widthMm: number;
  heightMm: number;
}

export function BarcodeLabelDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cfg, setCfg] = useState<LabelConfig>(() =>
    parseLabelConfig(settings?.label_config),
  );
  const [copies, setCopies] = useState("24");
  const [valid, setValid] = useState(true);

  const value = product?.barcode || product?.reference || "";
  // The chosen symbology may not be able to encode `value` (e.g. EAN-13 needs a
  // numeric GTIN); fall back to one that can so a barcode always renders.
  const renderFormat = effectiveFormat(cfg.format, value);
  const sym = settings?.currency_symbol;
  const priceText = product ? formatDZD(product.selling_price, sym) : "";

  const set = <K extends keyof LabelConfig>(k: K, v: LabelConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  // Live preview: re-render the barcode whenever inputs change.
  useEffect(() => {
    if (!open || !canvasRef.current || !value) return;
    const ok = renderBarcode(canvasRef.current, {
      value,
      format: renderFormat,
      includeText: renderFormat !== "qrcode",
    });
    setValid(ok);
  }, [open, value, renderFormat]);

  const job: LabelPrintJob = useMemo(
    () => ({
      value,
      format: renderFormat,
      name: cfg.show_name ? (product?.name ?? "") : "",
      price: cfg.show_price ? priceText : "",
      sku: cfg.show_sku ? (product?.reference ?? product?.barcode ?? "") : "",
      showLogo: cfg.show_logo,
      logo: cfg.show_logo ? (settings?.shop_logo ?? "") : "",
      copies: 1,
      widthMm: cfg.width_mm,
      heightMm: cfg.height_mm,
    }),
    [value, cfg, renderFormat, product, priceText, settings?.shop_logo],
  );

  function persistConfig() {
    saveSettings.mutate({ label_config: JSON.stringify(cfg) });
  }

  function printJob(copyCount: number) {
    if (!valid || !value) {
      toast.error(t("barcode.invalidValue"));
      return;
    }
    persistConfig();
    sessionStorage.setItem(
      "labelPrintJob",
      JSON.stringify({ ...job, copies: copyCount }),
    );
    navigate("/label/print");
  }

  async function exportPng() {
    const url = barcodeDataUrl({
      value,
      format: renderFormat,
      includeText: renderFormat !== "qrcode",
      scale: 4,
    });
    if (!url) {
      toast.error(t("barcode.invalidValue"));
      return;
    }
    const dest = await save({
      defaultPath: `label-${value}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!dest) return;
    const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(dest, bytes);
    toast.success(t("barcode.exported"));
  }

  async function printThermal() {
    if (!valid || !value) {
      toast.error(t("barcode.invalidValue"));
      return;
    }
    try {
      unwrap(
        await commands.printLabel({
          value,
          format: renderFormat,
          name: job.name,
          price: job.price,
          sku: job.sku,
        }),
      );
      toast.success(t("barcode.sentToPrinter"));
    } catch (err) {
      notifyError(err, t("problem.printFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("barcode.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Controls */}
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>{t("barcode.format")}</Label>
              <Select
                value={cfg.format}
                onValueChange={(v) => set("format", v as BarcodeFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ean13">EAN-13</SelectItem>
                  <SelectItem value="code128">Code 128</SelectItem>
                  <SelectItem value="qrcode">QR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(
              [
                ["show_logo", "barcode.showLogo"],
                ["show_name", "barcode.showName"],
                ["show_price", "barcode.showPrice"],
                ["show_sku", "barcode.showSku"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between">
                <Label htmlFor={k}>{t(label)}</Label>
                <Switch
                  id={k}
                  checked={cfg[k] as boolean}
                  onCheckedChange={(v) => set(k, v)}
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lbl_w">{t("barcode.widthMm")}</Label>
                <Input
                  id="lbl_w"
                  type="number"
                  min="20"
                  value={cfg.width_mm}
                  onChange={(e) => set("width_mm", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lbl_h">{t("barcode.heightMm")}</Label>
                <Input
                  id="lbl_h"
                  type="number"
                  min="15"
                  value={cfg.height_mm}
                  onChange={(e) => set("height_mm", Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4">
            {cfg.show_logo && settings?.shop_logo && (
              <img
                src={settings.shop_logo}
                alt=""
                className="max-h-8 object-contain"
              />
            )}
            {cfg.show_name && (
              <div className="text-sm font-medium">{product?.name}</div>
            )}
            {value ? (
              <canvas ref={canvasRef} className="max-w-full" />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("barcode.noValue")}
              </p>
            )}
            {!valid && (
              <p className="text-destructive text-xs">
                {t("barcode.invalidValue")}
              </p>
            )}
            {cfg.show_price && (
              <div className="text-sm font-semibold">{priceText}</div>
            )}
            {cfg.show_sku && product?.reference && (
              <div className="text-muted-foreground text-xs">
                {product.reference}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2 border-t pt-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lbl_copies" className="text-xs">
              {t("barcode.copies")}
            </Label>
            <Input
              id="lbl_copies"
              type="number"
              min="1"
              className="h-9 w-24"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={exportPng}>
            {t("barcode.exportPng")}
          </Button>
          <Button variant="outline" onClick={printThermal}>
            {t("barcode.thermal")}
          </Button>
          <Button variant="outline" onClick={() => printJob(1)}>
            {t("barcode.printSingle")}
          </Button>
          <Button
            onClick={() => printJob(Math.max(1, Number(copies) || 1))}
          >
            {t("barcode.printSheet")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
