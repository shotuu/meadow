"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import type { PeriodActuals } from "@finance-app/finance-logic";

const chartConfig = {
  spent: { label: "Spent" },
} satisfies ChartConfig;

export function PeriodChart({
  periods,
  budgetAmount,
  currency,
}: {
  periods: PeriodActuals[];
  budgetAmount: number;
  currency: string;
}) {
  const data = periods.map((p) => ({
    label: p.periodStart.toLocaleDateString(undefined, { month: "short" }),
    spent: p.spent,
    overBudget: p.spent > budgetAmount,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-24 w-full">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <ReferenceLine y={budgetAmount} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />}
        />
        <Bar dataKey="spent" radius={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.overBudget ? "var(--negative)" : "var(--positive)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
