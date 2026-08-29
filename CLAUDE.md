# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before doing anything else

Read `PROGRESS.md` at the repo root. It tracks what's actually built vs.
stubbed, known gaps, and the recommended next step — this file (CLAUDE.md)
covers stable architecture/commands, not changing status; don't duplicate
between them.

If touching `apps/web`, also read `apps/web/AGENTS.md` first. This project
is on **Next.js 16**, which has real breaking changes from older training
data (async `params`/`searchParams`/`cookies()`, `middleware.ts` renamed to
`proxy.ts`, Tailwind v4's CSS-based config instead of `tailwind.config.js`,
etc.) — check `apps/web/node_modules/next/dist/docs/` for the current API
before assuming a pre-16 convention still applies.

## Commands

This is a pnpm workspace monorepo (`pnpm-workspace.yaml`: `apps/*`,
`packages/*`). Run `pnpm install` once at the repo root — never inside a
sub-package.

```bash
# Web app (Next.js, Turbopack)
pnpm dev                 # start the web app dev server (apps/web)
pnpm build               # production build of the web app
pnpm --filter web lint   # eslint (flat config; `next lint` was removed in v16)
pnpm --filter web exec tsc --noEmit   # typecheck (no root-level aggregate typecheck script)

# Worker (cron jobs, apps/worker)
pnpm dev:worker                # tsx watch mode
pnpm --filter worker typecheck # tsc --noEmit

# Database (packages/db, Prisma + Postgres)
pnpm db:generate   # regenerate the Prisma client after schema.prisma changes
pnpm db:migrate    # prisma migrate dev (local/dev only)
pnpm db:studio     # Prisma Studio
pnpm db:seed       # seed the 3 starter category templates

# Tests
pnpm test                                   # runs vitest across all packages (currently only packages/finance-logic has tests)
pnpm --filter @finance-app/finance-logic test              # just that package
pnpm --filter @finance-app/finance-logic exec vitest run src/__tests__/budget.test.ts   # a single test file
```

`pnpm --filter web` / `worker` resolve fine even though the package names
are scoped (`@finance-app/web`, `@finance-app/worker`) — pnpm matches on
the directory basename too.

No Postgres is set up in this environment by default — `DATABASE_URL` must
point at a real instance (see `.env.example`) before `db:migrate`/`db:seed`
or any page that queries the database will work.

## Architecture

**Monorepo shape**: `apps/web` (Next.js UI + server actions), `apps/worker`
(Node process for scheduled jobs — currently all stubs, see `PROGRESS.md`),
`packages/db` (single source of truth for the Prisma schema + a shared
`prisma` client singleton exported from `index.ts`), `packages/finance-logic`
(pure, framework-free functions for budget-period math and recurring-charge
detection scoring — this is the one package with real unit tests; keep new
financial-calculation logic here, not inline in route/server-action files,
so it stays testable without a database).

**Two Postgres schemas in one Prisma file**
(`packages/db/prisma/schema.prisma`): Auth.js's Prisma adapter requires its
models to be named exactly `User`/`Account`/`Session`/`VerificationToken`
(it hardcodes those Prisma Client accessor names), which collides with the
domain's own "financial account" concept. Resolved by putting Auth.js's
models in an `auth` Postgres schema (`@@schema("auth")`) and everything
else in `app` (`@@schema("app")`), with the domain model named
`FinancialAccount` instead of `Account`. `AppUser` is the domain's 1:1
profile row (`defaultCurrency`, `locale`, `timezone`), separate from
Auth.js's `User`, created via the `createUser` event in `auth.ts`.

**Auth boundary is NOT the proxy file.** `src/proxy.ts` only redirects
unauthenticated *page views* to `/sign-in` for UX — Next.js 16 explicitly
warns that a routing change can silently drop proxy/middleware coverage,
and Server Functions bypass it if their route isn't matched. Every server
action and data-fetching function instead calls `requireUserId()`
(`src/lib/session.ts`) independently and scopes its query by the returned
id. Follow this pattern for any new mutation/query — don't rely on the
proxy redirect alone.

**Money amounts and transfers**: `Transaction.amount` is signed (negative =
money out) and stored as `Decimal`. A transfer between the user's own
accounts is two linked `Transaction` rows (`isTransfer: true`,
`transferPairId` pointing at each other) rather than a single row, so
transfers never inflate income/spending totals in any aggregate query —
always filter `isTransfer: false` when summing spend/income.

**Budget engine — three modes on one mechanism**
(`Category.budgetType`): `monthly_reset`, `rollover_envelope`, and
`sinking_fund` are not three separate code paths scattered around the
app — they're three pure functions in `packages/finance-logic/src/budget.ts`
(`computeMonthlyResetBudget`, `computeRolloverEnvelopeBudget`,
`computeRequiredContribution`) that `src/app/(app)/budgets/page.tsx` calls
with actual transaction sums fetched from the DB. `Budget` rows are
versioned (never edited in place — `setBudget` in `budgets/actions.ts`
closes the old row via `effectiveTo` and inserts a new one), so changing a
budget amount doesn't rewrite history. Rollover chains are capped at
`MAX_ROLLOVER_LOOKBACK_PERIODS` (24).

**Categorization is rule-based first, AI second (AI not yet built)**:
`src/lib/categorization.ts` — `applyCategorizationRules` runs on every
import/manual entry and matches against the user's own
`categorizationRules` (exact merchant / contains / regex, by priority).
`recordCategoryCorrection` is the active-learning loop: any time a user
sets/changes a transaction's category (via `setTransactionCategory` in
`transactions/actions.ts`), it creates or updates a
`source: learned_from_correction` rule keyed on the normalized merchant
name (`normalizeMerchantKey` in `packages/finance-logic`), so the same
merchant is never asked about twice. The Gemini AI fallback batch job this
is designed to plug into does not exist yet (`apps/worker/src/jobs/index.ts`
→ `runCategorizationBatch`).

**CSV import** (`transactions/import-csv-dialog.tsx` +
`importCsvTransactions` in `transactions/actions.ts`): column mapping is
detected client-side (Papaparse reads just the header row) so the user
picks which CSV column is date/description/amount/merchant before
submitting: everything (file + mapping) goes through in one form
submission. Dedup on re-import uses a SHA-1 hash of
`(accountId, rawDate, description, amount)` stored as
`externalTransactionId`, relying on the schema's
`@@unique([accountId, externalTransactionId])`.

**UI theming**: shadcn/ui's default palette is intentionally overridden —
see `apps/web/DESIGN.md` for the actual color tokens/rationale before
changing anything in `globals.css`. Konsta UI provides the mobile PWA
bottom tab bar (`src/components/app-nav.tsx`'s `MobileTabbar`, rendered
only below `md`); a plain top nav (`DesktopNav`) handles larger viewports.
Both read the same route list, so add a new top-level section in one place
(`NAV_ITEMS` in `app-nav.tsx`), not two.
