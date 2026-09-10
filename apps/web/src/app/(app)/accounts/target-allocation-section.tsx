import { bucketLabelForSecurityType, computeCurrentAllocation, computePortfolioDrift } from "@finance-app/finance-logic";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { SetTargetAllocationDialog } from "./set-target-allocation-dialog";
import { DeleteTargetAllocationButton } from "./delete-target-allocation-button";

export function TargetAllocationSection({
  holdings,
  targets,
}: {
  holdings: { securityType: string; marketValue: number }[];
  targets: { bucketName: string; targetWeightPct: number; driftThresholdPct: number }[];
}) {
  const current = computeCurrentAllocation(
    holdings.map((h) => ({ bucketName: bucketLabelForSecurityType(h.securityType), marketValue: h.marketValue }))
  );
  const drift = computePortfolioDrift(current, targets);
  const driftByBucket = new Map(drift.map((d) => [d.bucketName, d]));

  // Union of currently-held buckets and buckets with a configured target
  // (even one you've since sold out of entirely) -- a bucket that drifted
  // all the way to zero should still show up as a real drift, not vanish.
  const bucketNames = [...new Set([...current.map((c) => c.bucketName), ...targets.map((t) => t.bucketName)])];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Target allocation</h2>
      <Card>
        <CardContent className="divide-y p-0">
          {bucketNames.map((bucketName) => {
            const currentBucket = current.find((c) => c.bucketName === bucketName);
            const target = targets.find((t) => t.bucketName === bucketName);
            const currentWeightPct = currentBucket?.currentWeightPct ?? 0;
            const driftResult = driftByBucket.get(bucketName);

            return (
              <div key={bucketName} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{bucketName}</p>
                  <div className="flex items-center gap-2">
                    {target && <DeleteTargetAllocationButton bucketName={bucketName} />}
                    <SetTargetAllocationDialog
                      bucketName={bucketName}
                      targetWeightPct={target?.targetWeightPct}
                      driftThresholdPct={target?.driftThresholdPct}
                      triggerLabel={target ? "Edit" : "Set target"}
                    />
                  </div>
                </div>
                <Progress
                  value={currentWeightPct}
                  indicatorClassName={driftResult?.isDrifted ? "bg-negative" : "bg-primary"}
                />
                <p className="text-sm text-muted-foreground">
                  {currentWeightPct.toFixed(1)}% current
                  {target && ` · ${target.targetWeightPct.toFixed(1)}% target`}
                  {driftResult && (
                    <span className={cn(driftResult.isDrifted && "font-medium text-negative")}>
                      {" "}
                      · {driftResult.driftPct > 0 ? "+" : ""}
                      {driftResult.driftPct.toFixed(1)}pp drift
                      {driftResult.isDrifted && " (over threshold)"}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
