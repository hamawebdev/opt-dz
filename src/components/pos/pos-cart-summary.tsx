import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { formatDZD } from "@/lib/format";
import { usePayers } from "@/hooks/use-payers";
import { useCartStore } from "@/store/use-cart-store";
import type { DiscountType } from "@/types";
import type { PosTotals } from "@/lib/pos-totals";

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={`flex justify-between tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${tone ?? ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function PosCartSummary({
  totals,
  symbol,
  simpleMode,
}: {
  totals: PosTotals;
  symbol?: string;
  simpleMode: boolean;
}) {
  const { t } = useTranslation();
  const { data: payers } = usePayers();

  const discountType = useCartStore((s) => s.discountType);
  const discountValue = useCartStore((s) => s.discountValue);
  const setDiscount = useCartStore((s) => s.setDiscount);
  const payerId = useCartStore((s) => s.payerId);
  const coveragePct = useCartStore((s) => s.coveragePct);
  const setPayer = useCartStore((s) => s.setPayer);

  function selectPayer(value: string) {
    if (value === "none") {
      setPayer("none", "");
    } else {
      const p = payers?.find((x) => String(x.id) === value);
      setPayer(value, p ? String(p.default_coverage_pct / 100) : "");
    }
  }

  return (
    <div className="space-y-2.5">
      <Row
        label={t("common.subtotal")}
        value={formatDZD(totals.subtotal, symbol)}
      />

      {/* Discount editor */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("pos.discount")}
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={discountType}
          onValueChange={(v) =>
            v && setDiscount(v as DiscountType, discountValue)
          }
        >
          <ToggleGroupItem value="amount">{symbol ?? "DA"}</ToggleGroupItem>
          <ToggleGroupItem value="percent">%</ToggleGroupItem>
        </ToggleGroup>
        <Input
          value={discountValue}
          onChange={(e) => setDiscount(discountType, e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="h-9 w-20 min-w-[3rem] flex-1 text-end"
        />
      </div>

      {/* Insurance (hidden in simple mode) */}
      {!simpleMode && (payers?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {t("sales.insurancePayer")}
          </span>
          <NativeSelect
            size="sm"
            className="min-w-0 flex-1"
            value={payerId}
            onChange={(e) => selectPayer(e.target.value)}
          >
            <NativeSelectOption value="none">
              {t("common.none")}
            </NativeSelectOption>
            {(payers ?? []).map((p) => (
              <NativeSelectOption key={p.id} value={String(p.id)}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {payerId !== "none" && (
            <Input
              value={coveragePct}
              onChange={(e) => setPayer(payerId, e.target.value)}
              inputMode="decimal"
              placeholder="%"
              className="h-9 w-16 text-end"
              aria-label={t("sales.insuranceCovers")}
            />
          )}
        </div>
      )}

      {!simpleMode && totals.taxAmount > 0 && (
        <Row
          label={t("common.inclTva")}
          value={formatDZD(totals.taxAmount, symbol)}
          tone="text-muted-foreground"
        />
      )}
      {totals.covered > 0 && (
        <Row
          label={t("sales.insuranceCovers")}
          value={`- ${formatDZD(totals.covered, symbol)}`}
          tone="text-muted-foreground"
        />
      )}
      {totals.timbre > 0 && (
        <Row
          label={t("common.droitDeTimbre")}
          value={formatDZD(totals.timbre, symbol)}
          tone="text-muted-foreground"
        />
      )}

      <div className="border-t pt-2">
        <Row
          label={t("common.grandTotal")}
          value={formatDZD(totals.grandTotal, symbol)}
          strong
        />
      </div>
    </div>
  );
}
