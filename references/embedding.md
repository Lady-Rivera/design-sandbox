# Embedding the Sandbox in a host page

`prebuilt/design-sandbox.embedded.html` is the Sandbox page built for a host that frames it in an iframe (the Live Discovery Copilot's Design Deep Dive is the first). It is the same screens, bar, cards, locks, notes and Compare as `design-sandbox.html`; what differs is where its state lives, who styles its chrome, and whether it can be edited. The other two outputs behave as they always did and ignore everything here.

The bridge is **format v1**: every message carries `v: 1`, and the page ignores anything else.

## Messages

All `type` strings are prefixed `design-sandbox:`.

| Direction | Message | Fields |
|---|---|---|
| page → host | `design-sandbox:ready` | `{ v: 1 }`. Sent once, as soon as the page's scripts are up. Carries no state. Always posted to `'*'`. |
| host → page | `design-sandbox:init` | `{ v: 1, state, readOnly, theme }`. `state` is a `state` payload below, or `null` for the default state (anything that is not `v: 2` is treated as `null`). Replaces the page's state wholesale; `readOnly: true` makes the page read-only, anything else makes it editable; `theme` is optional (see below). May be re-sent at any time, e.g. to flip read-only when a meeting ends. A focused note textarea is blurred and pending note timers are cleared first, so a half-typed note is dropped, not written over the new state. |
| host → page | `design-sandbox:theme` | `{ v: 1, theme }`. Live light/dark or token change. Does not touch state or read-only; pending note timers are cleared. |
| page → host | `design-sandbox:state` | `{ v: 1, state, reason }`. Posted after every change the page persists. `state` is the full document, not a delta. |

`state` is the Sandbox's persisted shape, version 2:

```
{ v: 2, client, bar, ov, locks, notes, general, savedAt }
```

`bar` is the master bar values (`density`, `palette`, `font`, `mode`, `navicons`, `at`); `ov` holds per-screen overrides, `locks` the captured look of each locked screen, `notes` the per-screen notes, `general` the meeting notes `{ text, at }`. Entries carry `at` (ms); a removed entry is the tombstone `{ _del: true, at }`. The host stores the object as an opaque JSON value and sends it back unchanged in `init`.

### Reason codes

`reason` says what produced the `state` message. It is one of:

| `reason` | Posted when |
|---|---|
| `lock` / `unlock` | a screen is locked or unlocked (card or canvas padlock, the `l` key, or the Compare pane padlock) |
| `override` | a card setting changes, or the card's "Use the set values" button clears the screen's overrides |
| `reset` | the bar's **Reset** button only |
| `bar` | a bar density, font, mode, nav-icons or palette change, including the bar font select and the `d` key |
| `note` | a per-screen note is typed (debounced 400 ms) |
| `general` | the general meeting notes are typed (debounced 400 ms) |
| `clear-notes` | Notes panel, Clear notes |
| `compare-save` | Compare, Save to screen |
| `apply-brand` | the bar's Apply brand button (branded builds) |

View-only bar buttons (Show, zoom, View all, Notes, Compare) post nothing.

## Origin and source rules

- The page accepts a message only when it has a parent (`window.parent !== window`), `event.source === window.parent`, `v === 1`, and the type is `init` or `theme`. It never listens to anything but its parent.
- The origin of the first accepted inbound message is remembered, and later page → host messages target it.
- When the host is an opaque origin (`file://`, or a `sandbox="allow-scripts"` frame, where `event.origin` is the string `"null"`), `postMessage(…, "null")` throws, so the page posts with `'*'`. The recipient is still pinned to `window.parent`. `design-sandbox:ready` always uses `'*'` because the page has not heard from the host yet; it carries nothing sensitive.
- The host should likewise check `event.source === iframe.contentWindow` (and the origin, where it is not `"null"`) before trusting a `state` message.

## Persistence when embedded

- The page never touches browser storage: no `localStorage` (not for state, not for the Show filter or the theme) and no `window.claude` database. Show is kept in memory only. The Notes panel says "Saved to the host".
- The page is **read-only until the first `init`**, so nothing can be edited and then replaced. The host must send `init` after `ready` (a host that sends it earlier may lose it because the page is not listening yet; wait for `ready`).
- With **no parent** (`window.parent === window`, for instance when the file is opened directly, as `scripts/verify-fonts.mjs` does) the page renders the default state, stays read-only, and never posts.

## Read-only

With `readOnly: true`:

- Canvas padlocks and card padlocks are hidden. The Compare pane padlock is visible but disabled.
- Disabled (with `aria-disabled="true"`): the card's settings and "Use the set values" button, the bar's density, font, mode, nav-icons and palette controls, Reset, Clear notes, Apply brand, and Compare's Save to screen. Note textareas are `readonly`. The `d` and `l` keys do nothing.
- Nothing posts a `state` message.
- Still working: navigation (pan, zoom, View all, Show, opening cards and the Notes panel) and Compare (pick, pane-local tweaks, Swap, Focus, Done). Done never offers Save; with an unsaved pane tweak it offers Discard or Keep comparing.
- A "Read-only" flag appears first in the title row's tools.

## Theme and tokens

```
theme = { dark: boolean, tokens: { '--ui-bg': '#0F1114', … }, fonts: { ui: '"DM Sans", ui-sans-serif, system-ui, sans-serif' } }
```

- `dark` toggles the page's dark class and `color-scheme`.
- `tokens` is **a full set for one theme**, keyed by the page's own `--ui-*` names. Before applying a new set the page removes every previous inline `--ui-*` property, so a token left out falls back to the built-in default for the theme in `dark`, not to the previous set. Only `--ui-[a-z0-9-]+` keys with string values are applied.
- `fonts.ui` sets `--ui-font` (and wins over `tokens['--ui-font']` if both are sent). The stack must name families the build bundles: DM Sans (inlined as pair f2) is the Copilot's UI font, so it works offline with no extra assets.
- The host maps its own vocabulary onto these names. The page does not know the host's token names.

| Token | Light default | Dark default | Used for |
|---|---|---|---|
| `--ui-font` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` | same | chrome font |
| `--ui-focus` | `var(--ui-accent)` | `var(--ui-accent)` | focus rings (`:focus-visible` outline in the embedded build; note textarea focus) |
| `--ui-bg` | `#E9EAEE` | `#0F1114` | page and canvas background |
| `--ui-dot` | `#D3D6DC` | `#22262D` | canvas grid dots |
| `--ui-panel` | `#FFFFFF` | `#181B21` | bar and card surface |
| `--ui-panel-2` | `#EEF0F3` | `#1F232B` | inset surface (segmented controls, inputs) |
| `--ui-raised` | `#FFFFFF` | `#2A2F39` | raised surface (selected segment) |
| `--ui-border` | `#D7DAE0` | `#2C313B` | hairlines |
| `--ui-border-strong` | `#C5C9D1` | `#4A5160` | control borders |
| `--ui-text` | `#1F2329` | `#ECEEF2` | text |
| `--ui-muted` | `#5F6672` | `#9AA3B2` | secondary text |
| `--ui-accent` | `#1F2329` | `#F5F6F8` | selected and primary controls |
| `--ui-accent-hover` | `#000` | `#FFFFFF` | primary hover |
| `--ui-on-accent` | `#FFFFFF` | `#0F1114` | text on accent |
| `--ui-warn` | `#8A5A00` | `#F2B65A` | "overridden" text |
| `--ui-warn-bg` | `#FFF6E8` | `rgba(242,182,90,.14)` | "overridden" background |
| `--ui-warn-border` | `#F0D9B0` | `rgba(242,182,90,.45)` | "overridden" border |
| `--ui-lock` | `#1E7A4C` | `#4ADE80` | locked state |
| `--ui-lock-bg` | `#E8F6EE` | `rgba(74,222,128,.14)` | locked background |
| `--ui-lock-border` | `#B7E0C8` | `rgba(74,222,128,.45)` | locked border and halo |
| `--ui-on-lock` | `#FFFFFF` | `#0F1114` | text on lock |
| `--ui-shadow` | `0 2px 6px rgba(0,0,0,.10), 0 30px 80px -20px rgba(0,0,0,.28)` | `0 2px 6px rgba(0,0,0,.35), 0 30px 80px -20px rgba(0,0,0,.6)` | screen shadow |
| `--ui-shadow-card` | `0 14px 40px -10px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.08)` | `0 18px 50px -10px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4)` | card shadow |
| `--ui-shadow-sm` | `0 1px 2px rgba(0,0,0,.10)` | `0 1px 2px rgba(0,0,0,.4)` | small shadow |

### What the tokens style, and what they do not

Tokens style the **chrome**: the bar, cards, notes, chips, padlocks, canvas and focus rings. They never reach the mockups. "Mockup" means the inner `.screen` element of each screen (its layout, palette, fonts and content), which comes only from the templates, `assets/theme.css` and the bar's settings. The `.sb-screen` wrapper around it is chrome: its shadow (`--ui-shadow`) and 6px corners are themed and are not part of the mockup.

Chrome in the embedded build has no theme toggle (the host owns light/dark) and no Export button (the host owns the state); the lock count is a standalone chip in the tools row.

### Font weight 800

Some chrome text (the title, row titles) uses weight 800. DM Sans is bundled at 400 to 700, so 800 renders as 700. This is accepted.

## Running the fixture

`scripts/fixtures/embed-host.html` is a small host that frames the embedded build twice: (a) `<iframe src sandbox="allow-scripts">` and (b) `<iframe srcdoc sandbox="allow-scripts">` with a `Content-Security-Policy` meta tag inserted right after the page's `<head>` (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:`), the shape a locked-down host uses. (Placing it before `<!doctype>` would put the frame in quirks mode.) It has Light/Dark, Read-only on/off and Send sample state buttons, a message log, and Copilot token values for both themes mapped onto the `--ui-*` names above.

A `file://` page cannot read another file, so frame (b) gets the page text from the fixture's file picker (choose `prebuilt/design-sandbox.embedded.html`) or, from a script, `embedHost.loadSrcdoc(text)`. The sample state is inlined in the fixture; `scripts/fixtures/sample-state.json` is the same synthetic state (two locks, an override, notes, a non-default bar), and the verification script checks the two are equal. Two query switches exist for the verification script only: `?sandbox=off` (frame (a) without the sandbox, to check browser storage) and `?frame=full` (one edge-to-edge frame, for the mockup screenshots).

```sh
node scripts/build.mjs --out prebuilt --minify --emit-md references   # produces prebuilt/design-sandbox.embedded.html
open scripts/fixtures/embed-host.html
```

By hand: wait for `ready` in the log, press Send sample state, change a setting and watch `state` messages arrive with their `reason`, switch Read-only on and confirm the controls disable and nothing more is posted, and flip Light/Dark.

## Verifying

Playwright is needed for the scripts (`mkdir -p node_modules && npm install --prefix "$PWD" --no-save --no-package-lock playwright@1 && npx playwright install chromium`).

```sh
node scripts/build.mjs --out prebuilt --minify --emit-md references
node scripts/build.mjs --check-palettes
node scripts/verify-fonts.mjs prebuilt/design-sandbox.embedded.html   # each bundled font family measured against a monospace fallback, network blocked
                                                                       # (it prints to the terminal; tee it to keep a record)
node scripts/verify-fonts.mjs prebuilt/design-sandbox.html
node scripts/verify-embedded.mjs                                       # the bridge, read-only, tokens, offline and standalone-regression checks (3–4 minutes); evidence in test-results/
```
