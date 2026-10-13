# Design Baseline

The non-negotiable quality foundation under the sandbox templates and under any prototype built from them. Tweaks theme this system — swap colors, adjust density, flip mode — but never lower its bar. `assets/theme.css` is this file made concrete; a prototype reuses its token names so the two can never disagree.

## Layout: the app shell

The shell depends on form factor, and is applied identically across every navigation-level screen.

**Desktop / responsive shell**

- **Left sidebar navigation** (240px expanded), app name/logo top, primary nav items with icons, user/account at bottom. Collapse to icon rail at narrow widths.
- **Top bar** inside the content area: page title, breadcrumbs on detail pages, global search, primary page action on the right.
- **Content max-width** 1200-1440px, centered, on a background one step off the card surface so cards read as cards.
- 12-column mental grid; align everything to it.

**Mobile-first shell**

- **Bottom tab bar**, 3-5 destinations, always labeled — icon-only tabs cost recognition for no real space gain.
- **Compact top bar**: screen title plus at most one action; back arrow on pushed screens.
- **Single column**, 16-20px side gutters, primary actions in the bottom third where thumbs reach.
- Full-screen task flows deliberately omit the tab bar — see `screens.md` B2. That is a considered exception, not shell drift.

**Consistency is the point either way.** Nav items, counts, product name, and ordering should be identical on every navigation-level screen. Drifting shells — a nav item that vanishes between screens — are the most common tell that a set of mockups was drawn separately rather than designed as one product.

## Spacing

4px base unit. Use steps: 4, 8, 12, 16, 24, 32, 48, 64. Related elements get small gaps (4-8), groups get 16-24, sections get 32-48. The Density tweak scales the *choice of step*, not the scale itself: "compact" favors 8/12 where "comfortable" uses 16/24 — never odd one-off values.

## Type

- One sans family (system stack or a single quality webfont). A second family (serif or mono) only when industry/personality justifies it (legal gravitas, devtools mono).
- Desktop scale: 12 (caption/labels), 13-14 (body in dense UIs), 14-15 (body default), 16 (emphasized body), 18 (section heads), 22-24 (page titles), 28-32 (hero metrics). Weights: 400/500/600 — reserve 600+ for real hierarchy moments.
- Mobile scale runs larger: 16px body minimum, 17-18px when the audience skews older or the context is physical (standing, walking, hands busy). Nothing below 13px on a phone. Controls 44px+.
- Line-height ~1.5 body, ~1.2 headings. Sentence case everywhere, including buttons. All-caps only for tiny labels (11-12px, +0.04em tracking), sparingly.
- **Tabular figures for all data numbers** (tables, metrics, currency) so digits align.

## Color structure

Build every theme with the same skeleton:

- **Neutral ramp** (9-10 steps) from page background to highest-contrast text. Tint neutrals slightly toward the brand hue — pure gray reads lifeless.
- **Brand colors** from `palettes.md` — the trio selected by the Color tweak (or the client's brand), in the light or dark column matching the Mode tweak. Give the primary hover/active/subtle-bg variants; the secondary and tertiary need a subtle-bg variant at minimum.
- **Semantic set**: success (green), warning (amber), danger (red), info (blue) — each with a subtle background variant for badges/banners. Semantics stay recognizable regardless of brand palette.
- **Accent discipline**: primary color on maybe 5-10% of any screen (buttons, links, active states, key data). If a screen looks "very {color}", pull back.

Contrast minimums: 4.5:1 body text, 3:1 large text and UI boundaries. This is a floor even in dark themes and low-emphasis text. The full accessibility floor — and how it is verified rather than trusted — is § The accessibility floor below.

## Dark themes

Not inverted light themes. Background near-black tinted toward brand hue (e.g., #0E1116-ish), surfaces 1-2 steps lighter, borders as subtle light overlays, desaturated-but-brighter accents, shadows mostly replaced by surface-step contrast. Check every semantic color for contrast on dark.

## Components: the quality bar

- **Buttons**: primary (filled), secondary (outline/tonal), ghost, destructive. 32-36px tall (40 in spacious themes), radius 6-8px, clear hover/active/disabled/focus states. One primary button per view region.
- **Inputs**: visible labels above (placeholders are not labels), 1px borders that strengthen on focus with a focus ring, inline validation messages below.
- **Tables**: left-align text, right-align numbers, subtle row hover, sortable column indicators, sticky header on long lists.
- **Table row height — set this before padding.** Compact 44-48px · comfortable 64-72px in the sandbox templates (which are presentation surfaces); a prototype's list view may go denser — 36-40px compact. Pick the target height for the density, then choose the cell padding that lands on it. Specifying padding alone is how a "dense" table ends up at 40px+ rows: padding compounds with line-height and drifts upward every time. If the density is compact and the rows did not visibly tighten, the tweak was not honored.
- **Cards**: one surface step above background, radius 8-12px, either border or shadow (rarely both heavy), consistent internal padding (16-24).
- **Badges/status chips**: semantic subtle-bg + strong text, always paired with a label (never color alone), consistent set of states used identically everywhere.
- **Focus states on everything interactive** — 2px ring in primary color, offset from the element.

## States (where generic mockups fail — do not skip)

Every screen includes evidence the product handles reality:

- **Empty states**: friendly one-liner + primary action ("No invoices yet — create your first one"). Design at least one screen showing a partially-empty module.
- **Loading**: skeletons matching content shape, not spinners, for primary surfaces.
- **Edge content**: at least one long truncated name, one zero value, one overdue/error item in tables — perfection reads as fake.
- **Destructive actions**: visually distinct, never adjacent-and-identical to safe actions.

## Data visualization

Charts stay disciplined even in expressive themes: neutral axes and gridlines (subtle), brand palette for series, direct labels over legends where feasible, tabular figures, no 3D, no decorative gradients on data. Line/bar/area cover almost everything; donut only for simple part-of-whole with ≤4 slices.

## The accessibility floor (WCAG AA)

Every theme sits on this floor. Tweaks style it; nothing a tweak can produce is allowed to breach it. Design to WCAG 2.2 AA:

- **Contrast, verified — never assumed.** 4.5:1 for normal text, 3:1 for large text, UI component boundaries, and focus indicators, in whichever theme column is active. The ten palettes, the neutral ramps and the semantic colors in `theme.css` were verified once when the templates were built. The one input that cannot be pre-verified is a client-supplied hex — so `scripts/build.mjs --brand` runs a contrast report at build time and derives a text-safe variant when the primary fails as text. Never a silent pass; the finding goes in the export packet.
- **Never color alone.** Status, trends, chart series, and validation states always pair color with a label, icon, or pattern. (This is the global rule; the logistics section's colorblind note is one instance of it.)
- **Readability.** Type minimums as specced above (nothing under 12px on desktop, 16px+ body on mobile, larger for older audiences); line-height ~1.5 for body; running text capped near 75 characters per line; plain language over jargon on any end-user surface.
- **Targets.** 44px+ on mobile; nowhere smaller than 24px, including icon buttons and table row actions.
- **The prototype is semantically honest.** Its working nav uses real `<nav>`, `<button>`, and `<a>` elements (never clickable divs), landmarks (`header`/`nav`/`main`), `alt` on images, `aria-label` on icon-only controls, and a visible focus ring — so the prototype is keyboard-navigable as built, and the accessibility intent survives into the developer handoff instead of living only in a note.
- **Reflow.** Layouts tolerate 200% zoom and narrow widths without loss — the desktop shell's collapse behavior is part of the floor, not a nicety.

One honesty rule rides along: **never describe a mockup as "ADA compliant" in client-facing output.** Compliance is a legal property of the built, running product — verified there with real assistive technology. What this skill guarantees, and what the handoff packet states, is that the design was built to WCAG AA targets and passed its own contrast audit; the packet's accessibility notes name what only implementation can verify.

## Claims about your own output

**State no count, ratio, or measurement in the narration.** Not "verify before asserting" — don't assert. Numbers belong in the markup; prose *about* the markup is where they go wrong, and they go wrong while the pixels are right, which makes the error pure cost. Asking for care here has already failed; the rule is a format constraint instead.

Write intent, not measurement:

| Don't | Do |
| --- | --- |
| "12 payments, 3 late." | "About a year of payment history, with a few late months." |
| "All three text ranks clear 4.5:1." | "Every text rank was chosen against a 4.5:1 floor." |
| "34px rows, 13px body." | "Rows and type are set for dense scanning." |
| "Seven screens, 42 components." | "The full set, plus the two extra screens you asked for." |

Two exceptions, both because the value is copied rather than counted:

- **Hex values** — state them exactly. They come from the CSS you just wrote.
- **Values the user supplied** — their brand hex, their product name, a metric they named. Echo them verbatim.

If a figure genuinely must appear in prose, declare it once at the top of the mockup and quote from that block rather than from memory of what you drew:

```html
<!-- DATA: payments=9 late=2 disputed=1 -->
```

The tell to watch for in your own draft: any sentence where a number would let a reader check you. If it would, either delete the number or read it back off the markup.

The build script's contrast report is the sanctioned exception: it is computed from the actual values, so read it out as printed.

## Voice in UI copy

Plain, specific, sentence case. Warmth belongs in empty states and confirmations, never in error messages or destructive confirmations. Buttons are verbs ("Create invoice", not "New" or "OK").
