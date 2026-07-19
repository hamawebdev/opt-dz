import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { JOB_META } from "@/lib/job-meta";
import type { JobStatus, SaleStatus } from "@/types";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Status as icon + word + colour together — never colour alone. This keeps
 * meaning legible for low-literacy users and for the ~8% with colour-vision
 * deficiency (see UX review, accessibility).
 */
const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/10 ring-success/30 [&_svg]:text-success",
  warning: "bg-warning/15 ring-warning/35 [&_svg]:text-warning",
  danger: "bg-destructive/10 ring-destructive/30 [&_svg]:text-destructive",
  info: "bg-primary/10 ring-primary/30 [&_svg]:text-primary",
  neutral: "bg-muted ring-border [&_svg]:text-muted-foreground",
};

export function StatusPill({
  tone = "neutral",
  icon: Icon,
  label,
  className,
}: {
  tone?: StatusTone;
  icon?: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // The word stays in the high-contrast foreground colour; the icon and
        // tint carry the colour cue. Best of both for readability.
        "text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {label}
    </span>
  );
}

export function JobStatusPill({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const meta = JOB_META[status];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      label={t(`jobStatus.${status}`)}
    />
  );
}

const SALE_META: Record<SaleStatus, { tone: StatusTone; icon: LucideIcon }> = {
  paid: { tone: "success", icon: CheckCircle2 },
  partial: { tone: "warning", icon: Clock },
  unpaid: { tone: "danger", icon: AlertCircle },
  void: { tone: "neutral", icon: Ban },
};

export function SaleStatusPill({ status }: { status: SaleStatus }) {
  const { t } = useTranslation();
  const meta = SALE_META[status];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      label={t(`saleStatus.${status}`)}
    />
  );
}
