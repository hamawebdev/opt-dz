import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, UserPlus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { PatientAvatar } from "@/components/patient-avatar";
import { PosNewClientDialog } from "@/components/pos/pos-new-client-dialog";
import { usePatients, usePrescriptions } from "@/hooks/use-patients";
import { useCartStore } from "@/store/use-cart-store";
import { formatDate } from "@/lib/format";

/**
 * Customer area for the POS cart. Defaults to a walk-in (no customer); the cashier
 * can optionally attach a registered patient (for prescription / insurance / history)
 * and clear back to walk-in at any time. Never forces customer creation.
 *
 * With a customer selected, their saved prescriptions can be attached to the sale
 * right here — so the POS covers the full glasses sale without switching to the
 * advanced sale form.
 */
export function PosCustomerBar() {
  const { t } = useTranslation();
  const { data: patients } = usePatients();
  const customerId = useCartStore((s) => s.customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const prescriptionId = useCartStore((s) => s.prescriptionId);
  const setPrescriptionId = useCartStore((s) => s.setPrescriptionId);
  const { data: prescriptions } = usePrescriptions(customerId ?? undefined);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const options: SearchOption[] = useMemo(
    () =>
      (patients ?? []).map((p) => ({
        value: String(p.id),
        label: p.full_name,
        keywords: p.phone ?? "",
        leading: (
          <PatientAvatar
            name={p.full_name}
            photo={p.photo}
            className="size-7 text-xs"
          />
        ),
      })),
    [patients],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <UserRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <SearchSelect
            options={options}
            value={customerId != null ? String(customerId) : null}
            onChange={(v) => {
              const p = patients?.find((x) => String(x.id) === v);
              setCustomer(Number(v), p?.full_name ?? null);
            }}
            placeholder={t("pos.walkInCustomer")}
            searchPlaceholder={t("sales.searchByNamePhone")}
            className="h-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label={t("pos.addCustomer")}
          title={t("pos.addCustomer")}
          onClick={() => setNewClientOpen(true)}
        >
          <UserPlus className="size-4" />
        </Button>
        {customerId != null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setCustomer(null, null)}
          >
            <X className="size-4" /> {t("common.remove")}
          </Button>
        )}
      </div>
      {customerId != null && !!prescriptions?.length && (
        <div className="flex items-center gap-2">
          <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1 [&>div]:w-full">
            <NativeSelect
              size="sm"
              aria-label={t("pos.prescription")}
              value={prescriptionId != null ? String(prescriptionId) : ""}
              onChange={(e) =>
                setPrescriptionId(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <NativeSelectOption value="">
                {t("pos.noPrescription")}
              </NativeSelectOption>
              {prescriptions.map((rx) => (
                <NativeSelectOption key={rx.id} value={String(rx.id)}>
                  {t("pos.prescriptionOf", { date: formatDate(rx.exam_date) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}

      <PosNewClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
      />
    </div>
  );
}
