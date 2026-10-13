# Design Sandbox

A Claude skill for Jahnel Group reps: eight fixed, pre-reviewed screen layouts (logins A–D, dashboards E–H), each as a desktop screen with its own mobile counterpart, on one pan-and-zoom page. A master bar themes every screen at once — density, palette, font pair, light/dark, nav icons — and each screen has its own card for overrides, a lock (the pick) and a note. Nothing is generated in front of a client; the only thing that changes live is the theme.

Everything is hand-written HTML, CSS and JavaScript with no framework and no runtime dependencies. The ten Google font families are vendored so the page works offline.

## Using it in Claude

Zip the folder as a `.skill` and upload it in Claude (desktop or web):

```sh
zip -qr design-sandbox_v1.1.skill design-sandbox -x "design-sandbox/.*"
```

Then run `/design-sandbox` in a conversation. The skill publishes the page immediately from `prebuilt/` and offers to fold in a client's branding afterwards. `SKILL.md` has the full instructions the model follows; `references/running-the-sandbox.md` describes the page and how to run it in a meeting.

## Building

Node 18+ and nothing else. From the repository root:

```sh
node scripts/build.mjs --out prebuilt --minify --emit-md references   # regenerate prebuilt/ and the artboard-*.md references
node scripts/build.mjs --brand brand.json --client "Acme" --out out    # a branded build
node scripts/build.mjs --check-palettes                                # contrast table for assets/palettes.json
node scripts/build.mjs --picks picks.json --out out                    # Claude Design artboards for the locked screens
node scripts/verify-fonts.mjs prebuilt/design-sandbox.html             # Playwright: fonts load with the network blocked
```

The build fails if a palette in `assets/palettes.json` falls below 4.5:1 (light) or 6:1 (dark) on the page surfaces.

## Layout

```
SKILL.md              what Claude does: build first, offer branding, run the meeting, export
assets/
  theme.css           the token contract and every component style; palette rules are generated between the @PALETTES markers
  palettes.json       the ten palettes — the one place they are defined
  partials/           icon sprite, logo slot, sidebar, stats, table, bottom cards
  screens/            login-{a..d}.html + login-{a..d}-mobile.html, dashboard-{a..d}.html + dashboard-{a..d}-mobile.html
  fonts/              latin woff2 for the five font pairs (scripts/fetch-fonts.sh refreshes them)
scripts/
  build.mjs           assembles the templates into the page, the Claude Design artboards and the exports
  canvas-page.mjs     the sandbox page itself: canvas, bar, cards, locks, notes, compare, exports, persistence
  fetch-fonts.*       vendor the fonts (needs network)
  verify-fonts.mjs    offline-font check
references/           brand intake, running the sandbox, templates and review record, palettes, font pairs, design baseline, prototype spec
prebuilt/             the finished, unbranded output — used byte for byte where nothing can run
```

## Labels

Logins are A–D and dashboards E–H, unique across the page. A desktop is `A1`, its mobile `A2`. The chip above a screen says only that; the layout's name is in the screen's card and in the exports.
