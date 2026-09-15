import { Button } from "@/components/ui/button";
import { deactivateIncomeStream } from "./actions";

export function DeactivateIncomeStreamButton({ incomeStreamId }: { incomeStreamId: string }) {
  return (
    <form action={deactivateIncomeStream.bind(null, incomeStreamId)}>
      <Button type="submit" variant="ghost" size="sm">
        Deactivate
      </Button>
    </form>
  );
}
