# Palettes

Ten pre-verified palettes — the option set behind the sandbox's **Color** tweak, and the brand trio for any prototype built afterwards. **They are defined in one place: `assets/palettes.json`.** `scripts/build.mjs` reads that file, writes the matching rules into `theme.css` (between the `@PALETTES` markers) and the swatches on the page, and checks contrast. This file is the human-readable record of the same set; when the JSON changes, update the table below.

**Retuned 2026-09-15** at Abby Rivera's request ("make the colors professional"): every trio pulled toward muted, deeper tones; the loudest — Cobalt Signal's electric blue, Indigo Bloom, Ink & Coral's coral, Graphite & Volt's volt — retired or replaced. A first pass gave 08 and 10 grey primaries, which made them read like Ink & Rust; Abby asked for the color to show, so **Forest & Slate** (a deep forest green, kept darker and yellower than Evergreen and Deep Teal at Abby's request) and **Amber & Graphite** carry their color as the primary and the grey as the secondary (a trial eleventh, all-grey "Neutral", was dropped). The palette ids stayed, so a saved meeting or export keeps pointing at the same slot. The shells (sidebars, frames, login panels) still take the primary deepened toward ink; Abby may revisit that separately.

Each palette is three colors: primary (actions, active states, links), secondary (supporting actions, second data series), tertiary (highlights, third series, category accents). Every trio has a **light-theme** and a **dark-theme** value, because a color tuned for white is too dark on near-black and lifting it at generation time is where themes go wrong. The dark trios were derived by lifting lightness with hue and saturation kept (the same routine `build.mjs --brand` uses).

Contrast was verified once, in advance: light values clear 4.5:1 as text on white and on the `#F1F2F5` secondary surface; dark values clear 6:1 on the `#171B22` surface and on the `#0E1116` background. **That is why you may state these hex values exactly and must still not state their ratios** — see `design-baseline.md` § Claims about your own output. Say "drawn from a verified set," never "measures 5.05:1." The one exception is the build script's own contrast report for a client's brand color: those numbers are computed, not recalled, and are meant to be read out.

---

| # | Palette | Light trio | Dark trio | Reads as | Suits |
| --- | --- | --- | --- | --- | --- |
| 01 | **Harbor Blue** | `#23508F #1F6F73 #8A5A17` | `#6C9CDF #2BA8AE #D4881E` | Steady, trustworthy blue with teal and ochre. | Fintech · logistics & industrial · the safe B2B default |
| 02 | **Evergreen & Clay** | `#15624A #9A4A26 #7A5C10` | `#22B184 #DB865F #C69415` | Warm, grounded, editorial. | Real estate · logistics · marketplaces · HR |
| 03 | **Indigo Slate** | `#3F4A8C #6B4F8A #2F6B5E` | `#8C96CE #A891C2 #49AD97` | Dusty indigo, quietly product-forward. | Sales & CRM · education · internal tools |
| 04 | **Ink & Rust** | `#1F2328 #A34A2A #2E5C8A` | `#919CAB #DA8263 #6C9ED1` | Near-monochrome with one warm accent. | Media · creative · devtools · analytics |
| 05 | **Deep Teal & Plum** | `#0F5F63 #6E3563 #8A5A00` | `#17AFB7 #C888BC #DC8F00` | Premium jewel tones. | Legal · healthcare admin · analytics · premium positioning |
| 06 | **Navy & Copper** | `#1F3A7A #8F5430 #4A6318` | `#7A99E0 #CE8B62 #7CA825` | Institutional trust with warmth. | Fintech · insurance · legal · healthcare billing |
| 07 | **Aubergine & Rose** | `#5E2758 #964258 #1F6B5C` | `#CE83C6 #CC8699 #2EAD94` | Soft, human, care-oriented. | Patient-facing healthcare · HR · wellness · education |
| 08 | **Forest & Slate** | `#1E4A2E #3B4A5E #5B4E9A` | `#45B26C #879BB5 #A096CC` | Deep forest green on a slate frame — darker and yellower than Evergreen. | Enterprise consoles · compliance · sustainability · dense tables |
| 09 | **Burgundy & Olive** | `#7A2233 #55622A #2A5C73` | `#DE7F92 #8EA543 #5BA5C7` | Heritage modern, print-adjacent. | Legal · real estate · hospitality · heritage brands |
| 10 | **Amber & Graphite** | `#2E2B27 #8A5A17 #2F5D8A` | `#D4881E #979DA8 #6D9FD0` | Warm graphite in light, amber leading in dark (Abby's values, 2026-09-15). | Industrial · field ops · energy · hospitality back-office |

Order in each trio is always primary · secondary · tertiary.

## Using them

- **The Mode tweak picks the column.** Never mix a light trio into a dark theme.
- **Neutrals do not come from here.** Take the ramp from `design-baseline.md` § Color structure, tinted toward the chosen primary's hue.
- **Semantics do not come from here either.** Success / warning / danger / info stay recognizable regardless of the brand trio.
- **Accent discipline still applies.** The primary belongs on 5-10% of a screen. Having three brand colors is not permission to use three brand colors everywhere.
- **Tertiary is the one to leave out.** Most screens need two. Reach for the third when there is a genuine third category — a chart series, a plan tier, a status family.

## One palette behaves differently on dark

**Ink & Rust** is built around a near-black primary — the deliberate near-monochrome option. On dark there is no such thing as a near-black action color, so the primary lifts to a light grey and the *secondary* (rust) carries what color there is. Say so in the theme summary; a reader who knows the light version will notice.

## When the user supplies their own color

`scripts/build.mjs --brand` implements this section; read its stderr to know what the script did. Derive, don't substitute. Their hex stays the primary wherever it works; a missing secondary and tertiary are borrowed from the palette above whose primary is nearest in hue (a temperature-matched pair, named on stderr); the dark-mode value is the same hue lifted until it clears the dark surface; and if their color fails as text on white, it keeps its job for fills while a darker text-safe variant (`--primary-text`) takes over links and small text. State both values and which one does which job. Never quietly replace a brand color with a palette above.

## Editing the palettes (maintainer)

1. Open `assets/palettes.json`. Each entry is `{ "id": "05", "name": "Deep Teal & Plum", "light": ["#0F5F63", "#6E3563", "#8A5A00"], "dark": [...] }` — light is primary · secondary · tertiary for a white surface. Change hex values or the name; **keep the id** (saved meetings and exports point at it). To let the build derive the dark trio, delete the `dark` line.
2. `node scripts/build.mjs --check-palettes` prints every ratio; light values must clear 4.5:1 as text on `#F1F2F5`, dark values 6:1 on `#171B22`. A build with a failing value stops and names it (`--allow-low-contrast` overrides, for a deliberate exception).
3. Rebuild: `node scripts/build.mjs --out prebuilt --minify --emit-md references`, then delete `prebuilt/build-info.json`.
4. Update the table above, republish the review page, repackage the skill.

Or hand the edited `palettes.json` (or just the new hexes) to Claude and ask for a rebuild — steps 2–4 are what it does.
