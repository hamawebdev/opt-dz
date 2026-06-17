import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSale, useSaleItems } from "@/hooks/use-sales";
import { usePatient, usePrescriptions } from "@/hooks/use-patients";
import { useClaimForSale } from "@/hooks/use-claims";
import { useSettings } from "@/hooks/use-settings";
import { parseReceiptConfig } from "@/lib/receipt-config";
import {
  formatDZD,
  formatDate,
  formatDiopter,
  formatPlain,
} from "@/lib/format";

export default function SalePrintPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const saleId = Number(id);
  const navigate = useNavigate();

  const { data: sale } = useSale(saleId);
  const { data: items } = useSaleItems(saleId);
  const { data: claim } = useClaimForSale(saleId);
  const { data: patient } = usePatient(sale?.patient_id ?? undefined);
  const { data: prescriptions } = usePrescriptions(sale?.patient_id ?? undefined);
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const cfg = parseReceiptConfig(settings?.receipt_config);

  const rx = prescriptions?.find((p) => p.id === sale?.prescription_id) ?? null;

  // Update the document title so "Save as PDF" suggests a sensible filename.
  useEffect(() => {
    if (sale) {
      const prev = document.title;
      document.title = `Invoice-${sale.id}`;
      return () => {
        document.title = prev;
      };
    }
  }, [sale]);

  if (!sale)
    return <p className="text-muted-foreground p-6">{t("common.loading")}</p>;

  const discountLabel =
    sale.discount_value > 0
      ? sale.discount_type === "percent"
        ? `${sale.discount_value / 100}%`
        : formatDZD(sale.discount_value, symbol)
      : null;

  return (
    <div className="bg-muted min-h-screen print:bg-white">
      {/* Action bar — hidden when printing */}
      <div className="bg-background sticky top-0 flex items-center justify-between border-b px-6 py-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/sales/${saleId}`)}
        >
          <ArrowLeft className="mr-1 size-4" /> {t("common.back")}
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 size-4" /> {t("sales.printSaveAsPdf")}
        </Button>
      </div>

      {/* Invoice sheet */}
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-sm text-black shadow print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-4">
            {cfg.show_logo && settings?.shop_logo && (
              <img
                src={settings.shop_logo}
                alt={
                  settings.shop_name
                    ? t("settings.logoAlt", { name: settings.shop_name })
                    : t("settings.logoAltGeneric")
                }
                className="h-16 w-16 object-contain"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">
                {settings?.shop_name || t("receipt.shopFallback")}
              </h1>
              {cfg.header_text && (
                <p className="text-gray-600">{cfg.header_text}</p>
              )}
              {cfg.show_address && settings?.shop_address && (
                <p className="text-gray-600">{settings.shop_address}</p>
              )}
              {cfg.show_phone && settings?.shop_phone && (
                <p className="text-gray-600">
                  {t("receipt.tel", { phone: settings.shop_phone })}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold">{t("sales.invoiceUpper")}</h2>
            <p className="text-gray-600">
              {sale.invoice_number ?? `#${sale.id}`}
            </p>
            <p className="text-gray-600">{formatDate(sale.sale_date)}</p>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <p className="mb-1 font-semibold text-gray-500 uppercase">
              {t("sales.billedTo")}
            </p>
            <p className="font-medium">
              {patient?.full_name ?? sale.patient_name ?? t("sales.walkIn")}
            </p>
            {patient?.phone && <p className="text-gray-600">{patient.phone}</p>}
            {patient?.address && (
              <p className="text-gray-600">{patient.address}</p>
            )}
          </div>
          {rx && (
            <div>
              <p className="mb-1 font-semibold text-gray-500 uppercase">
                {t("sales.prescription")}
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="border px-2 py-1 text-left">
                      {t("patients.eye")}
                    </th>
                    <th className="border px-2 py-1">SPH</th>
                    <th className="border px-2 py-1">CYL</th>
                    <th className="border px-2 py-1">AXIS</th>
                    <th className="border px-2 py-1">ADD</th>
                    <th className="border px-2 py-1">PD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border px-2 py-1 font-semibold">OD</td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.r_sphere)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.r_cylinder)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatPlain(rx.r_axis)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.r_add)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatPlain(rx.r_pd)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border px-2 py-1 font-semibold">OS</td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.l_sphere)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.l_cylinder)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatPlain(rx.l_axis)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatDiopter(rx.l_add)}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      {formatPlain(rx.l_pd)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {(rx.lens_type || rx.prescriber || rx.expiry_date) && (
                <p className="mt-1 text-xs text-gray-600">
                  {rx.lens_type && (
                    <span className="capitalize">{rx.lens_type}</span>
                  )}
                  {rx.prescriber && <span> · {rx.prescriber}</span>}
                  {rx.expiry_date && (
                    <span>
                      {t("sales.expSuffix", {
                        date: formatDate(rx.expiry_date),
                      })}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </section>

        <table className="mb-6 w-full border-collapse">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2">{t("common.description")}</th>
              {cfg.show_unit_price && (
                <th className="px-3 py-2 text-right">
                  {t("common.unitPrice")}
                </th>
              )}
              {cfg.show_qty && (
                <th className="px-3 py-2 text-right">{t("common.qty")}</th>
              )}
              {cfg.show_discount && (
                <th className="px-3 py-2 text-right">{t("common.discount")}</th>
              )}
              <th className="px-3 py-2 text-right">{t("common.total")}</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="px-3 py-2">{it.description}</td>
                {cfg.show_unit_price && (
                  <td className="px-3 py-2 text-right">
                    {formatDZD(it.unit_price, symbol)}
                  </td>
                )}
                {cfg.show_qty && (
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                )}
                {cfg.show_discount && (
                  <td className="px-3 py-2 text-right">
                    {formatDZD(it.item_discount, symbol)}
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  {formatDZD(it.line_total, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-10 flex justify-end">
          <div className="w-64 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">{t("common.subtotal")}</span>
              <span>{formatDZD(sale.subtotal, symbol)}</span>
            </div>
            {cfg.show_discount && discountLabel && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("common.discount")}</span>
                <span>−{discountLabel}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <span className="text-gray-600">{t("common.totalTtc")}</span>
              <span>{formatDZD(sale.total, symbol)}</span>
            </div>
            {cfg.show_tax && sale.tax_amount > 0 && (
              <div className="flex justify-between text-xs text-gray-600">
                <span>
                  {t("common.inclTva")}
                  {sale.tax_rate ? ` (${sale.tax_rate / 100}%)` : ""}
                </span>
                <span>{formatDZD(sale.tax_amount, symbol)}</span>
              </div>
            )}
            {cfg.show_timbre && sale.timbre_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {t("common.droitDeTimbre")}
                </span>
                <span>{formatDZD(sale.timbre_amount, symbol)}</span>
              </div>
            )}
            {!!claim && claim.covered_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {t("sales.payerCovers", { payer: claim.payer_name })}
                </span>
                <span>−{formatDZD(claim.covered_amount, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>
                {claim ? t("common.patientTotal") : t("common.grandTotal")}
              </span>
              <span>
                {formatDZD(
                  sale.total +
                    sale.timbre_amount -
                    (claim?.covered_amount ?? 0),
                  symbol,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t("common.paid")}</span>
              <span>{formatDZD(sale.amount_paid, symbol)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t("common.balanceDue")}</span>
              <span>{formatDZD(sale.balance, symbol)}</span>
            </div>
          </div>
        </div>

        {(cfg.footer_text || settings?.invoice_footer) && (
          <footer className="border-t pt-4 text-center text-gray-500">
            {cfg.footer_text || settings?.invoice_footer}
          </footer>
        )}
      </div>
    </div>
  );
}
