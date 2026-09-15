# Architecture correctness sprint - 2026-09-15

Implemented against the existing working tree, including the in-progress planning, transfers, balance snapshots, and holding buckets. No commits, pushes, deployment, or changes to the existing application databases were performed.

## Reviewed defects

| Issue | Result |
| --- | --- |
| Account/category ownership | Supplied alert and transaction relationship IDs are checked against the authenticated owner. Alert account/category reads are also scoped by owner. Shared categorization ignores foreign or archived categories. |
| Plaid debt signs | Ingestion negates credit/loan balances, including lender credits. A schema marker distinguishes new canonical balances from existing provider-signed records; shared reads handle both. Historical snapshots are retained with valuation version 1. |
| Sold IBKR positions | Current holdings select the latest complete report per account. Sync atomically publishes report rows, explicit zero positions for exits, and the successful report date. Empty, older, missing-section, duplicate-symbol and malformed-date cases are handled explicitly. Multi-account queries must be split into separate configurations. |
| Mixed currencies | Account/portfolio values convert each native currency before aggregation. Budget spending uses the latest known FX on or before each transaction day. Historical portfolio charts use historical FX and show gaps where rates are missing. |
| Low-balance alerts | Pages, snapshots and low-balance alerts use the same database-backed balance reader. Imported transaction sums no longer override a reported balance. |
| Rollover edits | Each period uses its effective historical budget version, preserving accumulated carry. Same-period edits update the existing version. Category row locks serialize concurrent edits. Changing period or currency is rejected to avoid silently resetting history. Alerts include rollover in available allowance. |
| AI/manual edit race | Suggestions apply only while the transaction remains uncategorized, owned by the same user and outside transfers. Response shape/confidence are checked. Attempt timestamps rotate bounded batches past persistent `none` results. |
| Transfer suggestions | Already-linked investment movements are excluded before scoring. Unsupported investment pairs are excluded before greedy selection. Empty scans still remove stale pending candidates; cleanup cannot delete resolved decisions. Confirmation atomically claims the pending candidate. |
| Concurrent obligation payments | A PostgreSQL row lock protects the read/transition/write. Decimal arithmetic retains overpayments and advances completed recurring cycles. Negative resulting funding is rejected. |
| Recurring lifecycle | Resumed events require an actual new occurrence and a transition out of missed status. Groups distinguish merchant, account, currency and direction. Expense-change labels compare magnitudes. Calendar advances clamp month ends. Unambiguous legacy groups retain their identity/history. |
| Finverse OAuth state | An expiring random state is stored hashed, bound to the initiating browser cookie and authenticated user, and consumed atomically before exchanging the code. The form POST relays through a same-site GET so Lax cookies can be validated. Callback responses are not cached. |

## Shared architecture and operational changes

- Added `@finance-app/finance-data` for current holdings, account balances, historical valuation, budget progress, FX and categorization persistence. Pure rule matching lives in `finance-logic`.
- Manual same-currency transfers create both rows and reciprocal links in one transaction. Cross-currency entry is rejected until a received-amount workflow exists.
- Finverse refreshes existing pending/corrected transactions while preserving manual categorization and transfer decisions.
- Provider syncs use per-connection PostgreSQL advisory locks. The worker executes one ordered nightly workflow after 02:00 UTC, checks for catch-up at startup, retries hourly, records run outcomes and drains active work on shutdown. Failed provider refreshes stop downstream nightly calculations.
- Snapshots record source time when known, recording time, completeness, and valuation version. Snapshot failures propagate to callers instead of being reported as success.
- Dashboard account totals use grouped ledger queries. Current-holding readers no longer fetch every historical position merely to compute current values.
- CI now provisions disposable PostgreSQL, applies the migration chain, and runs the integration regressions in addition to unit tests.

## Migration and compatibility

Prepared `packages/db/prisma/migrations/20260915120000_architecture_correctness/migration.sql`. It adds balance-sign metadata, snapshot provenance, AI attempt time, recurring grouping keys, OAuth attempts and job-run outcomes. It replaces the merchant-only recurring uniqueness constraint with a grouping-key constraint.

The complete seven-migration chain was applied successfully to a disposable PostgreSQL 16 container on `127.0.0.1:55439/meadow_sprint_test`. The existing project database and production were untouched. Apply the migration before running this updated application against an existing database. Earlier snapshot values are not silently rewritten: version 1 remains distinguishable from newly calculated version 2.

## Verification

- 187 unit tests pass.
- 16 PostgreSQL integration tests pass using synthetic users, accounts and mocked provider/model responses.
- Web and worker TypeScript checks pass; web ESLint passes.
- Production build passes using Next.js webpack, including all 21 generated pages. The default Turbopack build encounters an environment-level port-binding restriction in CSS processing, including the approved retry; webpack was used to verify production compilation.
- PostgreSQL tests cover the actual server actions and shared readers, including concurrent payments and budget edits, ownership rejection, rollover/FX, legacy/canonical debt, alert balances, exited/empty IBKR reports, recurring lifecycle, reused transfer movements, OAuth expiry/replay, AI races/backlog, Finverse corrections, and snapshot provenance.

To run the integration suite locally, provision an isolated PostgreSQL 16 instance with database `meadow_sprint_test` on `127.0.0.1:55439`, apply migrations to that database explicitly, then set `MEADOW_TEST_DATABASE_URL` to its connection string when running `pnpm test`. The suite rejects other hosts, ports and database names. Ordinary tests skip these 16 database cases if that variable is unset.

## Remaining provider/product limitations

- IBKR cash/NAV is still not imported. UI labels explicitly identify positions-only balances, and holdings-derived snapshots remain incomplete. Complete brokerage equity requires a separately specified Cash Report/NAV import.
- Finverse transaction sign semantics were not established by the installed SDK or the accessible official documentation. Existing signs are preserved rather than guessed. Verify against a known bank debit and credit before treating Finverse data as export-grade; the real hosted OAuth round trip also still needs a provider/browser check.
- Missing FX cannot produce a misleading native-currency sum. Current account/budget calculations reject unavailable conversions; historical charts show gaps. Historical FX backfill is not included.
- Funding is still manually tracked planning data, not a payment ledger. Marking an obligation funded does not create or reconcile a bank payment.
- Export implementation remains pending. Use explicit field allowlists, exact Decimal strings, a versioned schema, private/no-store authenticated responses, a consistent database snapshot, and the new provenance fields. Never serialize provider or auth records wholesale.
