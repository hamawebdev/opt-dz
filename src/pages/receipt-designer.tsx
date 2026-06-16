import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useSaveSettings } from "@/hooks/use-settings";
import { parseReceiptConfig } from "@/lib/receipt-config";
import { formatDZD } from "@/lib/format";
import type { ReceiptConfig, ShopSettings } from "@/types";

const TOGGLES: { key: keyof ReceiptConfig; labelKey: string }[] = [
  { key: "show_logo", labelKey: "receiptDesigner.showLogo" },
  { key: "show_address", labelKey: "receiptDesigner.showAddress" },
  { key: "show_phone", labelKey: "receiptDesigner.showPhone" },
  { key: "show_unit_price", labelKey: "receiptDesigner.showUnitPrice" },
  { key: "show_qty", labelKey: "receiptDesigner.showQty" },
  { key: "show_discount", labelKey: "receiptDesigner.showDiscount" },
  { key: "show_tax", labelKey: "receiptDesigner.showTax" },
  { key: "show_timbre", labelKey: "receiptDesigner.showTimbre" },
];

export default function ReceiptDesignerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: settings } = useSettings();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => navigate("/settings")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("nav.settings")}
      </Button>
      {settings ? (
        <Designer settings={settings} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </div>
  );
}

function Designer({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [cfg, setCfg] = useState<ReceiptConfig>(() =>
    parseReceiptConfig(settings.receipt_config),
  );
  const sym = settings.currency_symbol;

  const set = <K extends keyof ReceiptConfig>(k: K, v: ReceiptConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    try {
      await save.mutateAsync({ receipt_config: JSON.stringify(cfg) });
      toast.success(t("receiptDesigner.saved"));
    } catch (err) {
      notifyError(err, t("problem.saveFailed"));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.receiptCustomization")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rc_header">{t("receiptDesigner.headerText")}</Label>
            <Input
              id="rc_header"
              value={cfg.header_text}
              onChange={(e) => set("header_text", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rc_footer">{t("receiptDesigner.footerText")}</Label>
            <Input
              id="rc_footer"
              value={cfg.footer_text}
              onChange={(e) => set("footer_text", e.target.value)}
            />
          </div>
          {TOGGLES.map(({ key, labelKey }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`rc_${key}`}>{t(labelKey)}</Label>
              <Switch
                id={`rc_${key}`}
                checked={cfg[key] as boolean}
                onCheckedChange={(v) => set(key, v)}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={save.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader>
          <CardTitle>{t("receiptDesigner.preview")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-white p-5 text-sm text-black">
            <div className="mb-3 flex items-center gap-3 border-b pb-3">
              {cfg.show_logo && settings.shop_logo && (
                <img
                  src={settings.shop_logo}
                  alt=""
                  className="h-10 w-10 object-contain"
                />
              )}
              <div>
                <div className="font-bold">
                  {settings.shop_name || "My Optical Shop"}
                </div>
                {cfg.header_text && (
                  <div className="text-xs text-gray-600">{cfg.header_text}</div>
                )}
                {cfg.show_address && settings.shop_address && (
                  <div className="text-xs text-gray-600">
                    {settings.shop_address}
                  </div>
                )}
                {cfg.show_phone && settings.shop_phone && (
                  <div className="text-xs text-gray-600">
                    {settings.shop_phone}
                  </div>
                )}
              </div>
            </div>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="py-1 text-left">{t("common.description")}</th>
                  {cfg.show_unit_price && (
                    <th className="py-1 text-right">{t("common.unitPrice")}</th>
                  )}
                  {cfg.show_qty && (
                    <th className="py-1 text-right">{t("common.qty")}</th>
                  )}
                  {cfg.show_discount && (
                    <th className="py-1 text-right">{t("common.discount")}</th>
                  )}
                  <th className="py-1 text-right">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="py-1">Ray-Ban RB2140</td>
                  {cfg.show_unit_price && (
                    <td className="py-1 text-right">{formatDZD(1200000, sym)}</td>
                  )}
                  {cfg.show_qty && <td className="py-1 text-right">1</td>}
                  {cfg.show_discount && (
                    <td className="py-1 text-right">{formatDZD(0, sym)}</td>
                  )}
                  <td className="py-1 text-right">{formatDZD(1200000, sym)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 space-y-0.5 border-t pt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">{t("common.totalTtc")}</span>
                <span>{formatDZD(1200000, sym)}</span>
              </div>
              {cfg.show_tax && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("common.inclTva")}</span>
                  <span>{formatDZD(191597, sym)}</span>
                </div>
              )}
              {cfg.show_timbre && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t("common.droitDeTimbre")}
                  </span>
                  <span>{formatDZD(12000, sym)}</span>
                </div>
              )}
            </div>

            {(cfg.footer_text || settings.invoice_footer) && (
              <div className="mt-3 border-t pt-2 text-center text-xs text-gray-500">
                {cfg.footer_text || settings.invoice_footer}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
