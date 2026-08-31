# Security

Meadow is a personal finance application built and operated by a single
individual developer for personal use — not a company, and not (yet)
distributed to other users. This document describes the actual security
practices in place, written for accuracy rather than to satisfy a
checklist. Where something isn't in place, that's stated plainly rather
than implied otherwise.

**Contact:** wuscdaniel@gmail.com — the developer is the sole point of
contact; there is no security team or on-call rotation.

## Authentication

Sign-in is Google OAuth only (Auth.js v5, database sessions) — no
separate password exists for Meadow to compromise. See `apps/web/auth.ts`.

## Authorization

Every server action and data-fetching function independently calls
`requireUserId()` (`apps/web/src/lib/session.ts`) and scopes its query by
the returned id. The `proxy.ts` redirect-to-sign-in is a UX convenience
only, not the authorization boundary — Next.js 16 explicitly warns a
routing change can silently drop proxy coverage, so nothing relies on it
for actual access control.

## Encryption

- **In transit:** TLS on all network paths — the public app domain
  (auto-provisioned by Railway), the Plaid API, and Google's OAuth
  endpoints are all HTTPS-only.
- **At rest:** Plaid access tokens — the credential that grants ongoing
  access to a connected bank account — are encrypted with AES-256-GCM
  before being written to the database (`packages/plaid-sync/src/crypto.ts`),
  keyed by an `ENCRYPTION_KEY` environment variable never committed to the
  repository. Other stored data (transaction descriptions, amounts,
  category names) is not separately encrypted at the column level; it
  relies on the database's own storage security. Whether the underlying
  Postgres volume itself is encrypted at rest is not independently
  confirmed as of this writing — Railway's own documentation describes
  their database templates as "unmanaged services" without an explicit
  disk-encryption guarantee; this is a known open question, not an
  assumed "yes."

## Secrets management

All credentials (database URL, OAuth client secrets, Plaid API keys, the
encryption key) are environment variables, never hardcoded. `.env` is
gitignored in every workspace package. Production secrets live in
Railway's environment variable store, set per-service.

## Access control

Every piece of infrastructure this app runs on — Railway project, Google
Cloud project (OAuth client), Plaid dashboard — has exactly one account
holder: the developer. There is no role-based access control because
there is no second person to grant a differentiated role to. This is a
structural fact of a one-person project, not a gap to "fix" with process.
What *is* recommended and should be verified/enabled: multi-factor
authentication on the Railway account, the Google account, and the Plaid
dashboard account, since a compromise of any one of those accounts would
be a compromise of the whole system.

## Vulnerability management

- `pnpm`'s built-in supply-chain lockfile verification runs automatically
  on every install (visible in deploy logs as "Lockfile passes
  supply-chain policies") — this is a default of the package manager, not
  something manually configured in this repo.
- TypeScript strict mode and ESLint run as part of every build; broken or
  type-unsafe code does not deploy.
- As of 2026-08-30, GitHub Actions CI (typecheck/lint/test/build on every
  push) and Dependabot (version updates, security alerts, and automated
  security-fix PRs) are both live on `github.com/shotuu/meadow`, plus
  CodeQL static analysis via GitHub's managed default setup. Still no
  defined patch SLA — alerts are triaged manually as they appear.
- Dependabot's first real findings (a high-severity `deepmerge-ts` stack
  exhaustion and a moderate `uuid` buffer-bounds issue, both transitive)
  were fixed the same day: `node-cron` 3→4 dropped `uuid` from the tree
  entirely; Prisma 6→7 (a real architecture change — driver adapters
  replace the Rust query engine) still transitively pins the vulnerable
  `deepmerge-ts` even at its newest stable release (the actual fix needs
  Prisma 8, which is RC-only), so a pnpm override forces the patched
  version instead. Both were verified end-to-end against real local and
  production Postgres before deploying, not just typechecked.

## Data retention and deletion

Users can permanently delete their account and every piece of data tied
to it — connected banks, financial accounts, transactions, budgets,
categories, and categorization rules — from the in-app Settings page
(`apps/web/src/app/(app)/settings/`). Deletion also calls Plaid's
`/item/remove` to revoke Meadow's access at Plaid's end, not just delete
Meadow's local copy of the access token. There is no separate retention
schedule beyond "kept until the user deletes it" — for a single-user
personal app, an active deletion capability is the meaningful control,
not a time-based auto-expiry policy.

## Incident response

Informal, by necessity — single developer, no team to page. In the event
of a suspected compromise (e.g. a leaked credential), the response is:
rotate the affected secret (Google OAuth client secret, Plaid secret, or
`ENCRYPTION_KEY`), redeploy, and — if Plaid access tokens are suspected
compromised — revoke them via Plaid's dashboard directly rather than
relying on the app's own deletion flow.

**Exercised for real, 2026-08-31**: the Plaid production secret was found
in Railway's application logs in plaintext (an uncaught Plaid SDK error
carries its full HTTP request, headers included, on `.config`; Node's
default error logging serializes that whole). Rotated immediately in the
Plaid Dashboard and updated in both Railway and local `.env` — see
PROGRESS.md's writeup for the full incident and the code fix
(`packages/plaid-sync/src/client.ts`'s `callPlaid()`) that stops any Plaid
error from carrying secrets past this package's boundary going forward.

## Review

This document is updated when the system it describes changes, not on a
fixed schedule — there is no periodic formal review process, consistent
with everything above about this being a single-developer project rather
than an organization with a security program.
