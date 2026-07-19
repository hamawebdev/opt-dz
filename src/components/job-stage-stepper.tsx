import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { JOB_META } from "@/lib/job-meta";
import { JOB_FLOW } from "@/db/jobs";
import type { JobStatus } from "@/types";

/**
 * The 4-stage lab pipeline as a horizontal stepper: done stages get a check,
 * the current one is highlighted, future ones are muted. Icon + word for every
 * node (never color alone). Plain flex row, so RTL flips it automatically.
 */
export function JobStageStepper({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const current = JOB_FLOW.indexOf(status);

  return (
    <div className={cn("flex items-start", className)}>
      {JOB_FLOW.map((stage, i) => {
        const Icon = JOB_META[stage].icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={stage} className={cn("flex items-start", i > 0 && "flex-1")}>
            {i > 0 && (
              <div
                className={cn(
                  "mt-5 h-0.5 flex-1",
                  done || active ? "bg-success" : "bg-border",
                )}
              />
            )}
            <div className="flex w-16 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  done && "bg-success/15 text-success",
                  active && "ring-primary bg-primary/10 text-primary ring-2",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-5" /> : <Icon className="size-5" />}
              </span>
              <span
                className={cn(
                  "text-center text-xs leading-tight",
                  active ? "font-bold" : "text-muted-foreground",
                )}
              >
                {t(`jobStatus.${stage}`)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
