import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Minus, Plus, Barcode } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/help-hint";
import { useSettings } from "@/hooks/use-settings";
import { productKeys } from "@/hooks/use-inventory";
import { useSimpleMode } from "@/store/use-app-store";
import { loadLabelItems } from "@/db/labels";
import { labelDesignHtml } from "@/lib/label-render";
import { printHtml } from "@/lib/print-html";
import { effectiveFormat } from "@/lib/barcode";
import { formatDZD } from "@/lib/format";
import { commands } from "@/lib/bindings";
import { unwrap } from "@/lib/db";
import { useLabelDesignerStore } from "@/store/use-label-designer-store";
import { DesignCanvas } from "./design-canvas";
import { DesignTab } from "./design-tab";
import { ArticlesTab } from "./articles-tab";
import { SavesTab } from "./saves-tab";
import type { Product } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Products that seed the print basket when the designer opens (1 or many). */
  products: Product[] | null;
  /** Fires after a print was sent, so callers can e.g. clear their selection. */
  onPrinted?: () => void;
}

export function LabelDesignerDialog({
  open,
  onOpenChange,
  products,
  onPrinted,
}: Props) {
  const { t, i18n } = useTranslation();
  const simpleMode = useSimpleMode();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const [printing, setPrinting] = useState(false);

  const template = useLabelDesignerStore((s) => s.template);
  const basket = useLabelDesignerStore((s) => s.basket);
  const zoom = useLabelDesignerStore((s) => s.zoom);
  const setZoom = useLabelDesignerStore((s) => s.setZoom);
  const reset = useLabelDesignerStore((s) => s.reset);
  const setBasket = useLabelDesignerStore((s) => s.setBasket);

  // Seed the print basket each time the dialog opens: one label per variant
  // (variant-less products get one), auto-generating any missing barcodes.
  useEffect(() => {
    if (!open) return;
    reset();
    const seed = products ?? [];
    if (seed.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { items, generated } = await loadLabelItems(seed, i18n.language);
        if (cancelled) return;
        setBasket(items);
        if (generated > 0) {
          qc.invalidateQueries({ queryKey: productKeys.all });
          toast.info(
            t("labelDesigner.barcodesGenerated", { count: generated }),
          );
        }
      } catch (err) {
        if (!cancelled) notifyError(err, t("problem.actionFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handlePrint() {
    try {
      printHtml(labelDesignHtml(template, basket, symbol));
      toast.success(t("labelDesigner.printSent"));
      onPrinted?.();
    } catch (err) {
      notifyError(err, t("problem.printFailed"));
    }
  }

  async function handleThermal() {
    // The template's barcode element decides the preferred symbology; each
    // value still falls back (e.g. alphanumeric SKU → Code 128) so every
    // label prints something scannable.
    const preferred =
      template.elements.find((e) => e.kind === "barcode")?.format ?? "ean13";
    setPrinting(true);
    try {
      for (const item of basket) {
        for (let i = 0; i < Math.max(1, item.qty); i++) {
          unwrap(
            await commands.printLabel({
              value: item.code,
              format: effectiveFormat(preferred, item.code),
              name: item.characteristics
                ? `${item.name} ${item.characteristics}`
                : item.name,
              price: formatDZD(item.priceCents, symbol),
              sku: item.reference,
            }),
          );
        }
      }
      toast.success(t("barcode.sentToPrinter"));
      onPrinted?.();
    } catch (err) {
      notifyError(err, t("problem.printFailed"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]">
        <DialogDescription className="sr-only">
          {t("labelDesigner.description")}
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="text-primary size-5" />
            {t("labelDesigner.title")}
            <HelpHint text={t("labelDesigner.help")} />
          </DialogTitle>
          <div className="me-8 flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("labelDesigner.zoomOut")}
              onClick={() => setZoom(zoom - 0.2)}
            >
              <Minus />
            </Button>
            <span className="w-12 text-center text-sm tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("labelDesigner.zoomIn")}
              onClick={() => setZoom(zoom + 0.2)}
            >
              <Plus />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[380px] shrink-0 flex-col border-e">
            {simpleMode ? (
              // Simple mode: only the item list + quantities; layout comes
              // from the last-used (or default) template.
              <div className="min-h-0 flex-1 overflow-hidden">
                <ArticlesTab />
              </div>
            ) : (
              <Tabs
                defaultValue="articles"
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <TabsList className="m-3 grid grid-cols-3">
                  <TabsTrigger value="articles">
                    {t("labelDesigner.tabArticles")}
                  </TabsTrigger>
                  <TabsTrigger value="design">
                    {t("labelDesigner.tabDesign")}
                  </TabsTrigger>
                  <TabsTrigger value="saves">
                    {t("labelDesigner.tabSaves")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="articles"
                  className="min-h-0 flex-1 overflow-hidden"
                >
                  <ArticlesTab />
                </TabsContent>
                <TabsContent
                  value="design"
                  className="min-h-0 flex-1 overflow-auto"
                >
                  <DesignTab />
                </TabsContent>
                <TabsContent
                  value="saves"
                  className="min-h-0 flex-1 overflow-hidden"
                >
                  <SavesTab />
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <DesignCanvas />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t p-3">
          <Button
            variant="outline"
            size="lg"
            onClick={handleThermal}
            disabled={basket.length === 0 || printing}
          >
            <Printer /> {t("barcode.thermal")}
          </Button>
          <Button
            className="flex-1"
            size="lg"
            onClick={handlePrint}
            disabled={basket.length === 0 || printing}
          >
            <Printer /> {t("labelDesigner.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
