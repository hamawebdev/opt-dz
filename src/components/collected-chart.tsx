import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDZD } from "@/lib/format";

export interface CollectedBar {
  label: string;
  collected: number; // centimes; negative on refund-only buckets
}

/** Bar chart of money collected per bucket for the reports page. Data arrives
 * pre-bucketed and zero-filled; this component only renders. */
export function CollectedChart({
  data,
  symbol,
}: {
  data: CollectedBar[];
  symbol?: string;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  const chartConfig = {
    collected: {
      label: t("reports.chartCollected"),
      color: "var(--primary)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" vertical={false} />
        <XAxis
          dataKey="label"
          reversed={isRtl}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
        />
        <YAxis
          width={48}
          orientation={isRtl ? "right" : "left"}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const d = Number(v) / 100; // centimes -> dinar
            return Math.abs(d) >= 1000 ? `${d / 1000}k` : String(d);
          }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5, radius: 6 }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">
                    {t("reports.chartCollected")}
                  </span>
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {formatDZD(Number(value), symbol)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="collected"
          fill="var(--color-collected)"
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ChartContainer>
  );
}
