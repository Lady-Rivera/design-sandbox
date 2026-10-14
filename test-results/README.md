# Evidence: embedded mode and bridge (kellyar/discovery_copilot#57)

Captured on code commit `6354553` (`head.txt`) with Playwright 1.64.0 (Chromium, headless, DPR 1). Every page ran offline: routes other than `file:` and `data:` were aborted. All state is synthetic (`scripts/fixtures/sample-state.json`); no client data. Commands, in order, with nothing else using the browser:

```sh
node scripts/build.mjs --out prebuilt --minify --emit-md references
node scripts/build.mjs --check-palettes
git diff --stat -- 'references/artboard-*.md' references/canvas-layout.md 'prebuilt/*.dc.html' prebuilt/canvas.json 'prebuilt/design-sandbox*.html'
node scripts/verify-fonts.mjs prebuilt/design-sandbox.embedded.html
node scripts/verify-fonts.mjs prebuilt/design-sandbox.html
node scripts/verify-embedded.mjs
```

| Criterion | Result | Where |
|---|---|---|
| AC1 the host's state is shown | Pass (20/20). In the `src` frame and in the `srcdoc` + CSP frame, the page shows the sample's locks, override, notes, general note and bar. The fixture's inline sample equals `sample-state.json`. | `ac1-init-state/` |
| AC2 every change posts the full state; no browser storage | Pass (28/28). Lock, unlock, override, per-screen note and general note each post `design-sandbox:state` with the full state and its `reason`. `setItem` was called 0 times, and `localStorage`/`sessionStorage` are empty even in an un-sandboxed frame. A theme change while typing keeps the note and posts it. `client` round-trips. | `ac2-bridge-messages/` |
| AC3 read-only | Pass (52/52). Padlocks are hidden; bar, card, Reset and Clear-notes controls are disabled with `aria-disabled`; notes are `readonly`; zero `state` messages. The `l` and `d` keys do post when editable, so the zero is meaningful. Compare opens, and Done offers only Discard / Keep comparing. Four malformed states (a JSON string, `v: 3`, `general.text: 5`, a string lock entry) keep the page read-only and post `design-sandbox:error` `bad-state`; a failed re-init keeps the previous state. `readOnly` other than `false` stays read-only. | `ac3-read-only/` |
| AC4 chrome follows the host; mockups unchanged | Pass (37/37). The computed `--ui-bg`, `--ui-accent`, `--ui-focus` and `font-family` equal the Copilot tokens sent, light and dark, at 1440 and 1024 wide. The Tab focus ring is 2 px in `--ui-focus`. The inner `.screen` of four mockups (login A override, login C lock, dashboard E/b following the bar, the locked F2/b mobile) is byte-equal between the embedded and standalone pages. | `ac4-chrome-and-mockups/` |
| AC5 works with the network blocked | Pass (15/15, plus both font checks). All ten bundled families load and measure differently from the monospace fallback, with no requests leaving the page, on both builds. In the `srcdoc` + CSP frame, 0 aborted requests and 0 CSP violations. | `ac5-offline/` |
| AC6 the standalone page is unchanged from `4c05b19` | Pass (9/9). The same lock → Compare → Save → note flow gives an equal `serialize()`; `designText()` and `htmlText()` are equal apart from the date; full-page screenshots, light and dark, are byte-equal with the `4c05b19` build. | `ac6-standalone-regression/` |
| DoD build | Pass. The build and palette check exit 0. A fresh build matches the committed `prebuilt/`, artboards and references (empty diff). | `dod-build/` |

Full output of the verification script: `verify-embedded.txt` (161/161).

Two test-harness choices, recorded as approved deviations on #57:
- `verify-fonts.mjs` measures each bundled family against a monospace fallback. The old heading-width heuristic failed on the untouched `4c05b19` build (two pairs tie at 33.4 px in this Chromium) and could not switch pairs on the read-only embedded page.
- Before the AC4 and AC6 screenshots, `.sb-stage { will-change: auto }` is set on both sides. Otherwise Chromium keeps a raster scale from the page's zoom history, which gives sub-pixel antialiasing differences unrelated to any change. The AC6 dark screenshot can still differ under heavy CPU load, so run the script on its own.
