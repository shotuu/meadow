"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import type { SpendByCategoryBucket } from "@finance-app/finance-logic";

const BUCKET_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const OTHER_COLOR = "var(--muted-foreground)";

const chartConfig = {
  amount: { label: "Spent" },
} satisfies ChartConfig;

export function SpendByCategoryChart({ data, currency }: { data: SpendByCategoryBucket[]; currency: string }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: data.length * 32 + 16 }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="categoryName"
          tickLine={false}
          axisLine={false}
          width={100}
          fontSize={12}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />}
        />
        <Bar dataKey="amount" radius={4}>
          {data.map((d, i) => (
            <Cell key={d.categoryId} fill={d.categoryId === "__other__" ? OTHER_COLOR : BUCKET_COLORS[i]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
