import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ClipboardList, FlaskConical, PackageCheck } from "lucide-react";
import type { StatusTone } from "@/components/status-pill";
import type { JobStatus } from "@/types";

/** Icon + tone for each lab pipeline stage — the single source for every
 * surface (pills, stage tabs, stepper, timeline), so the stage always looks
 * the same wherever it appears. */
export const JOB_META: Record<JobStatus, { tone: StatusTone; icon: LucideIcon }> =
  {
    ordered: { tone: "neutral", icon: ClipboardList },
    in_progress: { tone: "info", icon: FlaskConical },
    ready: { tone: "success", icon: CheckCircle2 },
    delivered: { tone: "neutral", icon: PackageCheck },
  };
