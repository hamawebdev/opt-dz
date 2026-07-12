import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Phone,
  Smartphone,
  Mail,
  Shield,
  MapPin,
  CalendarDays,
  IdCard,
  ShoppingCart,
  FileText,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import { PrescriptionDialog } from "@/components/prescription-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";
import {
  useArchivePatient,
  useDeletePrescription,
  usePatient,
  usePatientSummary,
  usePrescriptions,
} from "@/hooks/use-patients";
import { useSales } from "@/hooks/use-sales";
import { usePatientJobs } from "@/hooks/use-jobs";
import { usePatientAppointments } from "@/hooks/use-appointments";
import { useActivity } from "@/hooks/use-activity";
import { usePayers } from "@/hooks/use-payers";
import { useAttributesForPatient } from "@/hooks/use-attributes";
import { useSettings } from "@/hooks/use-settings";
import {
  formatDZD,
  formatDate,
  formatDiopter,
  formatPlain,
} from "@/lib/format";
import type { AppointmentStatus, SaleStatus } from "@/types";

const statusVariant: Record<
  SaleStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
  void: "outline",
};

const apptStatusVariant: Record<
  AppointmentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  booked: "secondary",
  arrived: "default",
  done: "outline",
  no_show: "destructive",
  cancelled: "destructive",
};

export default function PatientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const patientId = Number(id);
  const navigate = useNavigate();

  const { data: patient, isLoading } = usePatient(patientId);
  const { data: jobs } = usePatientJobs(patientId);
  const { data: prescriptions } = usePrescriptions(patientId);
  const { data: sales } = useSales({ patientId });
  const { data: summary } = usePatientSummary(patientId);
  const { data: customFields } = useAttributesForPatient(patientId);
  const { data: appointments } = usePatientAppointments(patientId);
  const { data: activity } = useActivity(patientId);
  const { data: payers } = usePayers();
  const { data: settings } = useSettings();
  const symbol = settings?.currency_symbol;

  const deletePatient = useArchivePatient();
  const deleteRx = useDeletePrescription(patientId);

  const [rxOpen, setRxOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [confirmPatient, setConfirmPatient] = useState(false);
  const [rxToDelete, setRxToDelete] = useState<number | null>(null);
  // Take a payment right here instead of sending staff four screens deep
  // (patient → sales → sale → record payment).
  const [paySale, setPaySale] = useState<{
    id: number;
    balance: number;
  } | null>(null);
  const unpaidSales = (sales ?? []).filter(
    (s) => s.balance > 0 && s.status !== "void",
  );
  const oldestUnpaid = unpaidSales.length
    ? unpaidSales.reduce((a, b) => (a.sale_date <= b.sale_date ? a : b))
    : null;

  if (isLoading)
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!patient)
    return (
      <Empty>
        <EmptyTitle>{t("patients.notFound")}</EmptyTitle>
        <EmptyDescription>
          <Link to="/patients" className="underline">
            {t("patients.backToPatients")}
          </Link>
        </EmptyDescription>
      </Empty>
    );

  async function handleDeletePatient() {
    try {
      await deletePatient.mutateAsync(patientId);
      toast.success(t("patients.archived"));
      navigate("/patients");
    } catch {
      toast.error(t("problem.actionFailed"));
    } finally {
      setConfirmPatient(false);
    }
  }

  async function handleDeleteRx() {
    if (rxToDelete == null) return;
    try {
      await deleteRx.mutateAsync(rxToDelete);
      toast.success(t("patients.prescriptionDeleted"));
    } catch (err) {
      notifyError(err, t("problem.actionFailed"));
    } finally {
      setRxToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/patients")}>
          <ArrowLeft className="me-1 size-4 rtl:rotate-180" />{" "}
          {t("nav.patients")}
        </Button>
        <div className="flex gap-2">
          <Button asChild>
            <Link to={`/sales/new?patient=${patientId}`}>
              <ShoppingCart className="size-4" /> {t("patients.newSale")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/patients/${patientId}/statement/print`}>
              <FileText className="size-4" /> {t("statement.title")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/patients/${patientId}/edit`}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setConfirmPatient(true)}>
            <Trash2 className="text-destructive size-4" />{" "}
            {t("patients.archive")}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label={t("patients.invoices")}
              value={String(summary.invoice_count)}
            />
            <StatCard
              label={t("patients.totalInvoiced")}
              value={formatDZD(summary.total_invoiced, symbol)}
            />
            <StatCard
              label={t("patients.outstanding")}
              value={formatDZD(summary.outstanding, symbol)}
              highlight={summary.outstanding > 0}
            />
            <StatCard
              label={t("patients.lastPayment")}
              value={
                summary.last_payment_date
                  ? formatDate(summary.last_payment_date)
                  : "—"
              }
            />
          </div>
          {oldestUnpaid && (
            <Button
              onClick={() =>
                setPaySale({
                  id: oldestUnpaid.id,
                  balance: oldestUnpaid.balance,
                })
              }
            >
              <CreditCard className="me-1.5 size-4" />
              {t("sales.recordPayment")}
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            {patient.photo ? (
              <img
                src={patient.photo}
                alt=""
                className="size-12 rounded-full object-cover"
              />
            ) : null}
            <div>
              <CardTitle className="text-xl tracking-tight">
                {patient.full_name}
              </CardTitle>
              {patient.code && (
                <p className="text-muted-foreground text-sm">{patient.code}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <InfoRow
            icon={<Phone className="size-4" />}
            label={t("common.phone")}
            value={patient.phone}
          />
          <InfoRow
            icon={<Smartphone className="size-4" />}
            label={t("patients.phone2")}
            value={patient.phone2}
          />
          <InfoRow
            icon={<Mail className="size-4" />}
            label={t("patients.email")}
            value={patient.email}
          />
          <InfoRow
            icon={<CalendarDays className="size-4" />}
            label={t("patients.dateOfBirth")}
            value={
              patient.date_of_birth ? formatDate(patient.date_of_birth) : null
            }
          />
          <InfoRow
            icon={<IdCard className="size-4" />}
            label={t("patients.nationalId")}
            value={patient.national_id}
          />
          <InfoRow
            icon={<MapPin className="size-4" />}
            label={t("common.address")}
            value={patient.address}
          />
          {patient.default_payer_id && (
            <InfoRow
              icon={<Shield className="size-4" />}
              label={t("patients.insurance")}
              value={[
                payers?.find((p) => p.id === patient.default_payer_id)?.name,
                patient.default_coverage_pct
                  ? `${patient.default_coverage_pct / 100}%`
                  : null,
                patient.insurance_policy_no,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {patient.notes && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground mb-1">{t("common.notes")}</p>
              <p className="whitespace-pre-wrap">{patient.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const filled = (customFields ?? []).filter((a) =>
          Array.isArray(a.value)
            ? a.value.length > 0
            : a.value != null && a.value !== "",
        );
        if (!filled.length) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle>{t("patients.customFields")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {filled.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-28">{a.label}</span>
                  <span className="font-medium">
                    {Array.isArray(a.value)
                      ? a.value.join(", ")
                      : String(a.value)}
                    {a.unit ? ` ${a.unit}` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("patients.prescriptionHistory")}</CardTitle>
          <Button size="sm" onClick={() => setRxOpen(true)}>
            <Plus className="size-4" /> {t("patients.addPrescription")}
          </Button>
        </CardHeader>
        <CardContent>
          {!prescriptions?.length ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("patients.noPrescriptions")}
            </p>
          ) : (
            <div className="space-y-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="bg-muted/30 rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">
                      {formatDate(rx.exam_date)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("patients.deletePrescriptionAria")}
                      onClick={() => setRxToDelete(rx.id)}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          {t("patients.eye")}
                        </TableHead>
                        <TableHead>SPH</TableHead>
                        <TableHead>CYL</TableHead>
                        <TableHead>AXIS</TableHead>
                        <TableHead>ADD</TableHead>
                        <TableHead>PD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-semibold">OD</TableCell>
                        <TableCell>{formatDiopter(rx.r_sphere)}</TableCell>
                        <TableCell>{formatDiopter(rx.r_cylinder)}</TableCell>
                        <TableCell>{formatPlain(rx.r_axis, "°")}</TableCell>
                        <TableCell>{formatDiopter(rx.r_add)}</TableCell>
                        <TableCell>{formatPlain(rx.r_pd, " mm")}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">OS</TableCell>
                        <TableCell>{formatDiopter(rx.l_sphere)}</TableCell>
                        <TableCell>{formatDiopter(rx.l_cylinder)}</TableCell>
                        <TableCell>{formatPlain(rx.l_axis, "°")}</TableCell>
                        <TableCell>{formatDiopter(rx.l_add)}</TableCell>
                        <TableCell>{formatPlain(rx.l_pd, " mm")}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  {rx.notes && (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {rx.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("appointments.title")}</CardTitle>
          <Button size="sm" onClick={() => setApptOpen(true)}>
            <Plus className="size-4" /> {t("appointments.new")}
          </Button>
        </CardHeader>
        <CardContent>
          {!appointments?.length ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("appointments.none")}
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {appointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span>
                    {formatDate(a.starts_at)}{" "}
                    <span className="text-muted-foreground">
                      {a.starts_at.split(/[ T]/)[1]?.slice(0, 5)}
                    </span>
                    {a.reason ? ` · ${a.reason}` : ""}
                    {a.optometrist ? ` · ${a.optometrist}` : ""}
                  </span>
                  <Badge variant={apptStatusVariant[a.status]}>
                    {t(`appointments.status_${a.status}`)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!!jobs?.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.jobs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <span>
                  {j.invoice_number
                    ? t("patients.invoiceLabel", { number: j.invoice_number })
                    : t("patients.jobLabel", { id: j.id })}
                  {j.expected_ready
                    ? t("patients.expectedSuffix", {
                        date: formatDate(j.expected_ready),
                      })
                    : ""}
                </span>
                <Badge variant={j.status === "ready" ? "default" : "secondary"}>
                  {t(`jobStatus.${j.status}`)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("patients.salesHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!sales?.length ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("patients.noSales")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.invoice")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.total")}</TableHead>
                  <TableHead>{t("common.balance")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/sales/${s.id}`)}
                  >
                    <TableCell className="font-medium">#{s.id}</TableCell>
                    <TableCell>{formatDate(s.sale_date)}</TableCell>
                    <TableCell>{formatDZD(s.total, symbol)}</TableCell>
                    <TableCell>{formatDZD(s.balance, symbol)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[s.status]}>
                        {t(`saleStatus.${s.status}`)}
                      </Badge>
                    </TableCell>
                    {/* stopPropagation: the row itself navigates to the sale */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {s.balance > 0 && s.status !== "void" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaySale({ id: s.id, balance: s.balance })
                          }
                        >
                          <CreditCard className="me-1 size-4" />
                          {t("sales.recordPayment")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!!activity?.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t("activity.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <span className="text-muted-foreground w-28 shrink-0">
                    {formatDate(a.created_at)}
                  </span>
                  <span>
                    <span className="font-medium">
                      {t(`activity.type_${a.type}`)}
                    </span>
                    {a.description ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {a.description}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <PrescriptionDialog
        patientId={patientId}
        open={rxOpen}
        onOpenChange={setRxOpen}
      />
      <AppointmentDialog
        key={apptOpen ? "appt-open" : "appt-closed"}
        open={apptOpen}
        onOpenChange={setApptOpen}
        presetPatientId={patientId}
      />
      <ConfirmDialog
        open={confirmPatient}
        onOpenChange={setConfirmPatient}
        title={t("patients.archiveTitle")}
        description={t("patients.archiveDesc")}
        confirmText={t("patients.archive")}
        onConfirm={handleDeletePatient}
      />
      <ConfirmDialog
        open={rxToDelete != null}
        onOpenChange={(o) => !o && setRxToDelete(null)}
        title={t("patients.deletePrescriptionTitle")}
        confirmText={t("common.delete")}
        onConfirm={handleDeleteRx}
      />
      <PaymentDialog
        key={paySale ? `pay-${paySale.id}` : "pay-closed"}
        saleId={paySale?.id ?? 0}
        balance={paySale?.balance ?? 0}
        currencySymbol={symbol}
        open={paySale != null}
        onOpenChange={(open) => {
          if (!open) setPaySale(null);
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${highlight ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-28">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
