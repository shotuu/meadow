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
the `#3A9979`/`#F6F7E9` targets) and cropped to a transparent-cornered
square via a chroma-threshold mask (the source file's "transparent"
background was actually a baked-in checkerboard pattern with full opacity
throughout, `alpha=255` everywhere — real alpha had to be reconstructed
from color content, not read from the file). Static image files, not a
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

## Mobile chrome (Konsta UI)

Konsta UI wraps the installed-PWA navigation chrome (bottom tab bar, sheets)
using the iOS/Material presets, themed with the same primary/background
tokens above via its `theme` prop — see `src/components/mobile-shell.tsx`.
Desktop/tablet viewports use a standard shadcn sidebar layout instead; Konsta
only renders below the `md` breakpoint.
