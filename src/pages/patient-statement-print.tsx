import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatient, usePatientStatement } from "@/hooks/use-patients";
import { useSettings } from "@/hooks/use-settings";
import { parseReceiptConfig } from "@/lib/receipt-config";
import { formatDZD, formatDate } from "@/lib/format";

export default function PatientStatementPrintPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const patientId = Number(id);
  const navigate = useNavigate();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: patient } = usePatient(patientId);
  const { data: statement } = usePatientStatement(patientId, {
    from: from || undefined,
    to: to || undefined,
  });
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;
  const cfg = parseReceiptConfig(settings?.receipt_config);

  useEffect(() => {
    if (patient) {
      const prev = document.title;
      document.title = `Statement-${patient.code ?? patient.id}`;
      return () => {
        document.title = prev;
      };
    }
  }, [patient]);

  if (!patient)
    return <p className="text-muted-foreground p-6">{t("common.loading")}</p>;

  return (
    <div className="bg-muted min-h-screen print:bg-white">
      <div className="bg-background sticky top-0 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/patients/${patientId}`)}
        >
          <ArrowLeft className="me-1 size-4 rtl:rotate-180" /> {t("common.back")}
        </Button>
        <div className="flex items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">{t("patients.addedFrom")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("patients.addedTo")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="me-1 size-4" /> {t("sales.printSaveAsPdf")}
          </Button>
        </div>
      </div>

      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-sm text-black shadow print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-4">
            {cfg.show_logo && settings?.shop_logo && (
              <img
                src={settings.shop_logo}
                alt=""
                className="h-16 w-16 object-contain"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">
                {settings?.shop_name || t("receipt.shopFallback")}
              </h1>
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
            <h2 className="text-xl font-semibold">{t("statement.title")}</h2>
            {patient.code && <p className="text-gray-600">{patient.code}</p>}
            <p className="text-gray-600">{formatDate(new Date().toISOString())}</p>
          </div>
        </header>

        <section className="mb-6">
          <p className="mb-1 font-semibold text-gray-500 uppercase">
            {t("sales.billedTo")}
          </p>
          <p className="font-medium">{patient.full_name}</p>
          {patient.phone && <p className="text-gray-600">{patient.phone}</p>}
          {patient.address && <p className="text-gray-600">{patient.address}</p>}
        </section>

        <table className="mb-6 w-full border-collapse">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2">{t("common.date")}</th>
              <th className="px-3 py-2">{t("statement.entry")}</th>
              <th className="px-3 py-2">{t("common.invoice")}</th>
              <th className="px-3 py-2 text-right">{t("statement.debit")}</th>
              <th className="px-3 py-2 text-right">{t("statement.credit")}</th>
              <th className="px-3 py-2 text-right">{t("common.balance")}</th>
            </tr>
          </thead>
          <tbody>
            {!statement?.entries.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {t("statement.empty")}
                </td>
              </tr>
            ) : (
              statement.entries.map((e, i) => (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2">{formatDate(e.date)}</td>
                  <td className="px-3 py-2">{t(`statement.type_${e.type}`)}</td>
                  <td className="px-3 py-2">{e.ref ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {e.debit ? formatDZD(e.debit, symbol) : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {e.credit ? formatDZD(e.credit, symbol) : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatDZD(e.balance, symbol)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!!statement && (
          <div className="mb-10 flex justify-end">
            <div className="w-72 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">{t("statement.totalInvoiced")}</span>
                <span>{formatDZD(statement.total_debit, symbol)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t("statement.totalPaid")}</span>
                <span>{formatDZD(statement.total_credit, symbol)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-bold">
                <span>{t("common.balanceDue")}</span>
                <span>{formatDZD(statement.balance, symbol)}</span>
              </div>
            </div>
          </div>
        )}

        {(cfg.footer_text || settings?.invoice_footer) && (
          <footer className="border-t pt-4 text-center text-gray-500">
            {cfg.footer_text || settings?.invoice_footer}
          </footer>
        )}
      </div>
    </div>
  );
}
