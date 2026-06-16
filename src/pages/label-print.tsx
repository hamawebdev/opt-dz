import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { barcodeDataUrl } from "@/lib/barcode";
import type { LabelPrintJob } from "@/components/barcode-label-dialog";

/** Standalone, chrome-free page that lays out a batch of identical barcode labels
 * onto an A4 sheet and triggers the browser print dialog. */
export default function LabelPrintPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [job] = useState<LabelPrintJob | null>(() => {
    const raw = sessionStorage.getItem("labelPrintJob");
    return raw ? (JSON.parse(raw) as LabelPrintJob) : null;
  });

  const barcodeUrl = useMemo(
    () =>
      job
        ? barcodeDataUrl({
            value: job.value,
            format: job.format,
            includeText: job.format !== "qrcode",
            scale: 3,
          })
        : null,
    [job],
  );

  useEffect(() => {
    if (job) document.title = `Labels-${job.value}`;
  }, [job]);

  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("barcode.noJob")}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between p-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("common.back")}
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> {t("common.print")}
        </Button>
      </div>

      <div
        className="flex flex-wrap content-start gap-2 p-3"
        style={{ width: "210mm" }}
      >
        {Array.from({ length: job.copies }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center gap-0.5 overflow-hidden border border-dashed border-gray-300 p-1 text-center"
            style={{
              width: `${job.widthMm}mm`,
              height: `${job.heightMm}mm`,
            }}
          >
            {job.showLogo && job.logo && (
              <img src={job.logo} alt="" className="max-h-4 object-contain" />
            )}
            {job.name && (
              <div className="w-full truncate text-[10px] font-medium leading-tight">
                {job.name}
              </div>
            )}
            {barcodeUrl && (
              <img src={barcodeUrl} alt={job.value} className="max-h-[55%] object-contain" />
            )}
            <div className="flex w-full items-center justify-between px-1 text-[9px]">
              {job.sku ? <span className="truncate">{job.sku}</span> : <span />}
              {job.price ? <span className="font-semibold">{job.price}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <style>{`@media print { @page { size: A4; margin: 8mm; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  );
}
