import { Button } from "@/components/ui/button";
import { deleteTargetAllocation } from "./actions";

export function DeleteTargetAllocationButton({ bucketName }: { bucketName: string }) {
  return (
    <form action={deleteTargetAllocation.bind(null, bucketName)}>
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}
