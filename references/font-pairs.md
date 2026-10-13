# Font Pairs

Five heading + body pairs, all from Google Fonts — the only font host a Claude Design canvas admits; on the sandbox page itself they are bundled (see § Offline). A client's own fonts join this list as a sixth option when supplied (`scripts/build.mjs --brand`), by name; if they are not on Google Fonts the canvas shows the fallback stack and the packet records the real names for the developer.

| # | Pair | Headings | Body | Reads as |
| --- | --- | --- | --- | --- |
| 1 | **Manrope + Public Sans** | Manrope 600–800 | Public Sans 400–600 | Clean, contemporary SaaS. The default. |
| 2 | **DM Serif Display + DM Sans** | DM Serif Display | DM Sans 400–700 | Editorial warmth; a serif voice over a neutral body. |
| 3 | **Space Grotesk + IBM Plex Sans** | Space Grotesk 500–700 | IBM Plex Sans 400–600 | Technical, precise, a little engineered. |
| 4 | **Playfair Display + Source Sans 3** | Playfair Display 500–700 | Source Sans 3 400–600 | Premium, high-contrast display over a quiet body. |
| 5 | **Nunito + Nunito Sans** | Nunito 600–800 | Nunito Sans 400–600 | Friendly, rounded, approachable. |

Fallback stack for every pair: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.

## What the tweak changes

Only two custom properties — `--font-head` (h1/h2/h3, stat numbers, display text) and `--font-body` (everything else). Sizes, weights and line-heights stay where the density setting put them, so a font swap never reflows the layout.

## Offline

The sandbox page carries its own copies of all five pairs — latin-subset woff2 files vendored in `assets/fonts/` and inlined by `build.mjs` — so it renders the real typography with no internet at all (about 330 KB of fonts; the page is ~550 KB). Nothing about fonts needs saying at hand-over unless a **brand font** is involved: a branded build fetches the client's Google family when the build machine has network and bundles it the same way; if the fetch fails, that one family loads from Google at view time and the hand-over says so in one line.

The fonts live in a separate `<style id="sb-fonts">` block, and the **exports do not carry them**: the *For Claude Design* and *HTML* exports keep the Google Fonts link, since they are used online (in an editor, by a developer) and a data-URI stylesheet would push the Claude Design paste past 2 MB. The `.dc.html` artboards keep the link for the same reason — Google Fonts is the only font host a Claude Design canvas admits.

## Two honest caveats

- **Exports and artboards load from Google at view time.** Offline, or where the network blocks fonts.googleapis.com, they render in the fallback stack. The sandbox page itself does not have this problem.
- **PNG/PDF export from a Claude Design canvas shows the fallback**, not the web font. Screenshots for a deck should be taken from the browser, not exported.

## Refreshing the vendored files

Maintainer only, when a pair changes: run `scripts/fetch-fonts.sh <out-dir>` (curl + awk; works in a Mac Terminal) or `node scripts/fetch-fonts.mjs` on a machine with normal internet, copy the result into `assets/fonts/`, rebuild, and run `node scripts/verify-fonts.mjs prebuilt/design-sandbox.html` — it opens the page with all network blocked and fails if any family falls back. Google serves a single variable-weight file for most of these families, so one file usually covers every weight a pair uses. All ten families are under the SIL Open Font License 1.1, which permits embedding.
