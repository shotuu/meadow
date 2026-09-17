# Design tokens

Base component library: shadcn/ui (Radix primitives, Nova preset structure) —
but the Nova preset's default palette is pure achromatic gray (0 chroma
everywhere), which is indistinguishable from most other AI-scaffolded apps.
Everything below replaces those default color tokens; component structure
and spacing/radius scale conventions from shadcn are kept.

## Color

**"Meadow" palette v2** (2026-08-28, second revision — see history below) —
a sunlit-meadow neutral (warm, faintly green-gold instead of true gray) +
a deep-emerald/teal primary (hue `167.5`), matched to the app's icon
(a cream tulip-and-leaves mark on a `#3A9979` field — see `icon.png` /
`apple-icon.png`), and a warm terracotta destructive color instead of pure
alarm-red.

**Palette history:** the original scheme was a muted deep-teal (hue `195`)
on an almost-achromatic gray, replaced 2026-08-28 (v1) with a brighter
grass-green primary (hue `150`) chosen to literally match the word
"meadow." Later the same day, a generated app icon (built for a Plaid
Production-access application) came back in a deeper emerald/teal
(`#3A9979`, hue `167.5`) that read better as a brand mark, so the primary
hue moved again to match the icon exactly (v2, this revision) — the
`positive` semantic token had to move too, since `#3A9979`'s hue (`167.5`)
nearly collided with v1's `positive` hue (`168`); `positive` is now hue
`145` (the old primary hue, repurposed) to keep the two visually distinct.
If the icon ever changes again, re-derive `primary` from its exact color
first, then re-check `positive` for a collision before touching anything
else — that's the actual dependency order, not "pick a nice green."

Every color pair below was checked against the data-viz skill's six-check
color method (`node scripts/validate_palette.js` from the `dataviz` skill) —
lightness band, chroma floor, CVD (colorblind) separation, and WCAG contrast
— not eyeballed. Text-on-fill pairs (`primary`/`primary-foreground`, etc.)
were verified at ≥4.5:1 in both modes; the two exceptions are noted below.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `oklch(0.985 0.012 110)` | `oklch(0.2 0.016 167.5)` | page background |
| `foreground` | `oklch(0.22 0.02 167.5)` | `oklch(0.96 0.01 110)` | body text |
| `card` | `oklch(0.995 0.008 110)` | `oklch(0.24 0.018 167.5)` | card surfaces |
| `primary` | `oklch(0.5 0.1 167.5)` (`#077558`) | `oklch(0.72 0.11 167.5)` (`#54bb97`) | primary actions, links |
| `destructive` | `oklch(0.54 0.19 25)` | `oklch(0.68 0.19 25)` | delete/danger actions |
| `border` / `input` | `oklch(0.9 0.014 110)` | `oklch(1 0 0 / 12%)` | dividers, field borders |

Neutral surfaces (`background`/`card`/`secondary`/`muted`/`border`/`sidebar`)
share hue `110` (warm, sunlit, slightly green-gold — "morning light through
grass") — this hue was independently re-confirmed when the icon's cream
glyph color (`#F6F7E9`) came back at hue `110.1`, essentially identical.
Distinct from the `167.5` (emerald/teal) used for `primary`/`accent`, so the
primary color still pops against the neutral chrome instead of blending
into it.

### Finance-specific semantic colors (not part of shadcn's defaults)

These are separate tokens from `destructive` on purpose — "delete this
transaction" and "this is money leaving your account" are different
meanings that happen to sometimes share a hue family. `positive` also
deliberately sits at a different hue (`145`, grass green) than `primary`
(`167.5`, emerald/teal) even though both read as "green" — they're rarely
adjacent in the UI (a button vs. an amount figure), but keeping them
distinguishable avoids "is this a button or a dollar amount" ambiguity.
(`145` is literally v1's old primary hue — when `primary` moved to match
the icon, `positive` inherited the vacated slot rather than needing an
entirely new hue picked from scratch.)

| Token | Light | Dark | Use |
|---|---|---|---|
| `positive` | `oklch(0.48 0.15 145)` (`#02721c`) | `oklch(0.72 0.16 145)` (`#5bbe62`) | income, gains, under-budget |
| `negative` | `oklch(0.5 0.16 35)` | `oklch(0.7 0.17 35)` | expenses, losses, over-budget |

Both are tuned to hit ≥4.5:1 against `background`/`card` in light mode (they
render as plain colored text on transaction amounts, not filled badges, so
that's the pair that actually matters) — `positive` needed to go notably
darker/more saturated than a first pass to clear AA; don't lighten it back
up without rechecking contrast.

### Category/chart palette (`chart-1`..`chart-5`)

Five hues at matched lightness/chroma, rotated around the wheel starting
from primary's hue family — a wildflower-meadow set: emerald/teal (`167.5`,
same family as `primary`), sky blue (`237`), sunflower amber (`70`), wild
rose (`16`), lavender violet (`293`). Validated with the data-viz skill's
palette checker: all five clear the lightness band and chroma floor in both
modes, and the worst adjacent CVD (colorblind) separation is ΔE 14.5 light /
9.4 dark (target ≥8). Three of the five sit below 3:1 contrast against the
light surface by design (amber, rose read as pale on white) — this is only
safe because category color is always paired with the category's text name
in this app (dropdown items, badges), never color alone; don't introduce a
color-only category indicator without adding a label. Used for category
color-coding in transaction lists and allocation charts — extend by adding
more evenly-spaced hues (and re-running the validator), not by picking
arbitrary colors.

## App icon

`apps/web/src/app/icon.png` (512×512) and `apple-icon.png` (180×180) — a
cream tulip-and-leaves glyph (`#F6F7E9`) on the primary emerald/teal
(`#3A9979`) field. Generated externally (not hand-authored SVG like the v1
icon was), then color-corrected in-repo to the exact brand hex (the raw
generation was close but not pixel-exact — `#568A7B`/`#F3F3E7` measured vs.
the `#3A9979`/`#F6F7E9` targets).

**Full-bleed square, not pre-rounded** (fixed 2026-08-31): the original
2026-08-28 processing cropped this to a transparent-cornered rounded
square via a chroma-threshold mask (the source file's "transparent"
background was actually a baked-in checkerboard pattern with full opacity
throughout, `alpha=255` everywhere — real alpha had to be reconstructed
from color content, not read from the file). That was backwards from
Apple's actual guidance: iOS app icons must be a full-bleed square with
*no* pre-applied transparency or corner rounding — the OS applies its own
mask at render time, and a source image that's already been cropped
collides with that, producing a visible gap/seam at the edges (reported
by the user as "the edges aren't filled out" on an iPhone home screen).
Fixed by flattening every non-fully-opaque pixel (all confirmed to be
mask-edge antialiasing artifacts, not real glyph content, by checking
that partial-alpha pixels only ever occurred near the outer border) onto
a solid `#3A9979` backdrop, so the PNG is now edge-to-edge opaque with no
alpha channel variation at all. If this icon is regenerated again, keep
it full-bleed — do not re-introduce a pre-cropped/rounded corner mask.
`public/logo.png` (the nav wordmark icon) is a direct copy of `icon.png`
and needs to be re-copied if `icon.png` changes. Static image files, not a
`next/og`-generated route like v1's `icon.tsx` — Next's file convention
picks either up the same way (`/icon.png`, `<link rel="icon">` etc. added
to `<head>` automatically), see
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`.
If you regenerate the icon again, the `apps/web/src/proxy.ts` matcher
excludes `icon`/`apple-icon`/`logo` by literal prefix match, so `icon.png`
and any future `icon2.png`-style numbered variant stay excluded
automatically — don't forget this if the icon convention changes to
something the prefix match wouldn't catch.

`public/logo.png` (a copy of `icon.png`, used inline next to the "Meadow"
wordmark in `DesktopNav`, added 2026-08-31) hit this exact bug on first
deploy: unauthenticated *and* authenticated requests for it 307-redirected
to `/sign-in` because `logo` wasn't yet in the matcher's exclusion list,
which also broke Next's `/_next/image` optimizer (it re-fetches the
original path server-side, so the redirect poisoned that too, returning a
400 instead of an optimized image). Same root cause as the icon/privacy
bugs above — every new public static asset needs an entry here, it's not
automatic just because the file lives outside `src/app/(app)/`.

## Radius

`0.5rem` base (shadcn Nova default is `0.625rem`) — slightly tighter/more
precise-feeling, appropriate for a ledger/numbers-heavy app rather than a
softer consumer-social aesthetic.

## Typography

- UI text: Geist Sans (already the Next.js default, kept).
- Monetary amounts: `tabular-nums` applied via the `.font-amount` utility
  (see `globals.css`) so digits align in columns in tables/lists — a detail
  most scaffolded finance UIs skip.
- **Three-tier hierarchy** (added in the UI/UX redesign's Phase 1, 2026-09-17),
  applied via `apps/web/src/components/typography.tsx` rather than per-page
  classes: `Answer` (large/bold — the headline figure a screen exists to
  show: net worth, safe-to-spend, portfolio value), `SectionLabel` (medium —
  supporting figures/labels: percentages, dates, drift, a card's own title),
  `Meta` (small/muted — quiet technical detail: sync source, confidence,
  classification). Use these instead of ad-hoc `text-2xl font-semibold` /
  `text-sm text-muted-foreground` combinations so hierarchy stays consistent
  as new screens are built.

## Header system

`apps/web/src/components/app-header.tsx` (`AppHeader`) replaces every
hand-rolled per-page title/action row, with two mutually exclusive modes so
a route never stacks a global brand bar on top of its own title bar:

- **Sub mode** (drill-downs and the secondary destinations — Accounts,
  Categories, Alerts, Settings, a holding detail page): back (optional) /
  title / subtitle (optional) / one primary action / overflow menu. At most
  one action ever renders inline; anything else (CSV import, Connect a
  bank, Sync now, management actions like "Correct type") goes in the
  overflow `DropdownMenu` instead of competing for header space — this is
  what fixed Accounts' old 5-button header row and Transactions'
  Import-CSV-vs-Add-transaction prominence problem. The overflow menu is
  `modal={false}` because several of its items are full `Dialog` triggers
  (Import CSV, Connect IBKR, ...), and Radix's default modal focus-trap on
  `DropdownMenu` conflicts with a nested `Dialog`'s own trap.
- **Root mode** (the 4 primary destinations — Home/Activity/Invest/Plan):
  minimal brand mark + a `SecondaryMenu` (Accounts/Categories/Alerts/
  Settings), no title text — the content itself establishes context. On
  mobile this is the page's only top chrome (`md:hidden`); on desktop the
  persistent `DesktopNav` bar already covers the same role, so root mode
  renders nothing there to avoid a redundant second brand/menu bar.

## Cards vs. canvas

Cards are the exception, not the default. Reserve `Card` for content that
genuinely needs a bounded surface — a distinct status assessment, a call to
action, or a group that must visually separate from an unrelated adjacent
group on a dense page. Most content sits directly on the page canvas,
separated by hairline dividers (`border-b`, matching the `border` token) for
grouping within a section and generous vertical spacing between sections,
rather than another bordered rectangle. This is a deliberate correction from
the app's earlier "everything is a `Card`" pattern, which read as an admin
dashboard rather than a considered product. Applied screen-by-screen as each
part of the app gets its UI/UX redesign pass, not retrofitted everywhere at
once.

## Badges

`outline` = system-suggested / lower-confidence (an unconfirmed AI category,
an auto-resolved strategy bucket, a pending transfer match); `secondary` =
confirmed / user-set (a manually corrected category, a user-assigned
strategy bucket). High-confidence AI categorization (at or above
`LOW_CONFIDENCE_THRESHOLD`, currently `0.7` — see
`packages/categorization-ai/src/constants.ts`) renders no badge at all;
users should only see an indicator when Meadow is actually uncertain, not
every time AI happened to run. Import that threshold from the package's
`/constants` subpath (`@finance-app/categorization-ai/constants`), not the
package root, from any client component — the root `index.ts` barrel also
re-exports the Gemini/Prisma-touching categorization job, which pulls
`pg`/`@finance-app/db` into the browser bundle if a `"use client"` file
imports from it directly.

## Motion

`globals.css` applies a blanket `prefers-reduced-motion: reduce` override
(collapses all animation/transition durations to near-zero) so every
current and future transition — the mobile tab bar's spring "pop", the
theme-toggle crossfade, dialog/dropdown enter-exit, future chart
transitions — respects it automatically, without needing a `motion-reduce:`
prefix at each call site.

## Mobile chrome (Konsta UI)

Konsta UI wraps the installed-PWA navigation chrome (bottom tab bar, sheets)
using the iOS/Material presets, themed with the same primary/background
tokens above via its `theme` prop — see `src/components/app-nav.tsx`
(`MobileTabbar`). Desktop/tablet viewports use a sticky top nav bar instead
(`DesktopNav`, same file), not a sidebar; Konsta's tab bar only renders
below the `md` breakpoint. (This section previously described a
`mobile-shell.tsx` file and a shadcn sidebar layout — neither exists;
corrected 2026-09-17.)
