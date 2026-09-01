// A pie/donut's slices are per-data-point, not fixed series, so the shadcn
// ChartLegendContent (which resolves labels through a static ChartConfig
// keyed by series dataKey) can't label them -- this renders directly off
// the same rows the chart itself was given instead.
export function CategoryLegend({
  items,
}: {
  items: { id: string; name: string; color: string; percent: number }[];
}) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="truncate text-muted-foreground">{item.name}</span>
          <span className="font-amount ml-auto shrink-0 text-xs text-muted-foreground">
            {item.percent.toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
