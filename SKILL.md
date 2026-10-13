---
name: design-sandbox
description: Rep-run design sandbox for client meetings: eight fixed, pre-reviewed layouts (logins A–D, dashboards E–H), each a desktop screen (A1) with its own mobile counterpart (A2), on one pan-and-zoom page with a master bar that themes every screen (density, palette, font pair, light/dark) and per-screen overrides, locks (the picks) and notes always in view. Builds immediately with no questions, publishes the page, then offers to fold in the client's branding; afterwards exports the picks to Claude Design or builds a rep-reviewed prototype. Run from Claude (desktop/web). Use for "design sandbox", showing a client layout options, comparing login or dashboard designs.
---

# Design Sandbox

A rep walks into a client meeting with sixteen finished screens already on one pan-and-zoom page — four login layouts and four dashboard layouts, each a desktop screen with its own mobile counterpart beneath it — and the client points at what they like while the rep flips density, color, font and light/dark for all of them at once, or for any one screen, from controls that stay full-size no matter how far out the canvas is zoomed. Nothing is generated in the room. The screens are fixed templates that were designed, reviewed and approved before any client ever saw them; the only thing that changes live is the theme.

That is the whole idea, and it produces one rule that governs everything else here:

**The client never sees anything that was not reviewed first.** The templates in `assets/screens/` are the reviewed set. This skill assembles them; it does not redesign them, add screens to them, or invent content for them during a session. When a client wants something the sandbox does not show, that is a note for the export packet or a job for the post-meeting prototype (which the rep reviews before sharing) — never a live change.

## The flow

1. **No questions.** Take the finished files as they are, or run `scripts/build.mjs` when the rep's message already carried branding.
2. **Deliver** the sandbox page: publish `design-sandbox.artifact.html` as a hosted page (the Artifact tool), and hand over the HTML file as the offline copy. It ships finished inside the skill (`prebuilt/`), so nothing runs unless branding is being folded in.
3. **Offer branding** in one closing line. If it arrives, rebuild into the same canvas.
4. **In the meeting**: the rep drives the tweaks; the client reacts. Claude is quiet unless asked.
5. **After the meeting**: export the choices — the packet, and the two chosen screens as editable Claude Design artboards — or build a prototype from them.

Sessions that are not preparing for a meeting — the skill's maintainer updating a template, say — are covered in § Maintaining the templates.

## 1. No questions — build first

**Do not ask anything before building.** No form, no pop-up, no question widget, no "what's the client's name?" in chat. The sandbox needs no input: it is the same ten reviewed templates every time (already assembled in `prebuilt/`), and the client's name and branding only affect titles and whether a Brand option appears in the Color and Font chips. Both can be added afterwards in seconds, so nothing is gained by asking first.

Read the rep's opening message for what it already contains:

- **Client name** — "sandbox for Harbor Health", "meeting with JG Health tomorrow". Two or three words, 50 characters at most; trim, never invent. If there is none, the canvas is titled plain "Design Sandbox" and that is fine.
- **Branding** — hex codes, font names, a logo file, or a screenshot of the client's site or brand guide. If any of it is there, it goes straight into the first build (see § Branding below). If not, build without.

Then take the files (§ 2) and deliver them (§ 3). Everything the old interview asked — industry, density, mode, personality — is either irrelevant (the content is deliberately generic) or a tweak the client sets for themselves in the room.

## Branding — offered after, never asked before

The handover ends with **one line**, and only this line:

> Send the client's name or branding any time — hex codes, fonts, a logo, or a screenshot of their site — and I'll rebuild it into this same canvas.

Then stop. When branding arrives (in the opening message or later), open `references/brand-intake.md` for how to turn hex codes, font names, a logo, or a screenshot into a fresh `brand.json` (never reuse one from another client), rebuild with `--brand`, and republish to the **same** canvas or hand over the refreshed HTML. Values read from a screenshot are shown to the rep for a yes before the rebuild; typed hex codes always win over values read from an image.

The brand becomes an **extra option** in the Color and Font tweaks, labeled with the client's name, plus an **Apply <Client> brand** button at the end of the Color row that sets the brand colors and fonts on every unlocked screen in one click (clearing per-screen color and font overrides; locked screens keep their captured look) — the ten palettes and five pairs stay available, because showing a client their own colors beside three alternatives is half the value of the meeting. The rebuilt sandbox opens with the brand selected. The logo, once supplied, is on every screen regardless of which palette is showing. With only a primary color, the script borrows a matching secondary and tertiary from the stock palette nearest in hue and says which; with no fonts, the Font chip simply has the five stock pairs. A logo goes in the logo slot on every screen (login headers, dashboard sidebars, mobile top bars); keep it under ~70 KB — downsample with whatever is on the machine (`sips -Z 600`, ImageMagick, Pillow) if it is larger.

Anything else in a rep's message — a URL, a note about the client, "they hate blue" — goes into the export packet's notes, never into a question back.

## 2. The files

**The screens are files, not something you write.** The finished, unbranded sandbox ships inside this skill in `prebuilt/`:

- **`design-sandbox.artifact.html`** — the sandbox page, ready for the Artifact tool (it has no doctype/html/head/body of its own; the tool adds them).
- **`design-sandbox.html`** — the same page as a complete file that opens in any browser.
- **`design-sandbox.embedded.html`** — the same page for a host that frames it (postMessage bridge, read-only mode, host-styled chrome); not for publishing, see `references/embedding.md`.
- **`Main.dc.html`, `Dashboard.dc.html`, `canvas.json`** — the two sets as Claude Design artboards, kept for sessions that want a canvas instead (also as code blocks in `references/artboard-*.md`).

Whichever you use, the content is used **byte for byte**. Never retype it from memory, never summarize it, never "assemble the templates directly", never write a version of the sandbox from the description in this file. A run that cannot read either form **stops and says exactly that**. The tells that something was written rather than copied: density options that are not exactly *comfortable · compact*; a palette list that is not the ten names in `references/palettes.md` (Harbor Blue, Evergreen & Clay, Indigo Slate, Ink & Rust, Deep Teal & Plum, Navy & Copper, Aubergine & Rose, Forest & Slate, Burgundy & Olive, Amber & Graphite); font options that are not the five pairs in `references/font-pairs.md`; layouts that differ from `references/running-the-sandbox.md` § What is on the page. Any of those means the client would be shown something nobody reviewed.

What the page is, for the record (`references/running-the-sandbox.md` has the detail): a **master bar** at the top in two zones — above a rule, the interface: the title, **Compare · Reset · Notes · Export** and the page's own light/dark toggle; below it, everything about the mockups: Density, Font, Mode, Nav icons, plus **Show** (All · Desktop · Mobile — which screens are on the canvas) and the view controls (View all, zoom); then the ten named palettes (and, when branding was supplied, an **Apply <Client> brand** button that puts the client's colors and fonts on every unlocked screen in one click) — that changes all sixteen screens; a **pan-and-zoom canvas** with the Login row above the Dashboard row, each desktop with its mobile counterpart to its right; and a **screen card** that opens when a screen is clicked, with only that screen's density, mode, color and font (each with a "Set" position meaning "same as the bar"), a **note** field, a **lock**, and a **Compare…** button. Every screen is its own unit — a mobile has its own card, overrides, lock and note, separate from the desktop it sits beside (by default the bar themes them alike; the card is how a rep shows "the phone in dark, the desktop in light"). Locking captures the screen's current look and freezes it — the bar, Reset overrides and the D key leave locked screens alone — and locked screens are what the exports carry, in any mix (Login A's desktop with Login B's mobile is a normal pick); any number can be locked. A **Notes** panel holds general meeting notes. **Compare** turns the canvas into a picker — click two screens, or the same screen twice — and shows them side by side with the bar hidden, each pane with its own controls; *Save to screen* keeps a pane's look as that screen's overrides, and Done asks about anything unsaved. Nothing from it is exported on its own. Everything the rep locks, overrides or types is saved in the browser and, on the hosted page, in the page's own database, so a reload loses nothing and Claude can read it afterwards. Controls are drawn outside the zoomed layer, so they are the same size at 5% as at 100%.

**Branding** is the one case that needs the build script (`scripts/build.mjs`, Node). With Node:

```bash
node <skill dir>/scripts/build.mjs --out <abs out dir> --brand <abs out dir>/brand.json         # client name comes from brand.json
node <skill dir>/scripts/build.mjs --out <abs out dir> --client "Harbor Health"                 # name only
node <skill dir>/scripts/build.mjs --brand <abs out dir>/brand.json --check                     # contrast report only
```

Read stderr every time a brand was supplied: it names the stock palette the secondary/tertiary were borrowed from (if they were), says whether the brand font was bundled for offline use (fetched from Google at build time; if that failed it loads at view time and needs internet), and prints a **contrast report** — WCAG 2.2 AA checks of the brand primary as text, as a button fill, and with its label color, in both modes — plus any derived value (a lifted dark-mode primary; a darker text-safe variant for links and small text when the primary fails as text). **Report it to the rep in one or two sentences every time, pass or fail.** Without Node, deliver the unbranded sandbox and say in one line that the branding needs a session with a shell to fold in. Never approximate a brand by hand.

## 3. Deliver

**The sandbox page — the default, from Claude (Cowork, claude.ai, Claude Code).** Publish `design-sandbox.artifact.html` with the Artifact tool: `file_path` pointing at the file (from `prebuilt/`, or the fresh build when branding was folded in), a one-line `description`, a `favicon` of one emoji, and `capabilities: {downloads: true, db: {}}` — `downloads` is what lets the page's **Export → HTML file** save a file from the hosted page (the viewer confirms each save; without it the page copies the HTML instead), and `db` gives the page its meeting-state database (locks, notes, bar values), which the page asks the viewer to allow once when it loads. A page with `db` is **organization-internal**: only signed-in Jahnel Group people can open the link, which is fine because the sandbox is always shown from the rep's laptop and clients receive the HTML export, never the live link. Restate both capabilities on every publish (an explicit `capabilities` object replaces the stored one). Title is already in the file (*"Design Sandbox — <Client>"* or *"Design Sandbox"*). Then send `design-sandbox.html` with SendUserFile as the offline copy. A later rebuild republishes the **same** file path so the link stays the same. Hand over the card and the file with a line or two — include this controls line, since the page itself carries no help text:

> Click a screen to open its card and tweak just that one · the padlock above a screen (or L with its card open) locks its look — locked screens are what Export carries, and the bar, Reset and D leave them alone · type a note in the card; Notes (or N) holds the general notes · Compare (bar or card) then click two screens — or the same one twice — to see them side by side; Save to screen keeps a side's look, Done closes · scroll to pan · ⌘/Ctrl + scroll or pinch to zoom · double-click a screen to zoom to it · keys 0 fits every screen in view (View all) · D flips light/dark · Esc closes the card.
>
> Open the page once before the client arrives: it asks to use its database then (the answer is remembered), and any test notes can be cleared from Notes → Clear notes.

Then the one branding line from § Branding, nothing more.

**No Artifact tool** — deliver `design-sandbox.html` alone; it opens in any browser.

**Inside the Claude Design app.** Claude Design gives a skill only this text — none of the skill's other files are readable there and nothing can run — so the sandbox **cannot be built inside Claude Design**. Do not work around it and do not draw substitute screens. Reply with exactly this, and stop:

> The Design Sandbox can't be built inside Claude Design — this app can't read the skill's reviewed screen files. Run `/design-sandbox` in Claude (the desktop or web app) instead: it publishes the sandbox as a page you can open, present from, and share. Claude Design is where the *chosen* screens land afterwards, as editable artboards.

Everywhere: the labels are one letter per layout, unique across the page — logins **A–D**, dashboards **E–H** — with **1** for the desktop and **2** for its mobile ("C1", "C2"), and nothing else on the chip, so "we liked C1" and "C2 in dark" are unambiguous and short enough to say across a table. The five font pairs are bundled into the page and render offline; say nothing about fonts unless a brand font could not be bundled (the build says so on stderr), in which case one clause: that family needs internet in the room.

## 4. In the meeting

The mechanics the rep is working with, and how to talk about them, are in `references/running-the-sandbox.md`. In short: the master bar changes all sixteen screens at once; clicking a screen rings it so the room can see which one is under discussion and opens its card, which changes that one screen only ("let's see only C1 in dark"); double-click zooms to it; the View all button (key 0) and the − / + stepper refit the view; the « button on a sidebar collapses it to icons (Dashboard G has a top bar instead of a sidebar).

When the client settles on a screen, the rep **locks** it (the padlock above the screen, or L with its card open): the look it has at that moment is captured and stops following the bar, so the rest of the meeting can keep exploring without disturbing it. Two finalists? Lock both. What the client says about a screen goes in that screen's **note** (card → Note); anything else goes in **Notes** in the bar. Unlocking keeps the captured look as an ordinary override, so nothing jumps on the projector.

Claude's job during the meeting is to stay out of the way. If asked to change something a tweak can express, say which chip does it. If asked for something structural — a different layout, another page — record it as a request for afterwards and say so plainly; don't start generating.

## 5. After the meeting

Offer both, in one short line:

- **Export the choices** — two things at once. (0) **Read the meeting first.** When the rep presented from the hosted page, its database already holds everything: `Artifact` tool, `action: "read_db"`, `db_op: "get"`, `collection: "meeting"`, `doc_id: "state"`, with the page's `url`. The document has `locks` (unit id → captured density/palette/font/mode — the picks), `notes` (unit id → text), `general` (meeting-wide notes), `bar` (the set values at the end) and `ov` (overrides on unlocked screens); entries with `_del: true` are removed ones — ignore them. Turn that into `picks.json` in the shape `{ "v": 2, "client", "locks", "notes", "general", "bar", "overrides" }` and skip the paste. When the rep used the offline file, or the database is empty, fall back to the paste below. (1) The packet: the locked screens (by set and label) each with its captured values (density, palette name with hex values, font pair, mode), the set values at the end, overrides on unlocked screens, brand and contrast findings, the notes, and the screens shown but not locked. The page's **Export** dialog offers two exports: *For Claude Design* (the packet followed by complete `.dc.html` artboard files for the locked screens, so a paste into Claude Design recreates those exact screens as separate artboards) and *HTML* (saves the locked screens as one browser-ready `.html` file for a developer — via the downloads capability on the hosted page, a direct download from the file on disk). Both end in a `<!-- design-sandbox picks: {"v":2,...} -->` line; when the rep pastes either here, save that JSON as `picks.json`. Spec: `references/running-the-sandbox.md` § Exporting choices. (2) **The chosen screens in Claude Design**: `node <skill dir>/scripts/build.mjs --out <dir> --picks picks.json` writes one artboard per locked screen (a paired variant gives desktop + mobile) with its captured look baked in as the defaults, plus `canvas.json`; load the `design` skill and publish them as a canvas titled *"<Client> — chosen screens"*. That canvas is where a designer edits from here on; the sandbox page stays as the record of the comparison.
- **Build a prototype** — a living prototype (one file, working navigation) in the chosen layout and theme. Spec: `references/prototype.md`. Ask which pages to include from the fixed checklist; login and dashboard are always in. Desktop first; mobile follows as a separate canvas page once the desktop screens have settled. **The prototype is AI-generated and the rep reviews it before the client sees it** — the sandbox is the client-facing surface, the prototype is a rep-reviewed follow-up.

## Narration

Lean. The rep does the explaining. State what was built in a sentence or two, then what to do next. No rationale paragraphs; no counts, ratios or measurements in prose about the output (hex values and anything the client supplied are the exceptions — those are copied, not counted). When something is uncertain — a font that only loads online, a brand color that failed a check — say it plainly and once.

Client-safe throughout: no consultancy name or branding anywhere the client might see. The placeholder company on every screen is "Acme" until a logo replaces it.

## Maintaining the templates

Templates are HTML fragments in `assets/screens/`, sharing `assets/theme.css` and the partials in `assets/partials/`; the five font pairs are vendored in `assets/fonts/` (refresh with `scripts/fetch-fonts.sh`, check with `scripts/verify-fonts.mjs` — `references/font-pairs.md` § Refreshing); the ten palettes are defined once in `assets/palettes.json` (`references/palettes.md` § Editing). Their inventory, the token contract they must honor, and the review rule for changing them are in `references/templates.md`. The short version: a new or changed template is reviewed by the skill's owner against the rendered output before it ships, then the skill is repackaged. Never edit a template in a session that is preparing for or running a client meeting.
