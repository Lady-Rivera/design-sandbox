# The Templates

The ten fixed screens, the contract they honor, how the client's brand enters, and the rule for changing anything.

## Inventory

```
assets/
├── theme.css                 tokens (neutrals, semantics, shell, palettes, density, mode), primitives, shells, variant styling
├── palettes.json             the ten approved palettes — the one place they are defined; build.mjs generates theme.css rules and swatches from it and checks contrast
├── fonts/                    latin woff2 for the five pairs + fonts.json — inlined into the sandbox page so it renders offline (scripts/fetch-fonts.sh refreshes)
├── partials/
│   ├── icons.svg             inline stroke-icon sprite (referenced with <use href="#i-…">)
│   ├── logo.html             the logo slot: <!-- @logo-mark --> + "Acme" wordmark
│   ├── logo-mark.svg         placeholder mark, colored from the palette trio
│   ├── sidebar.html          desktop shell nav (dashboards A, B, D; `<!-- @include sidebar collapsed -->` opens it on the icon rail — D)
│   ├── stats.html            the four stat cards (Dashboard A)
│   ├── table.html            the recent-orders table, four rows (Dashboard A)
│   └── bottom-cards.html     note / status legend / quick actions (Dashboard A)
└── screens/
    ├── login-a.html          A  centered card
    ├── login-b.html          B  split brand panel
    ├── login-c.html          C  form + product preview
    ├── login-d.html          D  dark frame, one-time code
    ├── login-{a,b,c,d}-mobile.html      each login's mobile counterpart (390×844): the same layout idea, kept spare
    ├── dashboard-a.html      A  light sidebar
    ├── dashboard-b.html      B  dark sidebar; order list with status edge bars, 2×2 stat tiles, tools stacked
    ├── dashboard-c.html      C  top nav bar (no sidebar); greeting bar, stat column, Open/Done/Cancelled board, note feed
    ├── dashboard-d.html      D  dark frame on the icon rail; summary panel, date-first orders table, note + statuses
    └── dashboard-{a,b,c,d}-mobile.html  each dashboard's mobile counterpart: its widgets and content, its shell as a mobile-native menu (A light tab bar · B dark tab bar + docked New order · C top bar with menu, no tab bar · D icon-only floating pill)
```

`prebuilt/` holds the finished, unbranded output of the build — `design-sandbox.artifact.html` (the sandbox page for the Artifact tool), `design-sandbox.html` (the same page as a complete file), and `Main.dc.html`, `Dashboard.dc.html`, `canvas.json` (the two sets as Claude Design artboards) — whitespace-minified, so surfaces without a shell can use the sandbox without running anything. `scripts/canvas-page.mjs` is the page's generator: the pan/zoom stage, master bar, screen labels and the per-screen card (neutral chrome, light by default with a dark toggle). Note: the Claude Design app cannot read any of these — it exposes only SKILL.md to its model, truncated — so the sandbox is produced from Claude and opened/shared as a canvas, not generated inside Claude Design. `references/artboard-login.md`, `references/artboard-dashboard.md` and `references/canvas-layout.md` carry the same three canvas files as code blocks, for surfaces that can read markdown only. Regenerate all of it whenever a template changes: `node scripts/build.mjs --out prebuilt --minify --emit-md references` (then delete `prebuilt/build-info.json`).

`scripts/build.mjs` resolves `<!-- @include name -->` against `partials/`, swaps `<!-- @logo-mark -->` for the placeholder mark or the client's logo, injects a brand palette rule at `/* @BRAND_PALETTE@ */` in `theme.css`, and wraps everything in the two deliverable shapes. Dashboard A is assembled from the shared partials (stats, table, bottom cards). Dashboards B, C and D (2026-09-11) carry their own widget sets and component treatments inline — an edge-bar order list, a board, a date-first table — but draw on **one data pool** (the same eight orders, customers, ORD- ids, due dates, statuses and the four stat numbers 24 / 11 / 6 / 5), each showing as many as its design calls for. A shows four orders, B all eight, C five across three columns, D all eight by date. A status maps to one token everywhere (`.st-pending` → `--warn`, `.st-progress` → `--info`, `.st-complete` → `--success`, `.st-invoiced` → `--violet`, `.st-cancelled` → `--danger`) so a chip in A, an edge bar in B, a chip in C and a dot + text in D always agree. The main region of each dashboard stretches to the 1440×1040 frame the way a real viewport would (A’s table card, B’s rows, C’s board columns, D’s table card), so content is flush with the bottom on all four.

**Review record.** Dashboards A–D recreated from Abby Rivera's four reference screenshots (content genericized); Login A–D, Login Mobile and Dashboard Mobile designed once for the set. All ten approved by Abby Rivera on 2026-09-08 (v1). Any change after that date goes through § Changing a template. Changes so far, each requested and accepted by Abby Rivera: 2026-09-09 — palettes now color the shells (sidebars, frames, login panels); 2026-09-10 — the sidebar on Dashboards A, B and D collapses to an icon rail from its « button (CSS-only, so it also works in the HTML export and in Claude Design artboards), and Dashboard C's navigation moved from a dark sidebar to a top bar (logo, seven links + More, search, notifications, account) — it is the one desktop template without a sidebar; 2026-09-11 — Dashboards B, C and D rebuilt from three layout visuals supplied by Abby Rivera (A unchanged as the baseline): B = order list with status edge bars + 2×2 stat tiles and stacked tools (four quick actions, note with a text area, statuses) in the dark-sidebar shell; C = greeting bar + compact stat column (three quick actions, five invoice statuses) + Open/Done/Cancelled board + note block with a two-entry feed in the top-nav shell; D = summary panel (greeting, New order, four large stats, text-link quick actions) + date-first orders table + note and status tiles inside the dark frame's content card, sidebar opening on the icon rail. 2026-09-15 — all four dashboards share one **1440×1040** frame with content flush to the bottom (Abby): A's table shows four orders with "View all orders" beside the tabs (footer removed) and its bottom cards carry the icon in the title instead of a tile; B's rows, C's board columns and A/D's table cards stretch to the frame. B's right column and C's left column stretch too. **Approved by Abby Rivera 2026-09-15** (v1.1 set). 2026-09-15 (later) — the two standalone Mobile screens replaced by **eight mobile counterparts**, one per desktop layout (`*-mobile.html`), each mirroring its desktop's widgets and content with the desktop's shell turned into a mobile-native menu (A light tab bar; B dark header + dark tab bar with a docked New order button; C dark top bar with a menu button and no tab bar; D dark frame, rounded content sheet, icon-only floating pill = the rail). Logins pared to logo, title, fields, one button, two text links; dashboards kept calm (flat cards, one status accent per row, leading avatars, no decorative icons). Each screen is its own unit on the page (own card, lock, note — 2026-09-16, Abby: "customizing this is exactly what the tool is for"); the mobile sits to the right of its desktop. Labels (2026-09-16): logins A–D, dashboards **E–H** (the files keep their a–d keys), desktop = letter+1, mobile = letter+2, badge only. Verified to fit 390×844 in both densities, both modes, all five font pairs and with Nav icons off. **Approved by Abby Rivera 2026-09-15** ("good enough for now").

## The token contract

Every screen is a `.screen` root carrying four things the tweaks change and nothing else:

| Attribute / property | Values | Set by |
| --- | --- | --- |
| `data-density` | `comfortable` · `compact` | Density tweak |
| `data-palette` | `01` … `10` · `brand` | Color tweak |
| `data-mode` | `light` · `dark` | Mode tweak |
| `--font-head`, `--font-body` (inline style) | font stacks | Font tweak |

`data-navicons="on|off"` (2026-09-15) hides nav icons in sidebars and the top bar when off; the collapsed rail keeps them. Plus a variant class (`v-a` … `v-d` — a mobile counterpart carries its desktop's class, so B's dark sidebar becomes B's dark header) and a form-factor class (`desktop` 1440×1040, `auth` 1440×1000, `mobile` 390×844). Every color, size and spacing in a template comes from a custom property `theme.css` defines — never a literal that a tweak would leave behind. If a change needs a new token, add it to `theme.css` in both the light block and the dark block, and in both density blocks if it is a size.

Semantic colors (success, info, warning, danger) never come from the palette; they stay recognizable under every trio. Status chips always pair color with a label.

## Brand input

`brand.json`, passed with `--brand`:

```json
{
  "name": "Harbor Health",
  "colors": ["#0F5F63", "#7A2E6A"],
  "colorsDark": ["#1CB0B7"],
  "fonts": { "head": "Fraunces", "body": "Inter", "google": "Fraunces:wght@600;700&family=Inter:wght@400;500;600" },
  "logo": "./harbor-logo.png"
}
```

Every key is optional. `logo` is absolute or relative to `brand.json`. Missing secondary/tertiary colors are **borrowed from the stock palette whose primary is nearest in hue** (the script names it on stderr), so a single brand hex still yields a temperature-matched trio; missing dark values are derived by raising the light value's lightness — hue and saturation kept — until it clears the dark surface; the button-label color is chosen automatically (white unless the primary is too light for it). `--client "Name"` sets the page and canvas titles when there is no brand.json (with one, `name` is used). The script prints a WCAG AA contrast report for the brand primary and, when the primary fails as text on white, adds a derived text-safe variant used for links and eyebrows only — fills keep the real brand color. Nothing about a brand is silently replaced with a palette from the list.

## Changing a template

Templates are the reviewed set; the review is the point. The rule:

1. Edit the fragment (or partial, or `theme.css`) — never the built output.
2. Rebuild: `node scripts/build.mjs --out /tmp/sandbox-check`.
3. Look at the result in a browser — `design-sandbox.html` is quickest — in light and dark, comfortable and compact, at least two palettes. Check hover states still work and nothing hard-codes a color.
4. The skill's owner approves the rendered result.
5. Regenerate `prebuilt/` and the artboard references (`node scripts/build.mjs --out prebuilt --minify --emit-md references`, remove `prebuilt/build-info.json`) and repackage the skill. (`--emit-skill-appendix` exists but is unused: Claude Design truncates SKILL.md before an appendix would be read.)

Adding a variant means a new fragment, a new `.v-x` block in `theme.css`, and a new entry in `SETS` in `build.mjs` (the page lays screens out from `SETS`, so nothing else changes). Keep labels stable: once a layout is "C", it stays "C" — a new layout is "E", never a renumbering.

Never make any of these changes in a session that is preparing for or running a client meeting.
