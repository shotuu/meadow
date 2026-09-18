"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { Meta } from "@/components/typography";

const chartConfig = {
  value: { label: "Portfolio value", color: "var(--chart-1)" },
} satisfies ChartConfig;

type RangeKey = "1m" | "3m" | "ytd" | "1y" | "all";
const RANGE_DAYS: Record<"1m" | "3m" | "1y", number> = { "1m": 30, "3m": 90, "1y": 365 };
const RANGE_LABEL: Record<RangeKey, string> = { "1m": "1M", "3m": "3M", ytd: "YTD", "1y": "1Y", all: "All" };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function rangeStart(range: Exclude<RangeKey, "all">, lastDate: Date): number {
  if (range === "ytd") return new Date(lastDate.getFullYear(), 0, 1).getTime();
  return lastDate.getTime() - RANGE_DAYS[range] * MS_PER_DAY;
}

/**
 * Portfolio-value sparkline with a range selector limited to what the
 * history actually spans (mirrors dashboard/net-worth-chart.tsx's logic,
 * with YTD added per the Invest wireframe). Deliberately never a "return"
 * or "performance" figure -- the delta below is a raw value change, which
 * embeds any contributions/withdrawals that happened in the window (see
 * the Meta disclaimer under the chart). Props are kept narrow (just points
 * + currency) so a future Value | Return segmented control can wrap this
 * component without restructuring it -- no return/performance math lives
 * here to rip out later.
 */
export function PortfolioSparkline({
  points,
  currency,
}: {
  points: { asOfDate: Date; value: number }[];
  currency: string;
}) {
  const spanDays =
    points.length > 1 ? (points[points.length - 1].asOfDate.getTime() - points[0].asOfDate.getTime()) / MS_PER_DAY : 0;
  const lastDate = useMemo(() => points[points.length - 1]?.asOfDate ?? new Date(), [points]);
  const hasPreJan1History = points.length > 0 && points[0].asOfDate.getTime() < new Date(lastDate.getFullYear(), 0, 1).getTime();

  const availableRanges: Exclude<RangeKey, "all">[] = (["1m", "3m", "ytd", "1y"] as const).filter((r) => {
    if (r === "ytd") return hasPreJan1History;
    return spanDays > RANGE_DAYS[r] * 1.1;
  });
  const ranges: RangeKey[] = [...availableRanges, "all"];
  const [range, setRange] = useState<RangeKey>(availableRanges[0] ?? "all");

  const visible = useMemo(() => {
    if (range === "all") return points;
    const cutoff = rangeStart(range, lastDate);
    return points.filter((p) => p.asOfDate.getTime() >= cutoff);
  }, [points, range, lastDate]);

  const first = visible[0];
  const last = visible[visible.length - 1];
  const change = first && last ? last.value - first.value : 0;

  const chartPoints = visible.map((p) => ({
    label: p.asOfDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: p.value,
  }));

  return (
    <div className="space-y-2">
      {visible.length > 1 && (
        // Deliberately no green/red coloring and no percentage here, unlike
        // dashboard/net-worth-chart.tsx's otherwise-identical line -- a
        // colored "+$X (+Y%)" directly under a portfolio value and above a
        // chart reads as investment performance at a glance, even with the
        // disclaimer below it, and this figure includes contributions/
        // withdrawals so a percentage of it isn't a meaningful investment
        // return. Kept neutral (no positive/negative styling) instead.
        <p className="font-amount text-sm text-foreground">
          {change >= 0 ? "+" : ""}
          {formatMoney(change, currency)}{" "}
          <span className="text-muted-foreground">
            {range === "all" ? "since tracking began" : `over ${RANGE_LABEL[range]}`}
          </span>
        </p>
      )}
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <AreaChart data={chartPoints} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="portfolioSparklineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />} />
          <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="url(#portfolioSparklineFill)" />
        </AreaChart>
      </ChartContainer>
      {ranges.length > 1 && (
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <Button key={r} type="button" variant={r === range ? "secondary" : "ghost"} size="xs" onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>
      )}
      <Meta>Reflects contributions and withdrawals, not investment return.</Meta>
    </div>
  );
}
