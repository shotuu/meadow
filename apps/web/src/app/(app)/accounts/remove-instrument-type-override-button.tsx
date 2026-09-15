import { Button } from "@/components/ui/button";
import { removeInstrumentTypeOverride } from "./actions";

export function RemoveInstrumentTypeOverrideButton({ symbol }: { symbol: string }) {
  return (
    <form action={removeInstrumentTypeOverride.bind(null, symbol)}>
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}
