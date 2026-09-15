import { Button } from "@/components/ui/button";
import { deleteCashReserve } from "./actions";

export function DeleteCashReserveButton({ cashReserveId }: { cashReserveId: string }) {
  return (
    <form action={deleteCashReserve.bind(null, cashReserveId)}>
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}
