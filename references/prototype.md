# Building a Prototype

The post-meeting follow-up: a living prototype of the client's product in the layout and theme they chose in the sandbox. This is the one place in this skill where Claude designs screens — so it happens after the meeting, and **the rep reviews the result before the client sees it.** Say that when offering it.

## Inputs

Before or instead of a prototype, the rep may want just the **chosen screens in Claude Design**: `node scripts/build.mjs --out <dir> --picks picks.json` exports the chosen login and dashboard as two artboards with the final theme as their defaults; publish them with the `design` skill. A designer edits from there.

Everything comes from the sandbox session; re-ask nothing that is already known.

- The chosen **login** and **dashboard** layouts (by label) — the two chosen templates are the prototype's first two screens, reproduced from `assets/screens/` with the client's theme applied, not redrawn.
- The final **tweak values**: density, palette (or brand), font pair, mode. These become the prototype's theme tokens; they are the same custom properties `theme.css` defines, so the prototype and the sandbox agree by construction.
- The **requests and notes** from the export — nav wording, features asked about, pages wanted.

## The page checklist

Ask once, as a multi-select in whatever form the surface offers. Login and dashboard are always included, so the question is only about what else:

- List / table view
- Record detail
- Settings
- Onboarding
- Notifications / inbox
- Reports
- Billing / subscription
- User & role management
- Other — type it

If nothing is chosen, build login + dashboard only. Requests recorded during the meeting ("wants a settings page") pre-check their boxes — mention that they did.

## Desktop first, mobile after

Build the **desktop** screens first, present them, let the rep react, and only then build mobile. Mobile screens go on a **separate canvas page** (or a second section of the HTML file) so they can be iterated on without disturbing the desktop set — re-theming two form factors at once doubles the cost of every adjustment while the rep is still reacting. The mobile screens use the sandbox's mobile templates as their anchor: same tab bar, same card rhythm.

## The living prototype

All screens live in **one self-contained file** with working navigation: the shell (sidebar or tab bar) is rendered once, each screen is a panel, and clicking a nav item actually switches screens. The client browses their product the way they one day will, instead of scrolling a gallery of disconnected frames.

- **Render the shell once.** One piece of sidebar/tab-bar markup, panels shown and hidden by a few lines of script (hash or click routing — no framework). This makes the shell identical across screens by construction and makes adding a nav item one edit.
- **Navigation works; nothing else pretends to.** Nav items, in-screen tabs, and natural cross-screen links (a table row opens its record) are clickable. Forms and buttons stay visual. No hover or cursor affordances on dead elements.
- **Theme is file-scoped.** One set of custom properties governs every panel — the same names as `theme.css` — so a re-theme restyles the whole product and old screens cannot drift.
- **Additions join the file; changes are edits in place.** A new page is a new panel with its nav item added once; a revised screen replaces its panel. Never a separate file per screen, never a "v2" panel beside the old one, never a nav item pointing at a screen that does not exist.
- **Degrades to a stacked set** where scripting is stripped: panels in build order, each labeled.

On a canvas, the prototype can also be laid out as one artboard per screen on its own page, with the single-file version as the thing the client actually clicks through.

## Screen anatomy

The shape each page takes. Everything is expressed in the client's nouns once they are known; until then, the sandbox's generic vocabulary (orders, projects, customers, invoices) carries over.

- **Dashboard** — the chosen template, themed. Header with greeting and one primary action; stat row; the workhorse table; the supporting cards. Keep its figures consistent with every other screen.
- **List / table** — toolbar (search, two or three filters, primary "New …" button right-aligned), optional summary strip, a five-to-seven-column table with ten to twelve varied rows (mixed statuses, one long truncated name, one overdue row), row-hover action menu, pagination with a total.
- **Record detail** — breadcrumb, record name with status chip, metadata line, one or two actions plus overflow; main column with tabs (Overview, Activity, one or two domain tabs) beside a properties sidebar; a comment composer at the foot of the timeline. Mix filled and empty fields.
- **Settings** — settings sub-nav (Workspace, Members, Billing, Notifications, Integrations, API); Members is usually the richest section: invite input with role dropdown, members table, pending invites. Grouped form cards with one saving convention. A visually separated danger zone with explicit consequence copy.
- **Onboarding** — three or four progressive steps with a progress indicator and skip affordances, ending on a first-run empty dashboard with guided actions.
- **Notifications / inbox** — grouped by day, read/unread distinction not by color alone, bulk actions, an empty state.
- **Reports** — one chart earning its size, a filter bar, a summary table; neutral axes, brand colors for series, direct labels, tabular figures.
- **Billing** — current plan card, usage meters, plan comparison, invoice history table.
- **Users & roles** — users table with role and status, role matrix or role detail with permission groups, invite flow.
- **Mobile** (second pass) — home (the mobile counterpart of the chosen dashboard layout, from the sandbox), the primary task flow full-screen without the tab bar, a capture/log screen with 44px+ targets, and settings as grouped rows.

States are not optional: at least one empty state, one loading skeleton, one edge case (long name, zero value, overdue item) across the set.

## The floor the prototype sits on

The prototype inherits the sandbox's baseline — `design-baseline.md` — including its WCAG 2.2 AA floor: verified contrast in the active mode, never color alone, 12px desktop / 16px mobile minimums, 44px mobile targets, real `nav`/`button`/`a` elements with visible focus, and reflow at 200% zoom. Say "designed to WCAG AA," never "ADA compliant."

## Handing it over

When the prototype is settled, produce a short packet beside it, client-safe, titled with the client's product name:

1. **Theme tokens** — the custom properties copied verbatim from the prototype's stylesheet.
2. **Decisions** — the sandbox export, plus everything decided while building the prototype.
3. **Screen inventory** — each screen built, one line apiece, and the checklist items deliberately left out.
4. **Accessibility notes** — the floor designed to, the contrast findings, and what only the built product can verify (screen readers, keyboard traps, motion, real content).
5. **Open questions** — three to five lines at most.

Then stop. The rep decides when the client sees it.
