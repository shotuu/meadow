"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
  value: { label: "Net worth", color: "var(--chart-1)" },
} satisfies ChartConfig;

type RangeKey = "1m" | "3m" | "1y" | "all";
const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "1m": 30, "3m": 90, "1y": 365 };
const RANGE_LABEL: Record<RangeKey, string> = { "1m": "1M", "3m": "3M", "1y": "1Y", all: "All" };

/**
 * Compact net-worth sparkline with a range selector limited to what the
 * data actually spans -- a range is only offered when the history is
 * meaningfully longer than it (1.1x), otherwise it would just duplicate
 * "All" with an extra button. Caller passes points already trimmed to
 * real, non-null history plus a live "today" point appended (see
 * dashboard/page.tsx) so the hero figure and the chart's last point never
 * disagree.
 */
export function NetWorthChart({
  points,
  currency,
}: {
  points: { asOfDate: Date; value: number }[];
  currency: string;
}) {
  const spanDays =
    points.length > 1
      ? (points[points.length - 1].asOfDate.getTime() - points[0].asOfDate.getTime()) / (24 * 60 * 60 * 1000)
      : 0;
  const availableRanges = (["1m", "3m", "1y"] as const).filter((r) => spanDays > RANGE_DAYS[r] * 1.1);
  const ranges: RangeKey[] = [...availableRanges, "all"];
  const [range, setRange] = useState<RangeKey>(availableRanges[0] ?? "all");

  const visible = useMemo(() => {
    if (range === "all") return points;
    const cutoff = points[points.length - 1].asOfDate.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return points.filter((p) => p.asOfDate.getTime() >= cutoff);
  }, [points, range]);

  const first = visible[0];
  const last = visible[visible.length - 1];
  const change = first && last ? last.value - first.value : 0;
  const changePct = first && first.value !== 0 ? (change / Math.abs(first.value)) * 100 : null;

  const chartPoints = visible.map((p) => ({
    label: p.asOfDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: p.value,
  }));

  return (
    <div className="space-y-2">
      {visible.length > 1 && (
        <p
          className={cn(
            "font-amount text-sm",
            change > 0 ? "text-positive" : change < 0 ? "text-negative" : "text-muted-foreground"
          )}
        >
          {change >= 0 ? "+" : ""}
          {formatMoney(change, currency)}
          {changePct !== null && ` (${change >= 0 ? "+" : ""}${changePct.toFixed(1)}%)`}{" "}
          <span className="text-muted-foreground">{range === "all" ? "all time" : `over ${RANGE_LABEL[range]}`}</span>
        </p>
      )}
      <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
        <AreaChart data={chartPoints} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />} />
          <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="url(#netWorthFill)" />
        </AreaChart>
      </ChartContainer>
      {ranges.length > 1 && (
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <Button
              key={r}
              type="button"
              variant={r === range ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
