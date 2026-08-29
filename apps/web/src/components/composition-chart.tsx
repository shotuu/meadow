"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";

const chartConfig = {
  assets: { label: "Assets", color: "var(--chart-1)" },
  liabilities: { label: "Liabilities", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CompositionChart({
  assets,
  liabilities,
  currency,
}: {
  assets: number;
  liabilities: number;
  currency: string;
}) {
  const assetsAbs = Math.max(0, assets);
  const liabilitiesAbs = Math.max(0, Math.abs(liabilities));
  if (assetsAbs === 0 && liabilitiesAbs === 0) return null;

  const data = [{ name: currency, assets: assetsAbs, liabilities: liabilitiesAbs }];

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
      <BarChart data={data} layout="vertical" barCategoryGap={0} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" hide />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value, name) => [`${formatMoney(Number(value), currency)} `, name]} />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="assets"
          stackId="composition"
          fill="var(--color-assets)"
          stroke="var(--background)"
          strokeWidth={2}
          radius={[4, 0, 0, 4]}
        />
        <Bar
          dataKey="liabilities"
          stackId="composition"
          fill="var(--color-liabilities)"
          stroke="var(--background)"
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
