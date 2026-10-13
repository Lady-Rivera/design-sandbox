# Running the Sandbox

What the rep is working with in the room, how to talk about it, and what leaves the meeting.

## What is on the page

One page, our own canvas. Two rows — **Login** and **Dashboard** — each with four layouts side by side, tops aligned, in a fixed order that never changes. Every layout is shown twice: the 1440-wide desktop screen with its own 390×844 mobile counterpart to its right, tops aligned ("A1" and "A2"). The two are separate screens on the page — each has its own card, lock and note — they simply sit together. The mobile mirrors its desktop's widgets and content, not its chrome, and follows the desktop's shell into a mobile-native menu:

Labels are one letter per layout, unique across the page, plus **1** for the desktop and **2** for its mobile — the chip above a screen says only that ("C1", "C2"); the layout's name appears in the screen's card and in the exports.

| Login | Desktop (·1) | Mobile (·2) |
| --- | --- | --- |
| **A** | Centered card on a soft page | Centered card on the soft page, logo above |
| **B** | Split: brand panel left, form right | Brand block on top, form on a sheet rising over it |
| **C** | Form left, product preview right | Form on the surface, product preview peeking from the tinted band below |
| **D** | Dark frame, floating card, one-time code | Dark frame, soft glow, floating one-time-code card |

| Dashboard | Desktop (·1) | Mobile (·2) |
| --- | --- | --- |
| **E** | Light sidebar | Shell-tinted top bar, stats bar, order list card, tool cards as a swipe strip; light bottom tab bar |
| **F** | Dark sidebar; order list with status edge bars, 2×2 stat tiles and tools on the right | Dark header holding the greeting, 2×2 tiles straddling its edge, edge-bar orders, quick-action icons; dark tab bar with a docked New order button |
| **G** | Top nav (no sidebar); greeting bar, stat column, Open / Done / Cancelled board, note feed | Dark top bar with a menu button and no tab bar; greeting card, stat grid, the board as a segmented control, note with feed |
| **H** | Dark frame with a collapsed icon rail; side panel plus a by-date order table | Dark frame with greeting, New order and four stats; orders by date on a rounded sheet; icon-only floating pill for nav (the rail) |

The login mobiles are deliberately spare: logo, title, the fields, one button, two text links.

Content is identical across variants and deliberately generic — one company ("Acme" until the client's logo replaces it), the same figures, the same rows — so the only thing that differs between A and C is the layout.

## The controls

Every control is drawn outside the zoomable layer, so it is the same size whether the canvas is at 5% or 100%.

**The master bar** (top, always visible) changes all sixteen screens at once. Two zones separated by a rule. Above it, the **interface** row: the title, **Compare · Reset · Notes · Export**, and the page's own light/dark toggle — none of these change a mockup. Below it, everything about the **mockups**: Density · Font · Mode · Nav icons, then at the right **Show** (All · Desktop · Mobile) and the view controls (View all · − · % · +), then Color:

- **Density** — comfortable · compact.
- **Color** — the ten palettes from `palettes.md` by name with a swatch, plus the client's brand when one was supplied. Each palette is a verified trio with separate light and dark values, so switching mode never leaves a color tuned for the wrong surface.
- **Font** — the five pairs in `font-pairs.md`, plus the brand fonts when supplied.
- **Mode** — light · dark.
- **Nav icons** — on · off: hides the icons in the sidebars and the top bar (the collapsed icon rail keeps them). The client will ask about whichever layout they already like.
- **Apply <Client> brand** — present only when branding was supplied: one click sets the client's colors (and fonts, if any) on every unlocked screen and clears per-screen color/font overrides; locked screens keep their captured look. The logo is on every screen regardless.
- **Show — All · Desktop · Mobile** — which screens are on the canvas. Desktop or Mobile hides the other kind and re-flows each row so the remaining screens sit tight; hidden screens keep their locks, notes and overrides, and the exports are unaffected. Remembered in this browser.
- **View all · − · % · +** — refit the view (keys 0, −, +). In the interface row: **Compare** (key C) starts the side-by-side picker described below, and the bar is hidden while the comparison is open; **Reset** clears every per-screen change on unlocked screens; **Notes** (N) opens the meeting-notes panel; **Export** (with a count of locked screens) opens a small dialog that asks which of the two exports (below) to make — *For Claude Design* or *HTML file* — and says how many locked screens it will carry.

**Pointing** — click a screen or its label and it gets a ring and its card opens (badge "C1" or "C2", the layout's name, "Login · desktop" or "Login · mobile"); that is a pointer for the room ("this one"), nothing more. Double-click a screen to zoom to it.

**Locks — the picks.** The padlock above each screen (or L with the screen's card open) **locks** it: the look it has at that moment — density, color, font, mode — is captured and the screen stops following the bar. Reset overrides and the D key leave locked screens alone; the card's controls are disabled and say *Locked in — unlock to change*. A locked screen has a green ring and a filled padlock. Lock as many as the client chooses — two dashboards when they can't decide is a normal outcome. **The exports carry locked screens only**, each with its captured look. Unlocking keeps the captured look as an ordinary override (amber badge), so nothing changes on the projector. A desktop screen and its mobile counterpart are separate units: lock both when the client wants the layout on both form factors, or lock a mix (A1 with B2) — the exports carry whatever is locked. By default the bar themes a desktop and its mobile alike; the mobile's own card is how you show "the phone in dark" beside a light desktop.

**Notes.** Each card has a note field — what the client said about that screen, saved as you type (a dot appears on the screen's label). **Notes** in the bar opens the meeting-notes panel: a general field for anything not about one screen, the list of per-screen notes (click one to open that screen), and **Clear notes** (click twice). Everything the rep locks, overrides or types is saved in this browser; on the hosted page it is also saved in the page's own database — the page asks once, at load, so no prompt appears in front of a client — and a second open view follows live. After the meeting Claude reads that database directly (SKILL.md § 5).

**Compare — two side by side.** For "show me those two next to each other" or "this one light and dark at once". Click **Compare** in the interface row (or in a screen's card, or press C): a banner appears and the canvas becomes a picker — click a screen for the left side, then a screen for the right side: any two — A1 beside B2, a desktop beside a mobile; click the **same screen twice** to see it in two looks. Each pane shows exactly one screen. (Shift-clicking a screen is a shortcut that starts the picker with that screen on the left.) The master bar steps aside and the two panes fill the page, each with its own Density, Mode, Nav icons, Color and Font that change only that pane (a pane starts from whatever look its screen has on the canvas). Nothing a pane shows touches the real screen until the rep chooses to keep it: **Save to screen** writes that pane's look into the screen's overrides (or, for a locked screen, into its lock — it stays locked), and the pane's padlock locks the screen with the pane's look. Each pane has a note field (one shared field when both sides are the same screen) — the same note as the screen's card. **Space** cycles focus: left pane full width → right pane → both; **Swap** exchanges the sides; **Done** (or Esc) closes. If a side has an unsaved look, Done asks first — *Save & close · Discard · Keep comparing*; when the same screen is on both sides and both changed, it asks which side's look the screen should keep. Nothing in the compare view is exported or saved on its own.

**The screen card** — clicking a screen opens a card at the top right with only that screen's Density, Mode, Nav icons, Color and Font, its Note, the padlock and a **Compare…** button that starts the side-by-side picker with this screen on the left. Every control has a **Set** position meaning "same as the bar"; anything else is an override for that screen alone, and the card says *Overridden* until **Use the set values** puts it back. **Zoom** fits that screen; ✕, Esc or a click on empty canvas closes the card. A screen with any override shows an amber ring on its label badge. "Let's see just C in dark" or "just B in Evergreen" is one click on the screen and one on the card.

**Navigation** — scroll to pan, ⌘/Ctrl-scroll or pinch to zoom, drag to move. `D` flips light/dark for everything unlocked; `L` locks or unlocks the open screen; `N` opens Notes; `C` starts Compare (shift-click a screen to start it with that screen on the left; space cycles focus inside the view). The page shows no help text of its own (nothing for the client to read but the screens), so these shortcuts go in the chat message that hands the page over.

**How the palette shows** — the shells carry the color, not just buttons and links: the dark sidebars of B and C, the frame of D, the brand panel of Login B and the background of Login D are the primary deepened toward ink; A's light sidebar is a tint of it. Switching palettes is visible from the back of the room. The page's own chrome (bar, canvas, card) is neutral so the screens are the only color on it; it is light by default and the moon button at the top right flips it dark (remembered per browser, and separate from the screens' Mode).

**Hover states** are built into every screen — buttons, links, nav items, table rows, cards, inputs, tabs — so the rep can move the cursor over a layout and it behaves like software rather than a picture. Links inside the mockups are inert. One control actually works: the **«** button at the top of a sidebar (Dashboards E, F, H) collapses it to an icon rail and back — click it live when a client asks about a collapsed nav; Dashboard G answers the other common question, a top bar instead of a sidebar.

## What Claude does in the room

Mostly nothing. The rep narrates; the design speaks for itself. When asked:

- *"Can we see it in the green one?"* → name the chip: "Color → Evergreen & Clay." Don't regenerate anything.
- *"Can the table be wider / can we add a chart / what about a settings page?"* → structural. Say it is a note for the prototype and record it. Never edit a template or generate a screen during the meeting.
- *"Why does the button look different in dark mode?"* → one sentence: the palette has separate light and dark values so it stays readable on both.

Keep every answer to a line or two. The rep has the floor.

## Exporting choices

The lasting output when the meeting ends without a prototype request, and the input to the prototype when there is one. Short — a punch list, not minutes. Client-safe. The page writes it; nobody retypes it.

```
# Design Sandbox — choices · <Client> · <date>

Locked in (final):
- Login C1 — Form + product preview — comfortable · Deep Teal & Plum (light #0F5F63 #7A2E6A #8A5A00 · dark #1CB0B7 #D185C1 #D98E00) · DM Serif Display + DM Sans · light
- Dashboard F1 — Dark sidebar, order list — comfortable · Deep Teal & Plum (…) · DM Serif Display + DM Sans · dark
- Dashboard H2 — Dark frame, panel + table (mobile) — comfortable · Deep Teal & Plum (…) · DM Serif Display + DM Sans · light

Set values at the end of the meeting: comfortable · Deep Teal & Plum — light … · dark … · DM Serif Display + DM Sans (headings …, body …) · light

Overrides on unlocked screens:
- none

Brand supplied: primary #0F5F63, logo (client-logo.png). Contrast: …

Notes:
- Dashboard F1 — Dark sidebar, order list: Liked the edge bars; wants the note box lower.
- Dashboard E1 — Light sidebar (not locked): Too plain for them.
- General: Prefers "Clients" over "Customers" in the nav / wants a settings page in the prototype

Not locked: Login A1, A2, B1, B2, C2, D1, D2 · Dashboard E1, E2, F2, G1, G2, H1 — shown and passed over, not forgotten.
```

**Export** offers two exports, each for one destination, both built from the **locked** screens:

- **For Claude Design** — the meeting record above, then an instruction paragraph (create exactly these artboard files, byte for byte, one per locked screen, side by side; no merging, redesign, switcher or invented content) followed by one fenced `html` block per screen that is a **complete Design Component file** — `Main.dc.html` for the first, then `<Set>-<Label>.dc.html` (and `…-Mobile.dc.html` for a paired mobile): the `<x-dc><helmet>` shell with the Google Fonts link, the full theme stylesheet, the icon sprite and the screen's markup taken straight from the page's DOM (its captured look already on it) — plus a `canvas.json` block for the layout. Pasted into Claude Design, its model only has to save the files. About 50 KB per screen because each file carries the stylesheet.
- **HTML** — **saves** one self-contained `.html` file (`design-sandbox-screens-<client>-<date>.html`) with the locked screens stacked and labelled, exactly as shown, and the meeting record as a comment at the top. Open it in any browser; hand it to a developer. On the hosted page the save goes through the viewer's downloads capability (the page must be published with `capabilities: {downloads: true, db: {}}`; the viewer confirms the save); the `design-sandbox.html` file on the rep's computer downloads directly; if neither is possible the same text is copied to the clipboard and the toast says to paste it into a plain-text editor and save it as `.html`.

Both end with one line, `<!-- design-sandbox picks: {"v":2,...} -->`, holding the raw state: `locks` (unit → captured density/palette/font/mode), `notes`, `general`, `bar`, `overrides`. When a rep pastes either export to Claude (Cowork / Code) instead, that line becomes `picks.json` for `scripts/build.mjs --picks`, which exports the same screens as Claude Design artboards from the source templates. With nothing locked, both exports do nothing and the toast says to lock screens first.

**The page's database** holds the same state while the meeting is on and afterwards — document `meeting/state`, fields `bar`, `ov`, `locks`, `notes`, `general`, each entry stamped `at` (ms) so the browser copy and the page copy merge newest-wins; a removed entry stays as `{ _del: true, at }`. Reading it from Claude (`read_db`, collection `meeting`, doc `state`) replaces the paste when the rep presented from the hosted page.

Rules: hex values are copied from the build (`build-info.json` and `theme.css`), never retyped from memory. Labels are the canvas labels. Defaults the client accepted without comment are still recorded as the values they are — "comfortable" is a decision even when nobody touched the chip. Include the contrast finding whenever a brand color was involved.
