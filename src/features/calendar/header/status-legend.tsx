import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getBgColor, statusColor, STATUS_ORDER } from "@/features/calendar/helpers";
import { STATUS_META } from "@/features/calendar/status-meta";

/**
 * Key to the colour coding.
 *
 * The calendar paints appointments by status, which is only readable if the
 * mapping is on screen — staff should never have to remember what amber means.
 */
export function StatusLegend({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
        className,
      )}
    >
      {STATUS_ORDER.map((status) => {
        const Icon = STATUS_META[status].icon;
        return (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                getBgColor(statusColor(status)),
              )}
            />
            <Icon className="size-3.5 shrink-0" />
            {t(`appointments.status_${status}`)}
          </span>
        );
      })}
    </div>
  );
}
