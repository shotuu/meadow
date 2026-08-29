# Meadow — Progress

Personal finance tracking app (formerly discussed as a generic "finance-app").
Started 2026-08-27. This file is the source of truth for project status —
read it at the start of any future session before assuming what exists.

## Status: all six original phases + FX conversion built, verified, and live in production (2026-08-29)

Everything below has passed `tsc --noEmit`, `eslint`, `vitest` (30/30 tests),
and `next build`. As of 2026-08-28 it has also been exercised against a real
Postgres instance and clicked through in a real browser — this is no longer
just "builds clean," it's "actually works":

- Local Docker Postgres (`meadow-postgres`, `postgres:16-alpine`, host port
  **5433** — 5432 was already taken by an unrelated container on this
  machine) runs `pnpm db:migrate` + `pnpm db:seed` cleanly.
- A real Google OAuth client was created (Web application type, redirect URI
  `http://localhost:3000/api/auth/callback/google`) and wired into `.env` as
  `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Full Google sign-in flow works:
  account chooser → consent → session created → `AppUser` row created via
  the `createUser` event.
- Onboarding (currency + category template picker) → redirects to
  `/accounts?onboarded=1` correctly.
- Created a real account, added two manual transactions (one with a
  merchant name, one without), confirmed the DB round-trips correctly on
  the transactions list.
- Confirmed the active-learning categorization loop actually writes a rule:
  setting a category on a transaction *with* a merchant name created an
  `exact_merchant` / `learned_from_correction` row in
  `categorization_rules` (verified via direct `psql` query); setting one
  *without* a merchant correctly no-ops, per
  `recordCategoryCorrection`'s early return in
  `apps/web/src/lib/categorization.ts:59` — that's a deliberate merchant
  != null guard, not a bug.
- Set a monthly budget on Groceries ($400) and confirmed
  `computeMonthlyResetBudget` correctly computed remaining/safe-to-spend
  against the real $42.17 transaction.
- Dashboard net worth and recent-transactions list matched the DB exactly.

Test data from the click-through has been wiped from the local dev DB
(0 rows in `accounts`/`transactions`/`budgets`/`categorization_rules` as of
2026-08-28) — it's a clean slate, still onboarded as the same signed-in user.

**Theme overhaul (2026-08-28, two revisions):** replaced the original
deep-teal/near-black palette with a brighter "Meadow" one. v1: grass-green
primary (hue 150), warm sunlit neutral background, emerald `positive` /
terracotta `negative`, wildflower `chart-1`..`chart-5`. v2 (later same
day): an app icon generated externally for a Plaid Production-access
application came back in a different emerald/teal (`#3A9979`, hue 167.5)
that read better as a brand mark, so `primary` was re-derived to match the
icon exactly, and `positive` moved to hue 145 (v1's old primary hue) to
avoid colliding with the new primary's hue. Every color pair — both
revisions — was run through the data-viz skill's `validate_palette.js`
six-check method (lightness band, chroma floor, CVD separation, WCAG
contrast) rather than eyeballed. Full token table, hex values, and the
exact rationale/history are in `apps/web/DESIGN.md` — read that before
touching `globals.css` again, since the dependency order (icon color drives
primary, primary drives whether positive needs to move) isn't obvious from
the CSS alone.

**App icon (2026-08-28):** `apps/web/src/app/icon.png` (512×512) +
`apple-icon.png` (180×180) — a cream tulip-and-leaves glyph on the primary
teal field, replacing both the Next.js default placeholder favicon and the
earlier v1 hand-authored SVG leaf icon (`icon.tsx`, now deleted). Sourced
from an external generation, then color-corrected in-repo to the exact
brand hex and cropped to a transparent-cornered square (the source file's
"transparent" background turned out to be a baked-in checkerboard with
`alpha=255` throughout — see `DESIGN.md`'s App icon section for how that
was handled). Fixed a real bug while wiring this in: `apps/web/src/proxy.ts`'s
matcher excluded `favicon.ico` and `manifest.webmanifest` from the
auth-redirect but not `icon`/`apple-icon` — signed-out visitors would have
gotten the sign-in page's HTML back instead of the icon image. Verified
both render correctly for logged-out requests after the fix.

Not yet deployed to Railway — this is local-only as of 2026-08-28.

**Railway deployment (2026-08-28):** the `meadow` Railway project now
actually exists (project id `e1df3c08-281d-4e56-8476-fb07c02385d4`,
`production` environment) with three live services: `Postgres`, `web`
(Next.js), `worker` (cron skeleton). Deployed via `railway deploy`/MCP
tarball upload from the local directory — **no GitHub repo connected yet**
(this repo has no commits/remote at all; deploys are one-shot uploads, not
CI-triggered). Key setup details a future session needs:
- Both `web` and `worker` use custom build/start commands (not root
  directory scoping) because this is a shared pnpm monorepo — see
  `https://docs.railway.com/deployments/monorepo#deploying-a-shared-monorepo`.
  `web`: build `pnpm --filter web build`, start `pnpm --filter web start`,
  pre-deploy `pnpm --filter @finance-app/db migrate:deploy` (runs the
  Prisma migration before every deploy). `worker`: build
  `pnpm --filter worker typecheck` (no real build step, tsx runs `.ts`
  directly), start `pnpm --filter worker start`.
- Added a `postinstall: "prisma generate"` script to
  `packages/db/package.json` — Railway's install phase runs
  `pnpm install` automatically but was never generating the Prisma client,
  which the original build depended on a manual step for. This fixes both
  Railway builds and any fresh local clone.
- `DATABASE_URL` on both `web` and `worker` is a Railway reference
  variable (`${{ Postgres.DATABASE_URL }}`), not a copy-pasted string —
  stays correct if Postgres ever moves.
- Live URL: `https://web-production-9f3f6.up.railway.app`. The same Google
  OAuth client used for local dev now also has this URL's
  `/api/auth/callback/google` as a second authorized redirect URI (Google
  Cloud Console → the `Meadow` OAuth client) — one client, two redirect
  URIs, not a separate prod client.
- Production DB was migrated (via the pre-deploy command) but **seeding
  required a manual step**: Railway's Postgres only exposes an internal
  hostname (`postgres.railway.internal`) by default, unreachable from a
  local machine, so a temporary public TCP proxy was created, `pnpm
  --filter @finance-app/db seed` was run against it from local, and the
  proxy was torn down immediately after. If category templates are ever
  missing after a schema reset in production, repeat that (`railway
  tcp-proxy create --port 5432 --service Postgres`, seed, `railway
  tcp-proxy delete <id> --yes`) rather than leaving a proxy open.
- Verified end-to-end in the browser against production: Google sign-in →
  onboarding (category templates render correctly, confirming the seed
  worked) → same theme renders correctly on the live domain.
- Not yet done: no custom domain (still on the `*.up.railway.app`
  subdomain), no GitHub-based CI/CD (redeploys require re-running `railway
  deploy` from local), worker has no monitoring/alerting beyond Railway's
  own dashboard.

**Phase 2 — Plaid, built and verified (2026-08-28):** no longer a stub.
New shared package `packages/plaid-sync` (mirrors the `finance-logic`
pattern — raw TS, no build step, consumed directly via workspace protocol)
holds everything both `apps/web` and `apps/worker` need, since those two
apps can't import from each other directly:
- `client.ts` — singleton `PlaidApi` client from `PLAID_CLIENT_ID` /
  `PLAID_SECRET` / `PLAID_ENV`.
- `accounts.ts` — maps Plaid's `AccountType`/`AccountSubtype` onto our
  `AccountType` enum and creates `FinancialAccount` rows (skips ones
  already linked, matched on `externalAccountId`).
- `sync.ts` — `syncPlaidItem(plaidItemId)`: pages through
  `/transactions/sync` with the stored cursor, applies
  added/modified/removed, negates Plaid's amount sign (Plaid: positive =
  money out; this schema: negative = money out), runs the same rule-based
  categorization pass as manual/CSV entry, persists the new cursor.
- `link.ts` — `createPlaidLinkToken(userId)` and
  `linkPlaidItem(userId, publicToken, institutionName)` (token exchange →
  `PlaidItem` row → initial `accountsGet` → immediate `syncPlaidItem` so
  the user sees transactions right away instead of waiting for the nightly
  job).
- `categorize.ts` — a deliberate near-duplicate of
  `apps/web/src/lib/categorization.ts`'s rule-matching pass, not an import
  (apps can't cross-import each other) — keep both in sync if the matching
  logic ever changes.

`apps/web`: `accounts/plaid-actions.ts` (server actions wrapping the two
link functions) + `accounts/connect-plaid-button.tsx` (client component,
`usePlaidLink` from `react-plaid-link`) + a "Connect a bank" button on the
accounts page. `apps/worker`: `syncPlaidAccounts()` in `jobs/index.ts` now
loops every `active` `PlaidItem` and calls `syncPlaidItem`, catching
per-item errors so one broken Item doesn't block the rest (still on the
nightly cron schedule already wired in `src/index.ts`).

**Verification note:** the Plaid Link widget renders inside a cross-origin
iframe (`cdn.plaid.com`) that the `claude-in-chrome` browser-automation
tool could not reliably click into (coordinate clicks landed but never
focused/typed into the phone-number field or the "Continue without phone
number" link, across several attempts) — this is a tool limitation, not an
app bug; a human clicking normally in a real browser will not hit this.
Verified instead via Plaid's own sandbox bypass endpoint
(`/sandbox/public_token/create` against `ins_109508`, "First Platypus
Bank"), calling `linkPlaidItem` directly: created 14 accounts with correct
type/classification mapping, synced 16 transactions with correctly negated
amounts and rule-based categorization applied. Ran `syncPlaidAccounts()`
(the actual worker job) twice more against the same item — second call
picked up 32 added + 16 modified (Plaid's sandbox simulates realistic
pending→posted transitions across calls, this is expected sandbox
behavior, not a dedup bug — total transaction count matched exactly, zero
duplicate-key errors), third call correctly settled to `+0 ~0 -0`,
confirming cursor persistence and idempotency. All test data (accounts,
transactions, the PlaidItem) was deleted afterward — local DB is a clean
slate again. Not yet done: no Plaid webhook handling (relies entirely on
the nightly cron poll), not deployed/tested against the Railway production
environment yet (worked locally only).

**Security hardening for Plaid Production access review (2026-08-28):**
while filling out Plaid's Production-access application (security
questionnaire, privacy-policy question, data-retention question), several
"No" answers turned out to be genuinely worth fixing rather than just
explaining away, even for a single-user app — built real infrastructure
for them instead:
- **Plaid access tokens are now encrypted at rest.** They were plaintext
  in `PlaidItem.accessToken` before this — a real gap, since that token is
  a standing credential to the user's bank data at Plaid, not just app
  metadata. `packages/plaid-sync/src/crypto.ts`: AES-256-GCM,
  versioned format (`v1:<iv>:<authTag>:<ciphertext>`, each base64) so the
  algorithm can change later without breaking already-encrypted rows.
  Keyed by a new `ENCRYPTION_KEY` env var (32 bytes/64 hex chars,
  `openssl rand -hex 32`) — **added to local `.env` and `.env.example`,
  but NOT yet added to Railway** (both `web` and `worker` need it, since
  `link.ts` encrypts on write and `sync.ts` decrypts on read, and both
  paths run in both services... actually only `web` calls `link.ts`, but
  `worker` calls `sync.ts`, so both services need the key). Verified via a
  real sandbox link+sync+decrypt+revoke round trip — see
  `packages/plaid-sync/src/unlink.ts`'s `removeAllPlaidItems`.
- **Real account/data deletion**, not documentation of an absence:
  `apps/web/src/app/(app)/settings/` — a Settings page (added to
  `NAV_ITEMS` in `app-nav.tsx`, so it's on both desktop nav and the mobile
  tabbar) with a type-to-confirm "Delete all my data" flow. The server
  action revokes Plaid's access first (calls `/item/remove` via
  `removeAllPlaidItems` *before* deleting local rows — the access token
  needed for that call is gone once the row is), then deletes the `User`
  row, which cascades through `AppUser` and every `onDelete: Cascade`
  child table (all 15+ of them — transactions, accounts, budgets,
  categories, categorization rules, everything) in one operation. Verified
  the cascade actually works end-to-end with a throwaway test user
  (created User→AppUser→FinancialAccount→Transaction→Category, deleted
  the User row, confirmed all four child counts went to zero) rather than
  trusting the schema's `onDelete: Cascade` annotations blindly.
- **Privacy policy published**: `apps/web/src/app/privacy/page.tsx`,
  publicly reachable (added `privacy` to the `proxy.ts` matcher exclusion
  list alongside `icon`/`apple-icon`/`favicon.ico` — the same class of bug
  as before: a route added without updating the auth-redirect matcher
  would otherwise bounce signed-out visitors to `/sign-in` instead of
  showing them the policy).
- **`SECURITY.md`** at the repo root — an honest writeup of actual
  practices (not a template filled with aspirational claims): what's real
  (auth boundary, encryption in transit/at rest, secrets management,
  supply-chain lockfile verification, the new deletion capability) stated
  plainly next to what's explicitly *not* in place (no RBAC — structurally
  N/A for one person, no vulnerability scanner, no confirmed disk-level
  encryption from Railway, no formal incident-response team). This is
  meant to be pointed at, not just written for the occasion.
- **Deliberately not built**: RBAC, periodic access reviews, automated
  employee de-provisioning, a zero-trust architecture, a dependency
  vulnerability scanner (blocked on there being no Git remote/CI at all —
  a real prerequisite gap, not this session's scope) — these describe
  organizational processes that don't apply to a one-person project, and
  building fake infrastructure to satisfy a checklist would have been
  worse than answering "No" honestly.
- Whether Railway's Postgres volumes are encrypted at rest by default is
  still an open, unconfirmed question — checked Railway's own docs
  (`data-storage`, `volumes`, `databases`, `platform/railway-metal`,
  `enterprise/compliance`) and found no explicit statement either way;
  their docs do say database templates are "unmanaged services" where
  security is the user's responsibility. Recorded as "No" / unconfirmed in
  the Plaid form rather than assumed "Yes." If this ever gets resolved
  (e.g. by emailing Railway directly), update this note and `SECURITY.md`.

**Phase 5 — Recurring detection, built and verified (2026-08-28):** the math
in `packages/finance-logic/src/recurring.ts` existed already; nothing
called it. `apps/worker/src/jobs/recurring.ts`
(`recomputeRecurringSeriesForAllUsers`) now does: groups every user's
non-transfer, named-merchant transactions by `normalizeMerchantKey`, scores
each group with `detectRecurring`, and upserts `RecurringSeries` rows —
including lifecycle transitions (`active` → `missed` → `cancelled`,
`amount_changed`) logged as `RecurringSeriesEvent` rows, a table that had
zero writers before this. New UI:
`apps/web/src/app/(app)/recurring/page.tsx`, grouped into "Needs
attention" (missed) / "Active" / "No longer recurring" (cancelled),
merchant display name pulled from a linked transaction rather than the
normalized `merchantKey`. Verified with synthetic data: a 4-month Netflix
pattern correctly detected as monthly/90% confidence; a stale gym
membership correctly flagged `missed` then `cancelled` once its
transactions were removed entirely, both with the expected
`RecurringSeriesEvent` rows.

**Phase 4 — Gemini AI categorization, built and verified (2026-08-28):**
`apps/worker/src/jobs/categorize.ts`, using `@google/genai` (the current
SDK — the older `@google/generative-ai` is stalled at 0.24.1, confirmed via
`npm view` before picking one). Batches *all* of a user's
`categorySource: uncategorized` transactions into a single Gemini call per
user (not one call per transaction — matters on the free tier) using
structured JSON output (`responseSchema`, not free-text parsing), model
`gemini-flash-lite-latest` (checked the live model list via the real API
key rather than guessing a model name from training data — see the
`?key=...&models` listing, which surfaced a full lineup up to
`gemini-3.7-flash` that wasn't in training data). Suggestions are validated
against the user's real category ids before being applied — a hallucinated
id is silently dropped, not written. Verified against the real API (not
mocked): 5 varied transactions (Whole Foods, Uber, Shell, Netflix, AMC) all
categorized correctly in one call with 0.95–0.99 confidence.

**FX conversion, built and verified (2026-08-28):**
`apps/worker/src/jobs/exchange-rates.ts` fetches USD-based rates from
Frankfurter (ECB-sourced, free, no API key — confirmed reachable with a
live `curl` before building against it) and stores them as `ExchangeRate`
rows (upsert, so re-running the same day doesn't duplicate — verified).
New pure function `convertCurrency` in
`packages/finance-logic/src/currency.ts` (with real unit tests — 7 cases,
including the null-when-rate-missing degrade path) triangulates any
currency pair through USD as a pivot, so one daily fetch covers every pair
without storing N² rows. Dashboard
(`apps/web/src/app/(app)/dashboard/page.tsx`) now shows one converted
"Net worth (in your default currency)" headline card when multi-currency
(plus the existing per-currency breakdown below it, unchanged), falling
back gracefully with a visible note if a rate is missing rather than
silently showing a wrong number. Verified with a real $2,000 USD + €1,000
EUR scenario against the real fetched rate — converted total matched
exactly.

**Phase 6 — Alerts, built and verified (2026-08-28):**
`apps/worker/src/jobs/alerts.ts` evaluates 6 of the 8 `AlertRuleType`
values against real data: `budget_over_target`, `low_balance` (shares its
evaluator with `emergency_fund_below_floor` — same check, same config
shape), `large_transaction`, `recurring_missed`, `recurring_amount_changed`
(the last two consume the `RecurringSeries.status` this session's Phase 5
work now maintains), `sinking_fund_underfunded`. `portfolio_drift` is
deliberately left unevaluated — it needs `InvestmentHolding`/
`TargetAllocation` data that Phase 3 (IBKR) hasn't built, so there's
nothing real to check it against; evaluating it would mean fabricating a
result. State-based rules (budget/balance/sinking-fund) auto-resolve their
open `AlertEvent` once the condition clears, rather than leaving a stale
alert forever; event-based rules (large transaction) never re-fire for the
same transaction even after it's resolved. New UI:
`apps/web/src/app/(app)/alerts/` — an inbox of open alerts
(acknowledge/resolve) plus a rule-creation dialog with per-rule-type
conditional fields. Caught and fixed a real bug while building the dialog:
the numeric "value" input didn't reset when switching alert type (e.g.
picking "Low balance" after "Budget over target" left the field showing
the stale `100` instead of `0`) — root cause was `defaultValue` on an
uncontrolled `<Input>` only applying on initial mount, not on subsequent
prop changes; fixed by keying the input on `ruleType` so React remounts it
on type switch. Verified end-to-end against real data (not just unit
logic): created `budget_over_target` + `low_balance` + `large_transaction`
rules, seeded conditions that trigger all three, ran the evaluator,
confirmed exact expected messages; re-ran to confirm no duplicate alerts;
fixed the low-balance condition and re-ran to confirm auto-resolve.

**Nav growth (2026-08-28):** the shared `NAV_ITEMS` list in
`app-nav.tsx` (per its own comment, the one place to add a new top-level
section) is now at 8 entries after this session (added Recurring, Alerts,
Settings). Fixed a real crowding problem this caused on the mobile bottom
tab bar: switched `MobileTabbar` from icon+label to icon-only (removed
Konsta's `labels` prop) since 8 labeled tabs don't fit a phone-width bar
without wrapping/truncating — icon-only is standard practice at this item
count. Desktop nav is unaffected (still icon+label, plenty of horizontal
room). If this list keeps growing, the next real fix is a "more" overflow
grouping, not further shrinking the icons.

**Production incident + fix — worker crash loop on deploy (2026-08-28):**
deploying the Phase 4/5/6/FX batch above crashed the `worker` service
immediately on startup: `SyntaxError: The requested module
'@finance-app/finance-logic' does not provide an export named
'classifyConfidence'`. This was a real bug, not a Railway quirk — it
reproduced locally too once tested the right way (`pnpm --filter worker
start`, the actual entrypoint) — **the hand-run verification scripts used
throughout this session's development never actually exercised
`apps/worker/src/index.ts` itself**, only individual job functions imported
via ad-hoc absolute-path scripts, which happened not to trigger the
failure. Root cause: `packages/finance-logic/package.json` (and
`plaid-sync`, and `db`) had no `"type": "module"` field, so Node treated
them as CommonJS by default while `apps/worker` (which does declare
`"type": "module"`) imported multiple named exports from them via real
ESM `import`. That forces Node's CJS/ESM interop layer (static
export-detection, not real ESM binding) into play, which is fragile for
some multi-name re-export patterns — and apparently tipped over once
`finance-logic`'s `index.ts` barrel grew to re-export four files' worth of
names (`period`, `budget`, `recurring`, `currency`) instead of three. This
never surfaced in `next build`/`next dev` because Next.js resolves
everything through its own bundler (Turbopack), not Node's native ESM
loader — **only the worker's plain `tsx` runtime was ever exposed to it**.
Fix: added `"type": "module"` to `finance-logic`, `plaid-sync`, and `db`'s
`package.json` (the latter two fixed proactively, before they hit the same
edge case, not because they'd failed yet). Verified with the actual
`pnpm --filter worker start` command locally before redeploying, not just
`tsx --noEmit`. **Lesson for future sessions**: after adding a job to
`apps/worker/src/jobs/index.ts`, always run `pnpm --filter worker start`
locally (even briefly) before deploying — typecheck passing is not the
same as the entrypoint actually starting, and this session's test scripts
gave false confidence by sidestepping the real entrypoint entirely.

**Phase 3 — IBKR Flex Query, built and verified (2026-08-29):** no longer
blocked — the user provided a real Flex Web Service token and two Flex
Query IDs (Activity, Trade Confirmation). Via `AskUserQuestion`, scoped
this phase to the Activity query only (the schema's `IbkrFlexConfig` has
room for one `flexQueryId` per config; Trade Confirmation was left unused
rather than extending the schema for a query the user didn't ask for).
New shared package `packages/ibkr-sync` (same raw-TS-no-build-step pattern
as `plaid-sync`/`finance-logic`):
- `client.ts` — `fetchFlexStatement(token, queryId)`: IBKR's Flex Web
  Service is a two-step SendRequest → GetStatement XML API with polling
  retry (`MAX_STATEMENT_RETRIES=5`, `RETRY_DELAY_MS=3000` — the statement
  isn't always ready immediately). Uses the `Url` field IBKR's SendRequest
  response actually returns for the GetStatement call rather than
  hardcoding a host — verified against the real account that this matters:
  SendRequest is served from `ndcdyn.interactivebrokers.com` but the
  returned `Url` points at `gdcdyn.interactivebrokers.com`, a different
  host.
- `parse.ts` — `fast-xml-parser`-based parsing with an `asArray<T>()`
  helper, needed because the parser returns a single object (not a
  one-element array) when a repeating XML element only occurs once in a
  given statement — caught this via a real downloaded statement before
  writing the sync logic, not assumed from docs. Also
  `parseIbkrDate`/`parseIbkrDateTime` for IBKR's `yyyymmdd` and
  `yyyymmdd;HHmmss` formats.
- `sync.ts` — `syncIbkrFlexConfig(configId)`: decrypts the stored token,
  fetches the statement, and upserts three things from it —
  `OpenPositions` → `InvestmentHolding` + `InvestmentHoldingHistory`,
  `Trades` → `InvestmentTransaction` (buy/sell), `CashTransactions` →
  `InvestmentTransaction` (dividend/interest/fee by type string, or
  deposit/withdrawal by sign) — then updates
  `IbkrFlexConfig.lastRunAt`/`lastReportDate`.
- `link.ts` — `linkIbkrFlexConfig(userId, accountId, flexToken,
  flexQueryId)`: creates the `IbkrFlexConfig` row with the token encrypted
  (`encryptSecret`, same AES-256-GCM scheme Plaid tokens use — reasoned
  this is the same class of standing credential, not a lesser secret) then
  runs an immediate sync, same "don't make the user wait for the nightly
  job" pattern as Plaid's `linkPlaidItem`.

**Refactor**: the Plaid-token encryption helpers
(`encryptSecret`/`decryptSecret`) moved out of `packages/plaid-sync` into
a new shared `packages/crypto` package (verbatim logic, just relocated)
since IBKR needed the identical treatment — `plaid-sync` now depends on
`@finance-app/crypto` instead of owning its own copy.

`apps/web`: `accounts/ibkr-actions.ts` (`connectIbkrAccount` server
action — creates the `FinancialAccount` with `type: brokerage,
classification: asset, syncSource: ibkr_flex`, then calls
`linkIbkrFlexConfig`) + `accounts/connect-ibkr-dialog.tsx` (form: account
name, currency, Flex token as a password input, Activity Flex Query ID) +
a "Connect IBKR" button on the accounts page next to "Connect a bank".
Since IBKR accounts get no `Transaction` rows at all (unlike Plaid/manual
accounts), `accounts/page.tsx` was extended to compute their balance from
the latest-per-symbol `InvestmentHolding.marketValue` instead of a
transaction sum, and to show "N holdings" instead of "N transactions" on
their card (`syncSource === "ibkr_flex"` branches in both places).
`apps/worker`: `syncIbkrFlexAccounts()` in `jobs/index.ts` is no longer a
stub — loops every `active` `IbkrFlexConfig` and calls
`syncIbkrFlexConfig`, catching per-config errors so one broken config
doesn't block the rest (mirrors `syncPlaidAccounts`'s pattern exactly).

**Verified against the real account, not mocked**: ran the actual
SendRequest/GetStatement flow with the user's real token, parsed the real
returned XML field-by-field before writing the mapping code (this is what
caught the wrapper-tag structure above), then ran the real
`linkIbkrFlexConfig`/`syncIbkrFlexConfig` functions end-to-end: 13 holdings
and 156 transactions synced correctly on the first pass. Re-ran
`syncIbkrFlexConfig` again against the same config to check idempotency —
confirmed no duplicate rows. A dynamic `import()` in the throwaway test
script initially failed (`ERR_MODULE_NOT_FOUND`, resolving outside the
workspace tree) after the first sync had already succeeded but before
cleanup ran, leaving orphaned test rows; fixed by switching to a static
top-level import and adding an explicit `deleteMany` at the top of the
corrected script before re-running end-to-end. All test data (the account,
config, holdings, transactions) and the scratchpad file holding the
downloaded XML statement (real account number/name — deleted deliberately
rather than left on disk) were removed after verification. Also
click-tested the "Connect IBKR" dialog in a real browser (`/accounts`,
local dev server) — all four fields (name, currency, token, query ID) and
the Connect button render correctly.

**Known gap**: only the Activity Flex Query is used, per the user's own
scope choice — Trade Confirmation data (the second query ID they provided)
isn't pulled or stored anywhere. If more granular trade-confirmation-level
detail is ever needed later, `IbkrFlexConfig` would need a second
query-id field (or a second config row) to support it — not built now
since nothing calls for it yet.

**Deployed and the user's real account is live (2026-08-29):** both `web`
and `worker` redeployed to Railway with the Phase 3 code (deployment ids
`52606363` / `8dc66c58`) — build succeeded on both, `prisma migrate
deploy` reported no pending migrations (schema already had
`ibkr_flex_configs` from before this session), and the worker booted
clean via its real entrypoint (`[worker] connected to database,
scheduling jobs` / `scheduled jobs registered, idling`, no repeat of the
earlier `classifyConfidence` crash). The user then connected their real
IBKR account through the production "Connect IBKR" dialog themselves
(credentials entered directly by them, not passed through the assistant)
— confirmed live on `/accounts`: "IBKR Individual", $35,195.84, 13
holdings, `ibkr_flex` sync source. Phase 3 is fully done, not just built.

**Visual polish pass, built and verified (2026-08-29):** with every phase
functionally done, the UI itself had only had a color-token pass
(`apps/web/DESIGN.md`) — flat bordered cards everywhere, zero charts
despite `--chart-1`..`--chart-5` sitting unused in `globals.css`, icons
only in the nav, plain-text empty states. This pass extends the existing
design system rather than redesigning it:
- **Charting**: added shadcn's `chart` component (Recharts) via the shadcn
  CLI, not `@tremor/react` — Tremor was installed but never used and
  declares a peer dep on React ^18 on a React 19 project (an untested,
  already-flagged risk); the shadcn wrapper wires directly into the
  existing `--chart-1..5` tokens. `recharts` (`3.8.0`) is now a real
  `apps/web` dependency; Tremor is still installed and unused (removal
  left as optional cleanup, not done). Also added the `progress`,
  `skeleton`, `tooltip`, and `alert` shadcn primitives (previously
  missing) — `progress.tsx` gained a small `indicatorClassName` prop
  (shadcn components are meant to be owned/edited once installed) so
  budget meters can flip between `bg-positive`/`bg-negative`.
- **New shared helpers**: `apps/web/src/lib/format.ts` (`formatMoney`,
  deduplicating 5 copy-pasted copies), `apps/web/src/lib/balances.ts`
  (`summarizeByClassification`, shared by dashboard + accounts),
  `apps/web/src/components/skeletons.tsx` (`CardGridSkeleton`/
  `ListRowSkeleton`), `apps/web/src/components/empty-state.tsx`
  (`EmptyState`, replacing 9+ one-off plain-`<p>` empty states),
  `apps/web/src/components/composition-chart.tsx` (shared assets-vs-
  liabilities stacked bar, dashboard + accounts). New pure function
  `packages/finance-logic/src/spend.ts` (`summarizeSpendByCategory`) —
  groups transactions by category, ranks descending, folds anything past
  the top 4 into a single "Other" bucket (never generates a 6th
  categorical hue, per the dataviz skill's rule) — 6 new unit tests
  (43/43 passing across the package now).
- **Per-page**: Budgets got `Progress` meters on every recurring budget
  and sinking fund, plus a new `period-chart.tsx` mini bar chart for
  rollover categories (reuses the `periods` array the page already
  computed — no new query) with a dashed reference line at the budget
  amount, bars colored `positive`/`negative` by over/under. Accounts and
  Dashboard both got the shared composition chart plus account-type/
  net-worth icons. **Transactions got the one genuinely new query in this
  pass**: a "Spending this month" horizontal ranked bar chart, built from
  a new `transaction.findMany` scoped to the current month
  (`getPeriodRange("monthly", ...)` from `packages/finance-logic`,
  expense-kind, non-transfer) with each amount converted to the user's
  default currency via the existing `convertCurrency` + `ExchangeRate`
  pattern (mirrors the dashboard's converted net-worth card exactly,
  including the same graceful-degrade note if a rate is missing) before
  being summarized. Recurring got a confidence `Progress` meter next to
  the existing percentage text. Categories got a per-category color swatch
  (hashed category id → one of the 5 `chart-N` vars) and a kind icon.
  Alerts got severity icons (paired with the existing color badge, never
  replacing it — same "color + label, never color alone" principle
  `DESIGN.md` already applies to the category palette) and a bell icon per
  rule showing active/paused. Settings got icons on its two cards. Every
  route also got a `loading.tsx` using the new skeleton components.
- **Explicitly not built this pass** (flagged in the plan up front, not
  silently dropped): a true net-worth-over-time line chart (no
  balance-snapshot/history table exists — only point-in-time sums; would
  need a new schema + worker job, a bigger scope than this pass), and a
  recurring "upcoming charges timeline" (feasible from already-fetched
  data, just lower priority).
- **Verified**: `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web
  lint`, and the full `pnpm test` suite (43/43) all clean; `pnpm build`
  succeeded with no new warnings. Local DB was empty (this session's
  established clean-slate convention), so synthetic test data (accounts,
  categories, budgets, a sinking fund, transactions, a recurring series,
  alert events/rules) was seeded via a throwaway script, every changed
  route was clicked through in a real browser in both light and dark mode
  — including the over-budget (red, clamped at 100%) and under-budget
  (green) Progress states, the rollover period chart, and the
  multi-category spend chart — and `read_console_messages` showed zero
  hydration warnings or React errors on any page. All seeded test data was
  deleted afterward; local DB confirmed back to the pre-session baseline
  (14 template categories, zero accounts/transactions/budgets). Mobile
  viewport (<768px) was **not** directly screenshot-verified — the
  browser-automation tool's `resize_window` didn't reliably resize this
  session's actual capture viewport (a tool limitation, same class as the
  Plaid Link iframe issue noted earlier in this file) — confidence instead
  comes from code review: every new chart uses the same `w-full`/
  `ResponsiveContainer` fluid-width pattern, and grids reuse the
  already-verified `sm:grid-cols-2` classes already working at mobile
  width elsewhere in this app (the Konsta bottom tabbar). Worth an actual
  phone/narrow-window check next time a human is at the keyboard.
- Deployed to Railway (`web` service only — no worker or schema changes in
  this pass).

Local dev env setup notes (so a future session doesn't have to
rediscover this): `apps/web/.env`, `apps/worker/.env`, and `packages/db/.env`
are symlinks to the root `.env` (Prisma CLI and Next.js each only read
`.env` from their own CWD, and none of the workspace scripts previously
loaded the root file — this was a real gap, not just an unset variable).
`AUTH_SECRET` in `.env` was previously a literal placeholder string
(`"generate-with: openssl rand -base64 33"`) rather than an actual
generated secret; it's now a real generated value. Start the DB container
with `docker start meadow-postgres` (it's created, just needs starting
after a machine restart); if it's ever recreated, use
`-p 5433:5432` to match `DATABASE_URL` in `.env`.

## Locked-in decisions

- **Name**: Meadow. Checked for collisions — a B2B fintech (meadowfi.com)
  and a bank's "Meadows Financial" app exist, but no exact-match consumer
  budgeting app. Accepted as a soft collision, not a blocker (private app).
- **Hosting**: Railway (user already subscribed) — one project, three
  services: web (Next.js), worker (Node/cron), Postgres. Not yet created on
  Railway itself — only scaffolded locally.
- **Stack**: Next.js 16 (Turbopack, App Router, async params/searchParams —
  see `apps/web/AGENTS.md`, this Next version has real breaking changes from
  older training data), Auth.js v5 beta (Google OAuth, database sessions),
  Prisma 6 + Postgres, pnpm workspaces monorepo.
- **UI**: shadcn/ui (Nova preset, Radix-based) with a custom warm-neutral +
  deep-teal palette documented in `apps/web/DESIGN.md` (explicitly replacing
  shadcn's default achromatic theme to avoid the generic-AI-app look) +
  Konsta UI for the mobile PWA bottom tab bar. next-themes wired for
  light/dark. Charts use shadcn's `chart` component (Recharts) as of the
  2026-08-29 visual-polish pass — `@tremor/react` is still installed but
  was never used and is a candidate for removal.
- **AI categorization**: Gemini API **free tier**, chosen knowingly over
  paid Haiku despite the free-tier data-usage tradeoff (free tiers may train
  on submitted data). **Not implemented yet** — Phase 4.
- **Accounts**: single-owner only, no joint/shared multi-login for v1.
- **Rollover budget lookback**: capped at 24 periods (see
  `MAX_ROLLOVER_LOOKBACK_PERIODS` in `packages/finance-logic`).
- **Bank/brokerage sync**: Plaid for US banks (Phase 2, built) and IBKR
  Flex Query for brokerage (Phase 3, built — Activity query only, see
  Status section) are both done as of 2026-08-29. CSV import is permanent
  first-class support for anything else (e.g. non-US banks).

Full original architecture write-up (schema rationale, recurring-detection
algorithm design, AI pipeline design, phased build order) is in the plan
file from the planning session: it was written to
`~/.claude/plans/lets-continue-planning-about-compiled-teapot.md` on the
machine that built this — that path is local to one user's machine and one
Claude Code install, not part of the repo, so it will not exist in a fresh
clone or a different machine. Treat this PROGRESS.md as the durable
summary; re-derive further detail from the code itself if needed.

## What's built (Phase 1)

**Monorepo** (pnpm workspaces, no Turborepo):
- `apps/web` — Next.js app
- `apps/worker` — cron-job skeleton (see below, mostly stubs)
- `packages/db` — Prisma schema + generated client, `prisma/seed.ts`
- `packages/finance-logic` — pure, unit-tested budget/recurring-detection math

**Database schema** (`packages/db/prisma/schema.prisma`): full schema from
the architecture plan — accounts, transactions, transaction_splits,
categories, budgets, budget_period_snapshots, sinking_funds,
categorization_rules, recurring_series (+ transactions/events),
investment_holdings/transactions, target_allocations,
holding_bucket_assignments, alert_rules/events, import_batches,
csv_import_templates, category_templates. Auth.js tables live in a separate
`auth` Postgres schema to avoid the `accounts` name collision with the
domain's `FinancialAccount` model.

**Auth**: Google OAuth via Auth.js, database sessions, `auth.ts` +
`src/app/api/auth/[...nextauth]/route.ts`. `src/proxy.ts` redirects
unauthenticated page views to `/sign-in` — but per Next.js 16's own
guidance this is NOT the actual authorization boundary; every server
action/query independently calls `requireUserId()`
(`src/lib/session.ts`) and scopes by the returned id.

**Onboarding** (`src/app/onboarding/`): pick default currency + one of 3
seeded category templates (Personal Default / Freelancer / Family), which
*copies* rows into the user's own `categories` table.

**Core CRUD**, each with server actions in an `actions.ts` alongside the
route:
- `src/app/(app)/accounts/` — create/archive financial accounts
- `src/app/(app)/categories/` — create/archive categories with a
  `budgetType` (none / monthly_reset / rollover_envelope / sinking_fund)
- `src/app/(app)/transactions/` — manual entry (with transfer pairing so
  transfers never count as income/spend), CSV import with client-side
  column-mapping UI + server-side dedup via a content hash, inline category
  correction that feeds the rule engine
- `src/app/(app)/budgets/` — set a budget per category, add/contribute to
  sinking funds; renders live remaining/rollover/safe-to-spend-per-day
  numbers computed via `packages/finance-logic`
- `src/app/(app)/dashboard/` — minimal net worth (grouped by currency, no
  FX conversion yet) + recent transactions

**Categorization** (`src/lib/categorization.ts`): rule pass (exact
merchant / contains / regex against user's own `categorization_rules`) +
active-learning loop where any manual category correction creates/updates
a rule, **plus the Gemini AI fallback batch** (`apps/worker/src/jobs/categorize.ts`,
Phase 4, done 2026-08-28) for whatever the rule pass leaves uncategorized —
see the Status section for the full writeup.

**`packages/finance-logic`** (real unit tests — 37 passing): `period.ts`
(weekly/monthly/quarterly/annual period math), `budget.ts` (the three
budget-mode calculators + safe-to-spend/day), `recurring.ts`
(recurring-charge detection scoring, cadence bucketing, merchant-key
normalization), `currency.ts` (USD-pivot currency conversion, added
2026-08-28). `budget.ts` is called directly by the budgets page;
`recurring.ts` and `currency.ts` are now wired into the worker and
dashboard respectively (both done 2026-08-28, see Status section) — no
dead pure-function code left in this package as of this session.

## What's NOT built yet

- ~~**Phase 2 — Plaid**: no integration at all.~~ Done 2026-08-28 — see the
  Status section for the full writeup. New `packages/plaid-sync` package,
  a "Connect a bank" button on `/accounts`, and a real `syncPlaidAccounts()`
  worker job. Deployed to Railway.
- ~~**Phase 3 — IBKR Flex Query**: still not built~~ Done 2026-08-29 — see
  the Status section for the full writeup. New `packages/ibkr-sync`
  package, a "Connect IBKR" button on `/accounts`, and a real
  `syncIbkrFlexAccounts()` worker job. Verified against the user's real
  account (13 holdings, 156 transactions). No dedicated investment-holdings
  dashboard UI yet — holdings/balance show on the accounts page, but
  there's no per-holding detail view or allocation chart.
- ~~**Phase 4 — Gemini AI categorization batch**~~ Done 2026-08-28 — see
  the Status section. `apps/worker/src/jobs/categorize.ts`, verified
  against the real Gemini API (not mocked).
- ~~**Phase 5 — Recurring detection wiring**~~ Done 2026-08-28 — see the
  Status section. `apps/worker/src/jobs/recurring.ts` +
  `apps/web/src/app/(app)/recurring/page.tsx`.
- **Phase 6 — Alerts**: ~~nothing evaluates them~~ Done 2026-08-28 for
  6 of 8 rule types — see the Status section. `portfolio_drift` still
  unevaluated (no investment data yet, blocked on Phase 3). Still not
  built: cash-flow forecast, portfolio-drift dashboard, subscriptions
  overview page (the `/recurring` page from Phase 5 is adjacent to this
  but isn't a dedicated "subscriptions" view).
- ~~**FX conversion**~~ Done 2026-08-28 — see the Status section.
  `apps/worker/src/jobs/exchange-rates.ts` + dashboard headline card.
- ~~**Railway deployment**: nothing has been deployed.~~ Done 2026-08-28 —
  see the Railway deployment note in the Status section above. Still open:
  no GitHub-connected CI/CD, no custom domain.
- ~~**Google OAuth credentials**: not created/configured~~ Done 2026-08-28
  for both local dev and the Railway production URL — one OAuth client,
  two authorized redirect URIs (see Status section).
- ~~**Real database testing**: never run against a live Postgres.~~
  Done 2026-08-28 — see Status section above.

## Known gaps / rough edges to revisit

- Transactions list page caps at 100 rows, no pagination yet.
- Tremor (`@tremor/react` v3) is still an installed, unused dependency —
  the 2026-08-29 visual-polish pass used shadcn's `chart` (Recharts)
  component instead, specifically to avoid Tremor's untested React
  18-peer-dep-on-React-19 risk. Tremor itself was never exercised and
  removing it is safe, low-priority cleanup.
- Mobile viewport (<768px) for the new charts/composition bars added in
  the 2026-08-29 visual-polish pass was not directly screenshot-verified
  — the browser-automation tool's window resize didn't reliably affect
  the actual screenshot capture in that session. Code review gives
  reasonable confidence (same fluid-width patterns already verified
  elsewhere), but worth an actual phone or narrow-window check.
- One cosmetic (non-blocking) Turbopack build warning about Prisma's engine
  binary lookup getting traced into the proxy/middleware bundle — known
  upstream Prisma+Next.js interaction, not something to "fix" casually.
- CSV import currently assumes a single flat header row with one date /
  description / amount / (optional merchant) column each — no support yet
  for the `csv_import_templates` table's intended reusable per-institution
  presets (the schema supports it, the UI doesn't use it yet).
- No tests beyond `packages/finance-logic` — the web app's server actions
  and CSV import logic are unit-test-free. The new worker jobs
  (`recurring.ts`, `categorize.ts`, `exchange-rates.ts`, `alerts.ts`) were
  verified with real, hand-run scripts against real data/APIs during
  development (see the Status section writeups for exactly what was
  checked), but none of that is captured as an automated, repeatable test
  suite — it was manual verification, not regression protection. If this
  logic changes later, it'll need re-verifying by hand again unless tests
  get written.
- The `NAV_ITEMS` list (`app-nav.tsx`) is at 8 entries — see the "Nav
  growth" note in the Status section. Mobile is fixed (icon-only tabbar);
  if more top-level sections get added, the next real fix is an overflow
  grouping, not shrinking further.
- No cron-schedule tuning: `apps/worker/src/index.ts` runs
  `recomputeRecurringSeries`, `runCategorizationBatch`, and
  `evaluateAlertRules` nightly on fixed staggered times (already wired
  before this session), but there's no thought yet given to *ordering*
  dependencies between them (e.g. alerts' `recurring_missed` check reads
  `RecurringSeries.status`, so if `evaluateAlertRules` ever ran before
  `recomputeRecurringSeries` in the same night it'd be checking yesterday's
  state — currently fine because of the existing stagger, but worth
  knowing if the schedule ever changes).

## Recommended next step

As of 2026-08-29, every phase from the original build order is built and
verified end-to-end: Phase 1 (core ledger), Phase 2 (Plaid), Phase 3
(IBKR Flex Query, Activity data only), Phase 4 (Gemini AI categorization),
Phase 5 (recurring detection), Phase 6 (alerts, 6/8 rule types), plus FX
conversion — see the Status section for what was verified for each. A
visual-polish pass (charts, progress meters, icons, empty states, loading
skeletons across all 8 pages) was also completed and deployed the same
day — see the Status section's "Visual polish pass" writeup. Everything
has been deployed to Railway; double check the *latest* local changes have
actually been pushed before assuming production is current, since deploys
in this project are manual `railway deploy` calls, not CI-triggered on
every change. The local dev DB is a clean slate (all test data wiped after
each verification pass).

With all phases built and the UI no longer bare, remaining work is smaller
polish/verification items rather than new integrations:
- Actually verify the visual-polish pass's charts at a real mobile width
  (phone or narrow browser window) — the automated check for this was
  inconclusive due to a tool limitation, see "Known gaps" above.
- `portfolio_drift` alerts are still unevaluated — Phase 3 now provides
  real `InvestmentHolding` data, but nothing populates `TargetAllocation`
  rows yet, so there's still nothing to diff against. Building this means
  either a UI for the user to set target allocations, or deciding to skip
  it since this is a single-user app and the user may just check IBKR
  directly.
- No dedicated investment-holdings dashboard UI — holdings/balance show
  on the accounts page, but there's no per-holding detail view, cost
  basis, unrealized gain/loss, or allocation chart.
- Actually configure at least one `AlertRule` for the real account (the
  `/alerts` UI and evaluator both work, but as of this writing zero rules
  are configured for actual ongoing use — everything verified so far used
  throwaway test data that was cleaned up afterward).
- A dedicated subscriptions/recurring-spend summary view — `/recurring`
  covers the raw data but a spend-by-cadence rollup (e.g. "$47/month in
  active subscriptions") would be a natural, cheap addition on top of data
  that already exists.
- No automated test coverage for the worker jobs or IBKR/Plaid sync logic
  (see "Known gaps" above) — all verification so far has been manual,
  hand-run scripts against real APIs/data.
