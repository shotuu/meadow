import { Button } from "@/components/ui/button";
import { removeHoldingBucket } from "./actions";

export function RemoveHoldingBucketButton({ symbol }: { symbol: string }) {
  return (
    <form action={removeHoldingBucket.bind(null, symbol)}>
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}
