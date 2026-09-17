import { redirect } from "next/navigation";

// Holding detail moved to /invest/holdings/[symbol] as of Phase 5 of the
// UI/UX redesign -- Invest, not Accounts, owns portfolio content now. This
// shim keeps any bookmarked/shared /accounts/holdings/[symbol] link
// reachable rather than 404ing.
export default async function LegacyHoldingDetailRedirect({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  redirect(`/invest/holdings/${encodeURIComponent(symbol)}`);
}
