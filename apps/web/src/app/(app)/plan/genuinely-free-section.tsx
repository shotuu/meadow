import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Answer, SectionLabel, Meta } from "@/components/typography";
import { formatMoney } from "@/lib/format";

export type GenuinelyFreeState =
  | { kind: "incomplete"; missing: "reserves" | "obligations" | "both" }
  | {
      kind: "complete";
      amount: number;
      currency: string;
      conversionIncomplete: boolean;
      eligibleCash: number;
      reservedCash: number;
      relevantObligations: number;
    };

const MISSING_COPY: Record<"reserves" | "obligations" | "both", { text: string; href: string }> = {
  both: { text: "Add your reserves and obligations to see what's truly free to use", href: "#reserves" },
  reserves: { text: "Add your cash reserves to see what's truly free to use", href: "#reserves" },
  obligations: { text: "Add your upcoming obligations to see what's truly free to use", href: "#obligations" },
};

// The eventual central planning insight (see PROGRESS.md's UI/UX redesign
// plan, amendment 9) -- but only ever a real number once the calculation
// genuinely has what it needs: computeUncommittedCash requires at least one
// CashReserve to mean anything (zero reserves is indistinguishable from
// "never configured"), computeInvestableCash further requires at least one
// Obligation for the same reason. IncomeStream data is deliberately NOT a
// gate here -- neither underlying function consumes income at all, so
// requiring it would be demanding data the calculation doesn't use.
export function GenuinelyFreeSection({ state }: { state: GenuinelyFreeState }) {
  if (state.kind === "incomplete") {
    const { text, href } = MISSING_COPY[state.missing];
    return (
      <section className="space-y-1">
        <SectionLabel>What&apos;s genuinely free</SectionLabel>
        <Link href={href} className="flex items-center justify-between gap-2 text-sm text-muted-foreground hover:text-primary">
          <span>{text}</span>
          <span aria-hidden>›</span>
        </Link>
      </section>
    );
  }

  const { amount, currency, conversionIncomplete, eligibleCash, reservedCash, relevantObligations } = state;

  return (
    <section className="space-y-2">
      <SectionLabel>What&apos;s genuinely free</SectionLabel>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <Answer>{formatMoney(amount, currency)}</Answer>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        {conversionIncomplete && (
          <Meta>Some balances couldn&apos;t be converted to {currency} — this total may be incomplete.</Meta>
        )}
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total eligible cash</span>
            <span className="font-amount">{formatMoney(eligibleCash, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">− Reserved cash</span>
            <span className="font-amount">{formatMoney(reservedCash, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">− Relevant upcoming obligations</span>
            <span className="font-amount">{formatMoney(relevantObligations, currency)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium">
            <span>= Genuinely free</span>
            <span className="font-amount">{formatMoney(amount, currency)}</span>
          </div>
        </div>
      </details>
      <Meta>Not investment advice — a cash-availability calculation based on your reserves and mandatory obligations due soon.</Meta>
    </section>
  );
}
