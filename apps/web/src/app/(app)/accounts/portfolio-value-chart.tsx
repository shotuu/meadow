"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";

const chartConfig = {
  value: { label: "Portfolio value", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function PortfolioValueChart({
  data,
  currency,
}: {
  data: { asOfDate: Date; value: number }[];
  currency: string;
}) {
  const points = data.map((d) => ({
    label: d.asOfDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: d.value,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis hide domain={["dataMin - dataMin * 0.02", "dataMax + dataMax * 0.02"]} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />}
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#portfolioValueFill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
