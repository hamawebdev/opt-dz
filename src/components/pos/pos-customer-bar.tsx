import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { PatientAvatar } from "@/components/patient-avatar";
import { usePatients } from "@/hooks/use-patients";
import { useCartStore } from "@/store/use-cart-store";

/**
 * Customer area for the POS cart. Defaults to a walk-in (no customer); the cashier
 * can optionally attach a registered patient (for prescription / insurance / history)
 * and clear back to walk-in at any time. Never forces customer creation.
 */
export function PosCustomerBar() {
  const { t } = useTranslation();
  const { data: patients } = usePatients();
  const customerId = useCartStore((s) => s.customerId);
  const setCustomer = useCartStore((s) => s.setCustomer);

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
      {customerId != null && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={t("pos.removeCustomer")}
          onClick={() => setCustomer(null, null)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
