import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { markObligationPaid } from "./actions";

export function MarkObligationPaidForm({ obligationId, remaining }: { obligationId: string; remaining: number }) {
  return (
    <form action={markObligationPaid} className="flex items-center gap-2">
      <input type="hidden" name="obligationId" value={obligationId} />
      <Input
        name="amount"
        type="number"
        step="0.01"
        placeholder="Amount"
        defaultValue={remaining > 0 ? remaining.toFixed(2) : undefined}
        className="w-28"
        required
      />
      <Button type="submit" size="sm" variant="secondary">
        Mark paid
      </Button>
    </form>
  );
}
