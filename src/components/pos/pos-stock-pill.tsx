import { PackageCheck, PackageMinus, PackageX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusPill } from "@/components/status-pill";

/**
 * Stock availability as icon + word + colour (never colour alone), tuned for the
 * POS: out / low / in stock with the live count. Services pass no stock and render
 * nothing (handled by the caller).
 */
export function PosStockPill({
  stock,
  minStock = 0,
  className,
}: {
  stock: number;
  minStock?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  if (stock <= 0)
    return (
      <StatusPill
        tone="danger"
        icon={PackageX}
        label={t("pos.outOfStock")}
        className={className}
      />
    );
  if (stock <= minStock)
    return (
      <StatusPill
        tone="warning"
        icon={PackageMinus}
        label={`${t("pos.lowStock")} · ${stock}`}
        className={className}
      />
    );
  return (
    <StatusPill
      tone="success"
      icon={PackageCheck}
      label={`${t("pos.inStock")} · ${stock}`}
      className={className}
    />
  );
}
