"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import { categoryColorVar } from "@/lib/category-color";
import { CategoryLegend } from "@/components/category-legend";
import type { SpendByCategoryBucket } from "@finance-app/finance-logic";

const OTHER_COLOR = "var(--muted-foreground)";

const chartConfig = {
  amount: { label: "Spent" },
} satisfies ChartConfig;

function colorFor(categoryId: string): string {
  return categoryId === "__other__" ? OTHER_COLOR : categoryColorVar(categoryId);
}

export function CategoryPieChart({ data, currency }: { data: SpendByCategoryBucket[]; currency: string }) {
  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} hideLabel />}
          />
          <Pie
            data={data}
            dataKey="amount"
            nameKey="categoryName"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            cornerRadius={4}
            stroke="var(--background)"
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.categoryId} fill={colorFor(d.categoryId)} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <CategoryLegend
        items={data.map((d) => ({ id: d.categoryId, name: d.categoryName, color: colorFor(d.categoryId), percent: d.percent }))}
      />
    </div>
  );
}
