import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard KPI tile: label, one big number, optional sub-line and accent.
 * Shared by the home dashboard and the Stock page summary row. */
export function StatCard({
  title,
  value,
  sub,
  icon,
  accent,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: "warning" | "success";
  loading?: boolean;
}) {
  return (
    <Card className="group hover:border-border/80 relative overflow-hidden py-0 hover:shadow-md">
      {/* faint top sheen for a machined surface feel */}
      <div className="ring-inset-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-muted-foreground truncate text-sm font-medium">
            {title}
          </p>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          )}
          {!loading && sub && (
            <p className="text-muted-foreground truncate text-xs tabular-nums">
              {sub}
            </p>
          )}
        </div>
        <div
          className={
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-105 " +
            (accent === "warning"
              ? "bg-warning/10 text-warning ring-warning/20"
              : accent === "success"
                ? "bg-success/10 text-success ring-success/20"
                : "bg-primary/10 text-primary ring-primary/15")
          }
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
