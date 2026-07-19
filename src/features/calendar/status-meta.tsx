import {
  Ban,
  CalendarClock,
  CheckCircle2,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/status-pill";
import type { AppointmentStatus } from "@/types";

/**
 * Icon and tone per appointment status.
 *
 * The calendar colour-codes by status, but colour alone is not a legible signal
 * for low-literacy staff or for colour-blind users — the same rule `StatusPill`
 * follows. Every chip therefore carries this icon next to its colour.
 */
export const STATUS_META: Record<
  AppointmentStatus,
  { icon: LucideIcon; tone: StatusTone }
> = {
  booked: { icon: CalendarClock, tone: "info" },
  arrived: { icon: UserCheck, tone: "warning" },
  done: { icon: CheckCircle2, tone: "success" },
  no_show: { icon: UserX, tone: "danger" },
  cancelled: { icon: Ban, tone: "neutral" },
};
