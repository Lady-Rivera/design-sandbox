// Design Sandbox — the standalone canvas page.
// Our own pan/zoom surface with a fixed master bar (drives every screen), a per-unit card that
// opens when a screen is clicked (full-size at any zoom), locks that freeze a unit's look, notes,
// and a meeting-state store (browser + the hosted page's database). Exported as a function so
// build.mjs can call it with the assembled screens.
//
// Units: EVERY screen is its own unit (Abby, 2026-09-16) — the desktop and its mobile counterpart each
// have their own card, overrides, lock and note; Compare picks screens; the exports carry whatever is
// locked. The pair survives only on the canvas: the phone sits to the right of its desktop under the
// same letter, and the master bar themes both (all sixteen) together by default.

export function canvasPage({ SETS, screensHtml, paletteOptions, fontOptions, defaultPalette, defaultFont, CLIENT, PAGE_TITLE, brand, report, googleHref, fontsCss = '', fontsHref = googleHref, themeCss, iconsSprite, FALLBACK_HEAD, FALLBACK_BODY, bodyOnly, embedded = false }) {
  // ---- stage geometry (canvas px, zoom 1) ----
  const GAP = 160, ROW_GAP = 480, PAD = 120, LABEL_H = 90, PAIR_GAP = 60;   // PAIR_GAP: desktop → its mobile, to the right (Abby, 2026-09-15)
  const layout = [], units = [];
  let y = PAD + LABEL_H;
  for (const set of SETS) {
    let x = PAD; let rowH = 0;
    for (const v of set.variants) {
      const unitId = `${set.key}/${v.key}`;
      // labels: the layout's letter + 1 for the desktop, 2 for its mobile ("A1", "A2") — unique across the page
      units.push({ id: unitId, set: set.key, setTitle: set.title, key: v.key, letter: v.label, label: v.label + '1', name: v.name, role: 'desktop', pair: v.mobile ? `${unitId}~m` : null });
      layout.push({ id: unitId, unit: unitId, set: set.key, key: v.key, role: 'desktop', label: v.label + '1', name: v.name, x, y, w: v.w, h: v.h });
      let colH = v.h, colW = v.w;
      if (v.mobile) {
        // the mobile counterpart sits to the right of its desktop, tops aligned — its own unit, same letter
        const mid = `${set.key}/${v.key}~m`;
        units.push({ id: mid, set: set.key, setTitle: set.title, key: `${v.key}~m`, letter: v.label, label: v.label + '2', name: v.name, role: 'mobile', pair: unitId });
        layout.push({ id: mid, unit: mid, set: set.key, key: `${v.key}~m`, role: 'mobile', label: v.label + '2', name: v.name, x: x + v.w + PAIR_GAP, y, w: v.mobile.w, h: v.mobile.h });
        colH = Math.max(v.h, v.mobile.h); colW = v.w + PAIR_GAP + v.mobile.w;
      }
      x += colW + GAP; rowH = Math.max(rowH, colH);
    }
    set._rowY = y; set._rowH = rowH; set._rowW = x - GAP - PAD;
    y += rowH + ROW_GAP;
  }
  const STAGE_W = Math.max(...SETS.map(s => s._rowW)) + PAD * 2;
  const STAGE_H = y - ROW_GAP + PAD;

  const screens = layout.map(l => {
    const html = screensHtml[l.id];
    if (!html) throw new Error(`no screen html for ${l.id}`);
    return `<div class="sb-screen" data-id="${l.id}" data-unit="${l.unit}" data-set="${l.set}" data-key="${l.key}" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px">${html}</div>`;
  }).join('\n');

  const swatches = paletteOptions.map(p => `<button class="sb-swatch" type="button" data-palette="${p.id}" title="${p.name}"><i style="--p:${p.light[0]};--s:${p.light[1]};--t:${p.light[2]}"></i><span>${p.name}</span></button>`).join('');
  const fontSelect = `<select class="sb-select" data-font aria-label="Font pair for all screens">${fontOptions.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>`;
  const LOCK_SVG = '<svg class="lock-closed" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><svg class="lock-open" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/></svg>';

  // The per-unit card: appears while a unit is active. Every control has a "Set" position that clears
  // the override (blank = same as the bar). A locked unit's controls are disabled — "Unlock to change".
  const popup = `
    <div class="sb-pop" hidden>
      <div class="sb-pophead">
        <span class="sb-badge"></span>
        <div class="sb-popid"><b class="sb-popname"></b><span class="sb-popset"></span></div>
        <button type="button" class="sb-poplock sb-lockbtn" title="Lock this screen's look (L)" aria-label="Lock"><span class="lock-ic">${LOCK_SVG}</span></button>
        <button type="button" class="sb-popzoom" title="Zoom to this screen">Zoom</button>
        <button type="button" class="sb-popclose" title="Close" aria-label="Close">✕</button>
      </div>
      <fieldset class="sb-popcontrols">
        <div class="sb-poprow"><label>Density</label><div class="sb-seg sm" data-field="density"><button type="button" data-val="">Set</button><button type="button" data-val="comfortable">Comfortable</button><button type="button" data-val="compact">Compact</button></div></div>
        <div class="sb-poprow"><label>Mode</label><div class="sb-seg sm" data-field="mode"><button type="button" data-val="">Set</button><button type="button" data-val="light">Light</button><button type="button" data-val="dark">Dark</button></div></div>
        <div class="sb-poprow"><label>Nav icons</label><div class="sb-seg sm" data-field="navicons"><button type="button" data-val="">Set</button><button type="button" data-val="on">On</button><button type="button" data-val="off">Off</button></div></div>
        <div class="sb-poprow"><label>Color <span class="sb-popval" data-for="palette"></span></label><div class="sb-dots" data-field="palette"><button type="button" data-val="" title="Same as the set"><i class="set"></i></button>${paletteOptions.map(p => `<button type="button" data-val="${p.id}" title="${p.name}"><i style="--p:${p.light[0]};--s:${p.light[1]};--t:${p.light[2]}"></i></button>`).join('')}</div></div>
        <div class="sb-poprow"><label>Font</label><select class="sb-select sm" data-field="font" aria-label="Font for this screen"><option value="">Set</option>${fontOptions.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
      </fieldset>
      <div class="sb-poprow"><label>Note <span class="sb-popval sb-notesaved" hidden>saved</span></label><textarea class="sb-note" rows="2" placeholder="Notes on this screen…" aria-label="Note for this screen"></textarea></div>
      <div class="sb-popfoot"><button type="button" class="sb-btn sb-popreset">Use the set values</button><button type="button" class="sb-btn sb-popcompare" title="Compare this screen with another — or with itself in a second look">Compare…</button><span class="sb-popflag" hidden>Overridden</span><span class="sb-popflag lock" hidden>Locked</span><span class="sb-pophint">Changes here affect only this screen.</span></div>
    </div>`;

  // The notes panel: general meeting notes, every per-screen note, and the two-step clear.
  const notesPanel = `
    <div class="sb-notes" hidden>
      <div class="sb-pophead"><div class="sb-popid"><b class="sb-popname">Meeting notes</b><span class="sb-popset sb-notes-sync">Saved in this browser</span></div><button type="button" class="sb-popclose sb-notesclose" title="Close" aria-label="Close">✕</button></div>
      <div class="sb-poprow"><label>General</label><textarea class="sb-general" rows="3" placeholder="Requests, preferences, anything not about one screen…" aria-label="General meeting notes"></textarea></div>
      <div class="sb-poprow"><label>Per screen</label><ul class="sb-notelist"></ul></div>
      <div class="sb-popfoot"><button type="button" class="sb-btn sb-clearnotes" data-armed="0">Clear notes</button><span class="sb-pophint">Locks and overrides are not affected.</span></div>
    </div>`;


  // The compare view: two cloned panes side by side, each with its own look, over the canvas.
  const paneControls = (i) => `
      <div class="sb-panebar" data-pane="${i}">
        <div class="sb-paneid"><span class="sb-badge"></span><b class="sb-panename"></b></div>
        <div class="sb-seg sm" data-pfield="density"><button type="button" data-val="comfortable">Comfortable</button><button type="button" data-val="compact">Compact</button></div>
        <div class="sb-seg sm" data-pfield="mode"><button type="button" data-val="light">Light</button><button type="button" data-val="dark">Dark</button></div>
        <div class="sb-seg sm" data-pfield="navicons"><button type="button" data-val="on">Icons</button><button type="button" data-val="off">No icons</button></div>
        <select class="sb-select sm" data-pfield="palette" aria-label="Color for this pane">${paletteOptions.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        <select class="sb-select sm" data-pfield="font" aria-label="Font for this pane">${fontOptions.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>
        <button type="button" class="sb-btn sb-panesave" title="Save this look to the screen as its overrides">Save to screen</button>
        <button type="button" class="sb-lockbtn sb-panelock" title="Lock this screen with the look shown in this pane"><span class="lock-ic">${LOCK_SVG}</span></button>
        <button type="button" class="sb-btn sb-panefocus" title="Show only this pane (space cycles)">Focus</button>
      </div>`;
  const compareView = `
    <div class="sb-compare" hidden>
      <div class="sb-comparehead">
        <b>Compare</b><span class="sb-comparehint">Each side has its own look · <b>Save to screen</b> keeps a side's look as that screen's overrides · space cycles focus</span>
        <div class="sb-cmpconfirm" hidden><span class="sb-cmpconfirmtext"></span><span class="sb-cmpconfirmbtns"></span></div>
        <button type="button" class="sb-btn sb-cmpswap" title="Swap sides">Swap</button>
        <button type="button" class="sb-btn primary sb-cmpdone" title="Done (Esc)">Done</button>
      </div>
      <div class="sb-panes">
        <section class="sb-pane" data-pane="0">${paneControls(0)}<div class="sb-panebody"><div class="sb-panestage"></div></div><div class="sb-panenote"><label>Note</label><textarea class="sb-note sb-pnote" rows="2" placeholder="Notes on this screen…"></textarea></div></section>
        <section class="sb-pane" data-pane="1">${paneControls(1)}<div class="sb-panebody"><div class="sb-panestage"></div></div><div class="sb-panenote"><label>Note</label><textarea class="sb-note sb-pnote" rows="2" placeholder="Notes on this screen…"></textarea></div></section>
      </div>
      <div class="sb-sharednote" hidden><label>Note — same screen on both sides</label><textarea class="sb-note sb-pnote" rows="2" placeholder="Notes on this screen…"></textarea></div>
    </div>`;

  // Choose mode: the banner over the canvas while the rep picks the two sides.
  const chooseBanner = `
    <div class="sb-choose" hidden>
      <b>Compare</b><span class="sb-choosetext"></span>
      <button type="button" class="sb-btn sb-choosecancel" title="Cancel (Esc)">Cancel</button>
    </div>`;

  const css = `
html, body { margin: 0; height: 100%; background: #E9EAEE; overflow: hidden; }
/* the page's own chrome is neutral in both themes so the screens are the only color on it; light is the default, the moon button flips it */
.sb { position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr; font-family: var(--ui-font); font-size: 14px; color-scheme: light;
  --ui-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --ui-focus: var(--ui-accent);
  --ui-bg: #E9EAEE; --ui-dot: #D3D6DC; --ui-panel: #FFFFFF; --ui-panel-2: #EEF0F3; --ui-raised: #FFFFFF; --ui-border: #D7DAE0; --ui-border-strong: #C5C9D1;
  --ui-text: #1F2329; --ui-muted: #5F6672; --ui-accent: #1F2329; --ui-accent-hover: #000; --ui-on-accent: #FFFFFF;
  --ui-warn: #8A5A00; --ui-warn-bg: #FFF6E8; --ui-warn-border: #F0D9B0;
  --ui-lock: #1E7A4C; --ui-lock-bg: #E8F6EE; --ui-lock-border: #B7E0C8; --ui-on-lock: #FFFFFF;
  --ui-shadow: 0 2px 6px rgba(0,0,0,.10), 0 30px 80px -20px rgba(0,0,0,.28); --ui-shadow-card: 0 14px 40px -10px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.08); --ui-shadow-sm: 0 1px 2px rgba(0,0,0,.10);
  color: var(--ui-text); background: var(--ui-bg); }
.sb.dark { color-scheme: dark;
  --ui-bg: #0F1114; --ui-dot: #22262D; --ui-panel: #181B21; --ui-panel-2: #1F232B; --ui-raised: #2A2F39; --ui-border: #2C313B; --ui-border-strong: #4A5160;
  --ui-text: #ECEEF2; --ui-muted: #9AA3B2; --ui-accent: #F5F6F8; --ui-accent-hover: #FFFFFF; --ui-on-accent: #0F1114;
  --ui-warn: #F2B65A; --ui-warn-bg: rgba(242,182,90,.14); --ui-warn-border: rgba(242,182,90,.45);
  --ui-lock: #4ADE80; --ui-lock-bg: rgba(74,222,128,.14); --ui-lock-border: rgba(74,222,128,.45); --ui-on-lock: #0F1114;
  --ui-shadow: 0 2px 6px rgba(0,0,0,.35), 0 30px 80px -20px rgba(0,0,0,.6); --ui-shadow-card: 0 18px 50px -10px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4); --ui-shadow-sm: 0 1px 2px rgba(0,0,0,.4); }
.sb *, .sb *::before, .sb *::after { box-sizing: border-box; }
.sb button, .sb select, .sb textarea { font: inherit; }

/* ---- master bar ---- */
.sb-bar { display: flex; flex-direction: column; gap: 8px; padding: 10px 18px 12px; background: var(--ui-panel); border-bottom: 1px solid var(--ui-border); z-index: 20; }
.sb-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.sb-row.title { justify-content: space-between; gap: 12px; padding-bottom: 9px; margin-bottom: 2px; border-bottom: 1px solid var(--ui-border); }   /* interface controls above the line, mockup settings below it */
.sb-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sb-right { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.sb-vsep { width: 1px; height: 22px; background: var(--ui-border-strong); margin: 0 6px; }
.sb-btn.sb-tool { display: inline-flex; align-items: center; gap: 7px; padding: 0 11px 0 9px; }
.sb-btn.sb-tool svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sb-btn.sb-tool b { font-weight: 600; }
.sb-btn.sb-tool.on { border-color: var(--ui-accent); background: var(--ui-accent); color: var(--ui-on-accent); }
.sb-btn.sb-tool.on .sb-count { background: var(--ui-on-accent); color: var(--ui-accent); }
.sb-btn.sb-tool .sb-count { margin-left: 2px; }
.sb-theme { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--ui-border); background: var(--ui-panel); color: var(--ui-text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.sb-theme:hover { border-color: var(--ui-accent); }
.sb-theme svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sb-theme .sun { display: none; } .sb.dark .sb-theme .sun { display: block; } .sb.dark .sb-theme .moon { display: none; }
.sb-title { font-weight: 800; font-size: 17px; letter-spacing: -.01em; margin-right: 6px; white-space: nowrap; color: var(--ui-text); }
.sb-group { display: inline-flex; align-items: center; gap: 8px; }
.sb-group > label { color: var(--ui-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.sb-seg { display: inline-flex; background: var(--ui-panel-2); border: 1px solid var(--ui-border); border-radius: 9px; padding: 3px; gap: 2px; }
.sb-seg button { height: 30px; padding: 0 14px; border: 0; border-radius: 6px; background: transparent; color: var(--ui-muted); font-weight: 600; font-size: 13.5px; cursor: pointer; }
.sb-seg button:hover { color: var(--ui-text); }
.sb-seg button.on { background: var(--ui-raised); color: var(--ui-text); box-shadow: var(--ui-shadow-sm); }
.sb-swatches { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.sb-applybrand { margin-left: auto; }
.sb-swatch { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 10px 0 6px; border-radius: 8px; border: 1.5px solid transparent; background: transparent; cursor: pointer; font-weight: 600; font-size: 12.5px; color: var(--ui-text); white-space: nowrap; }
.sb-swatch i { width: 16px; height: 16px; border-radius: 50%; background: conic-gradient(var(--p) 0 60%, var(--s) 60% 85%, var(--t) 85%); flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.sb-swatch:hover { background: var(--ui-panel-2); }
.sb-swatch.on { border-color: var(--ui-accent); background: var(--ui-panel-2); }
.sb-select { height: 38px; border-radius: 8px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel-2); padding: 0 10px; font-size: 13.5px; font-weight: 600; color: var(--ui-text); cursor: pointer; }
.sb-select:hover { border-color: var(--ui-accent); }
.sb-btn { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel-2); color: var(--ui-text); font-weight: 600; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
.sb-btn:hover { border-color: var(--ui-accent); }
.sb-btn.primary { background: var(--ui-accent); border-color: var(--ui-accent); color: var(--ui-on-accent); }
.sb-btn.primary:hover { background: var(--ui-accent-hover); border-color: var(--ui-accent-hover); }
.sb-btn .sb-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 6px; border-radius: 9px; background: var(--ui-accent); color: var(--ui-on-accent); font-size: 11px; font-weight: 700; }
.sb-btn .sb-count:empty { display: none; }
.sb-zoom { display: inline-flex; align-items: center; gap: 2px; background: var(--ui-panel-2); border: 1px solid var(--ui-border); border-radius: 9px; padding: 3px; }
.sb-zoom button { height: 30px; min-width: 30px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: var(--ui-text); font-weight: 600; font-size: 13.5px; cursor: pointer; }   /* 30 + 3px padding ×2 + border = the 38px of the segmented controls */
.sb-zoom button:hover { background: var(--ui-raised); }
.sb-zoom .pct { min-width: 52px; text-align: center; color: var(--ui-muted); font-variant-numeric: tabular-nums; }

/* ---- workspace: the canvas ---- */
.sb-work { position: relative; display: grid; grid-template-columns: 1fr; min-height: 0; }
.sb-viewport { position: relative; overflow: hidden; cursor: grab; background: var(--ui-bg); background-image: radial-gradient(var(--ui-dot) 1px, transparent 1px); background-size: 24px 24px; }
.sb-viewport.dragging { cursor: grabbing; }
.sb-screen[hidden] { display: none; }
.sb-stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; will-change: transform; }
.sb-screen { position: absolute; box-shadow: var(--ui-shadow); border-radius: 6px; overflow: hidden; background: #fff; }
/* never restyle .screen itself here — theme.css owns its display (grid/flex shells) */
.sb-screen.is-active { outline: 14px solid var(--ui-accent); outline-offset: 16px; }
.sb-screen.is-locked { outline: 14px solid var(--ui-lock); outline-offset: 16px; }
.sb-screen.is-locked.is-active { outline-color: var(--ui-lock); box-shadow: var(--ui-shadow), 0 0 0 44px var(--ui-lock-border); }
.sb-rowtitle { position: absolute; transform: translateY(-100%); display: flex; align-items: baseline; gap: 12px; padding-bottom: 6px; white-space: nowrap; pointer-events: none; }
.sb-rowtitle b { font-size: 22px; font-weight: 800; letter-spacing: -.01em; color: var(--ui-text); }
.sb-rowtitle span { font-size: 13px; font-weight: 500; color: var(--ui-muted); }

/* overlays — fixed-size, positioned by script, never scaled */
.sb-overlays { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sb-ov { position: absolute; display: flex; align-items: center; gap: 6px; pointer-events: auto; transform: translateY(-100%); padding-bottom: 8px; white-space: nowrap; }
.sb-ov.is-overridden .sb-badge { box-shadow: 0 0 0 2px var(--ui-panel), 0 0 0 4px var(--ui-warn); }
.sb-pick { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 6px; border-radius: 8px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel); font-weight: 600; font-size: 13px; color: var(--ui-text); cursor: pointer; box-shadow: var(--ui-shadow-sm); }
.sb-pick.only-badge { padding-right: 6px; }
.sb-pick:hover { border-color: var(--ui-accent); }
.sb-ov.is-active .sb-pick { background: var(--ui-accent); color: var(--ui-on-accent); border-color: var(--ui-accent); }
.sb-ov.is-active .sb-badge { background: var(--ui-on-accent); color: var(--ui-accent); }
.sb-badge { width: 24px; height: 24px; border-radius: 6px; background: var(--ui-accent); color: var(--ui-on-accent); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: none; }
.sb-badge.wide { width: auto; padding: 0 7px; }
.sb-pname { color: inherit; opacity: .8; font-weight: 500; }
.sb-ov .sb-lockbtn { height: 34px; width: 34px; padding: 0; }
.sb-ov.is-mini .sb-pick { height: 26px; font-size: 11.5px; padding: 0 8px 0 4px; }
.sb-ov.is-mini .sb-badge { width: 18px; height: 18px; font-size: 10px; }
.sb-ov.is-mini .sb-lockbtn { height: 26px; width: 26px; }
.sb-ov.is-mini .sb-pick { padding: 0 4px; }
.sb-ov.is-mini .sb-lockbtn svg { width: 13px; height: 13px; }
.sb-notedot { width: 10px; height: 10px; border-radius: 50%; background: var(--ui-accent); border: 2px solid var(--ui-panel); box-shadow: var(--ui-shadow-sm); flex: none; }
.sb-notedot[hidden] { display: none; }
/* the lock button — open padlock until locked, then a filled green one */
.sb-lockbtn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel-2); color: var(--ui-text); font-size: 12.5px; font-weight: 600; cursor: pointer; flex: none; }
.sb-lockbtn:hover { border-color: var(--ui-lock); color: var(--ui-lock); }
.sb-lockbtn svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sb-lockbtn .lock-closed { display: none; } .sb-lockbtn.on .lock-closed { display: block; } .sb-lockbtn.on .lock-open { display: none; }
.sb-lockbtn.on { background: var(--ui-lock); border-color: var(--ui-lock); color: var(--ui-on-lock); }
.sb-lockbtn.on:hover { color: var(--ui-on-lock); filter: brightness(1.08); }
.lock-ic { display: inline-flex; }

/* per-unit card and the notes panel — top right, only one open at a time */
.sb-pop, .sb-notes { position: absolute; top: 14px; right: 14px; width: 320px; background: var(--ui-panel); border: 1px solid var(--ui-border-strong); border-radius: 14px; box-shadow: var(--ui-shadow-card); padding: 12px 14px 14px; z-index: 15; display: flex; flex-direction: column; gap: 12px; }
.sb-pop[hidden], .sb-notes[hidden] { display: none; }
.sb-notes { width: 360px; max-height: calc(100% - 28px); overflow: auto; }
.sb-pophead { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--ui-border); }
.sb-pophead .sb-badge { width: 26px; height: 26px; }
.sb-pophead .sb-poplock { width: 32px; padding: 0; }
.sb-popid { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.sb-popname { font-weight: 800; font-size: 13.5px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sb-popset { font-size: 11.5px; color: var(--ui-muted); white-space: nowrap; }
.sb-popflag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ui-warn); background: var(--ui-warn-bg); border: 1px solid var(--ui-warn-border); border-radius: 6px; padding: 2px 6px; white-space: nowrap; }
.sb-popflag.lock { color: var(--ui-lock); background: var(--ui-lock-bg); border-color: var(--ui-lock-border); }
.sb-popzoom, .sb-popclose { height: 28px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel-2); color: var(--ui-text); font-size: 12.5px; font-weight: 600; cursor: pointer; flex: none; }
.sb-popclose { width: 28px; padding: 0; }
.sb-popzoom:hover, .sb-popclose:hover { border-color: var(--ui-accent); }
.sb-popcontrols { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; min-width: 0; }
.sb-popcontrols:disabled { opacity: .5; }
.sb-popcontrols:disabled * { cursor: default !important; }
.sb-poprow { display: flex; flex-direction: column; gap: 6px; }
.sb-poprow > label { display: flex; align-items: baseline; gap: 8px; color: var(--ui-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.sb-poprow > label .sb-popval { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 12px; color: var(--ui-text); }
.sb-poprow > label .sb-notesaved { margin-left: auto; color: var(--ui-muted); font-weight: 500; }
.sb-poprow .sb-seg.sm { width: 100%; }
.sb-seg.sm button { flex: 1; height: 28px; padding: 0 8px; font-size: 13px; }
.sb-seg.sm button.on.is-ov { color: var(--ui-warn); }
.sb-select.sm { height: 32px; font-size: 13px; width: 100%; }
.sb-select.sm.is-ov { border-color: var(--ui-warn-border); color: var(--ui-warn); }
.sb-dots { display: flex; flex-wrap: wrap; gap: 6px; }
.sb-dots button { width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent; background: transparent; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.sb-dots button i { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--p) 0 60%, var(--s) 60% 85%, var(--t) 85%); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.sb-dots button i.set { background: repeating-linear-gradient(135deg, var(--ui-panel) 0 4px, var(--ui-border-strong) 4px 6px); }
.sb-dots button:hover { border-color: var(--ui-muted); }
.sb-dots button.on { border-color: var(--ui-accent); }
.sb-note, .sb-general { width: 100%; resize: vertical; min-height: 44px; border-radius: 8px; border: 1px solid var(--ui-border-strong); background: var(--ui-panel-2); color: var(--ui-text); padding: 8px 10px; font-size: 13px; line-height: 1.4; }
.sb-note:focus, .sb-general:focus { outline: none; border-color: var(--ui-accent); background: var(--ui-panel); }
.sb-note::placeholder, .sb-general::placeholder { color: var(--ui-muted); }
.sb-popfoot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 4px; flex-wrap: wrap; }
.sb-popfoot .sb-popflag { flex: none; }
.sb-popfoot .sb-btn { height: 30px; padding: 0 10px; font-size: 12.5px; }
.sb-popfoot .sb-btn:disabled { opacity: .45; cursor: default; border-color: var(--ui-border); }
.sb-popfoot .sb-btn[data-armed="1"] { border-color: var(--ui-warn); color: var(--ui-warn); background: var(--ui-warn-bg); }
.sb-pophint { font-size: 11.5px; color: var(--ui-muted); text-align: right; line-height: 1.3; }
.sb-notelist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sb-notelist li { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; line-height: 1.4; padding: 6px 8px; border-radius: 8px; background: var(--ui-panel-2); cursor: pointer; }
.sb-notelist li:hover { background: var(--ui-raised); box-shadow: var(--ui-shadow-sm); }
.sb-notelist li b { flex: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ui-muted); padding-top: 2px; }
.sb-notelist li span { white-space: pre-wrap; word-break: break-word; }
.sb-notelist li.empty { color: var(--ui-muted); cursor: default; background: transparent; padding-left: 0; }

/* compare view — covers the canvas below the bar; the master bar stays live above it */
.sb-compare { position: absolute; inset: 0; z-index: 18; background: var(--ui-bg); display: flex; flex-direction: column; }
.sb-compare[hidden] { display: none; }
.sb.comparing .sb-bar { display: none; }   /* the master bar steps aside while comparing — each pane has its own controls */
.sb.comparing { grid-template-rows: 1fr; }
.sb-comparehead { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--ui-border); background: var(--ui-panel); }
.sb-comparehead b { font-size: 14px; font-weight: 800; }
.sb-comparehint { color: var(--ui-muted); font-size: 12.5px; flex: 1; }
.sb-cmpswap { height: 30px; padding: 0 10px; font-size: 12.5px; }
.sb-panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; }
.sb-compare.focus-0 .sb-panes { grid-template-columns: 1fr 0fr; } .sb-compare.focus-1 .sb-panes { grid-template-columns: 0fr 1fr; }
.sb-compare.focus-0 .sb-pane[data-pane="1"], .sb-compare.focus-1 .sb-pane[data-pane="0"] { display: none; }
.sb-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--ui-panel); border: 1px solid var(--ui-border); border-radius: 12px; overflow: hidden; }
.sb-panebar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--ui-border); flex-wrap: wrap; }
.sb-paneid { display: inline-flex; align-items: center; gap: 8px; margin-right: 4px; min-width: 0; }
.sb-panename { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.sb-panebar .sb-seg.sm { width: auto; } .sb-panebar .sb-seg.sm button { flex: none; padding: 0 9px; font-size: 12px; height: 26px; }
.sb-panebar .sb-select.sm { width: auto; height: 30px; font-size: 12.5px; max-width: 200px; }
.sb-panebar .sb-lockbtn { height: 30px; width: 30px; padding: 0; }
.sb-panefocus { height: 30px; padding: 0 10px; font-size: 12.5px; margin-left: auto; }
.sb-panebody { flex: 1; min-height: 0; position: relative; overflow: hidden; background: var(--ui-bg); background-image: radial-gradient(var(--ui-dot) 1px, transparent 1px); background-size: 24px 24px; }
.sb-panestage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.sb-panestage .sb-clone { position: absolute; box-shadow: var(--ui-shadow); border-radius: 6px; overflow: hidden; background: #fff; }
.sb-panestage .sb-clone.is-locked { outline: 14px solid var(--ui-lock); outline-offset: 16px; }
.sb-panenote, .sb-sharednote { padding: 8px 10px 10px; border-top: 1px solid var(--ui-border); display: flex; flex-direction: column; gap: 4px; background: var(--ui-panel); }
.sb-panenote > label, .sb-sharednote > label { color: var(--ui-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.sb-sharednote { margin: 0 12px 12px; border: 1px solid var(--ui-border); border-radius: 12px; }
.sb-sharednote[hidden] { display: none; }
.sb-compare.shared .sb-panenote { display: none; }
.sb-comparehead .sb-cmpdone { border-color: var(--ui-accent); background: var(--ui-accent); color: var(--ui-on-accent); }
.sb-panesave { height: 30px; padding: 0 10px; font-size: 12.5px; }
.sb-pane.is-dirty .sb-panesave { border-color: var(--ui-accent); background: var(--ui-accent); color: var(--ui-on-accent); }
.sb-pane.is-dirty .sb-panesave::after { content: " ●"; }
.sb-pane:not(.is-dirty) .sb-panesave { color: var(--ui-muted); }
.sb-cmpconfirm { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 9px; background: var(--ui-panel-2); border: 1px solid var(--ui-warn); font-size: 12.5px; flex: 1; }
.sb-cmpconfirm[hidden] { display: none; }
.sb-comparehead:has(.sb-cmpconfirm:not([hidden])) .sb-comparehint { display: none; }
.sb-cmpconfirmtext { flex: 1; font-weight: 600; }
.sb-cmpconfirmbtns { display: inline-flex; gap: 6px; }
.sb-cmpconfirmbtns .sb-btn { height: 28px; padding: 0 10px; font-size: 12.5px; }
/* choose mode: a banner over the canvas; the screens become the click targets */
.sb-choose { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 17; display: flex; align-items: center; gap: 12px; padding: 8px 10px 8px 16px; background: var(--ui-panel); border: 1px solid var(--ui-accent); border-radius: 12px; box-shadow: var(--ui-shadow); font-size: 13.5px; white-space: nowrap; color: var(--ui-text); }
.sb-choose[hidden] { display: none; }
.sb-choose > b { font-weight: 800; }
.sb-choosetext b { font-weight: 700; }
.sb-choose .sb-choosecancel { height: 30px; padding: 0 10px; font-size: 12.5px; }
.sb.choosing .sb-viewport { cursor: pointer; }
.sb.choosing .sb-screen:hover, .sb.choosing .sb-screen.is-choice { outline: 14px solid var(--ui-accent); outline-offset: 16px; }
.sb-choicechip { display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 12px; border-radius: 8px; background: var(--ui-accent); color: var(--ui-on-accent); font-size: 12.5px; font-weight: 800; box-shadow: var(--ui-shadow-sm); }
.sb-choicechip[hidden] { display: none; }
.sb-ov.is-mini .sb-choicechip { height: 26px; padding: 0 8px; font-size: 11px; }
.sb-toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: min(720px, 90vw); text-align: center; line-height: 1.4; background: var(--ui-accent); color: var(--ui-on-accent); padding: 10px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600; box-shadow: var(--ui-shadow-card); opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 40; }
.sb-toast.show { opacity: 1; }
/* export modal */
.sb-exportmodal { position: fixed; inset: 0; z-index: 35; background: rgba(15,17,20,.45); display: flex; align-items: center; justify-content: center; padding: 24px; }
.sb-exportmodal[hidden] { display: none; }
.sb-exportbox { width: min(560px, 100%); background: var(--ui-panel); border: 1px solid var(--ui-border-strong); border-radius: 14px; box-shadow: var(--ui-shadow-card); padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; }
.sb-exporthead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sb-exporthead b { font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
.sb-exporthead .sb-exportcancel { width: 30px; height: 30px; padding: 0; }
.sb-exportcount { margin: 0; font-size: 13px; color: var(--ui-muted); }
.sb-exportopts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sb-exportopts button { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 14px; border: 1px solid var(--ui-border-strong); border-radius: 12px; background: var(--ui-panel-2); color: var(--ui-text); cursor: pointer; transition: border-color .15s, background-color .15s; }
.sb-exportopts button:hover:not([disabled]) { border-color: var(--ui-accent); background: var(--ui-panel); }
.sb-exportopts button[disabled] { opacity: .5; cursor: not-allowed; }
.sb-exportopts button b { font-size: 14px; font-weight: 700; }
.sb-exportopts button span { font-size: 12.5px; color: var(--ui-muted); line-height: 1.45; }
/* embedded build only (the host styles the chrome through the --ui-* tokens) */
.sb.embedded :focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.sb.embedded .sb-note:focus, .sb.embedded .sb-general:focus { border-color: var(--ui-focus); }
.sb.embedded .sb-lockchip { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: var(--ui-lock); color: var(--ui-on-lock); font-size: 11.5px; font-weight: 700; }
.sb.embedded .sb-lockchip:empty { display: none; }
.sb.embedded .sb-roflag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ui-warn); background: var(--ui-warn-bg); border: 1px solid var(--ui-warn-border); border-radius: 6px; padding: 2px 6px; white-space: nowrap; }
.sb.embedded .sb-roflag[hidden] { display: none; }
.sb.embedded.readonly .sb-ov .sb-lockbtn, .sb.embedded.readonly .sb-poplock { display: none; }
.sb.embedded.readonly .sb-bar button:disabled, .sb.embedded.readonly .sb-bar select:disabled, .sb.embedded.readonly .sb-panebar button:disabled { opacity: .45; cursor: default; }
`;

  const js = `
const PALETTES = ${JSON.stringify(paletteOptions.map(p => ({ id: p.id, name: p.name, light: p.light, dark: p.dark })))};
const FONTS = ${JSON.stringify(fontOptions.map(f => ({ id: f.id, name: f.name, head: f.head, body: f.body })))};
const FB_HEAD = ${JSON.stringify(FALLBACK_HEAD)}, FB_BODY = ${JSON.stringify(FALLBACK_BODY)};
const LAYOUT = ${JSON.stringify(layout)};
const UNITS = ${JSON.stringify(units)};
const SETS = ${JSON.stringify(SETS.map(s => ({ key: s.key, title: s.title, y: s._rowY - LABEL_H, h: s._rowH + LABEL_H, w: s._rowW })))};
const STAGE = { w: ${STAGE_W}, h: ${STAGE_H}, pad: ${PAD}, gap: ${GAP}, pairGap: ${PAIR_GAP}, rowGap: ${ROW_GAP}, labelH: ${LABEL_H} };
const CLIENT = ${JSON.stringify(CLIENT)};
const FONTS_HREF = ${JSON.stringify(googleHref)};
const BRAND = ${JSON.stringify(brand ? { name: brand.name, colors: brand.light || null, colorsDark: brand.dark || null, borrowedFrom: brand.borrowedFrom || null, font: brand.font ? brand.font.name : null, logo: brand.logo ? brand.logo.file : null, report: report.map(r => (r.pass ? 'PASS ' : 'FAIL ') + r.ratio.toFixed(2) + ':1 ' + r.label) } : null)};
// Embedded build (a host page frames this one): state comes and goes over the bridge, never browser storage.
// Read-only until the host's first init; with no parent at all it stays read-only and never posts.
const EMBEDDED = ${embedded ? 'true' : 'false'};
const HAS_PARENT = EMBEDDED && window.parent !== window;
let READ_ONLY = EMBEDDED, hostOrigin = null;
const DENSITIES = ['comfortable', 'compact'], MODES = ['light', 'dark'], FIELDS = ['density', 'palette', 'font', 'mode', 'navicons'];
const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => Date.now();
const unitOf = (id) => UNITS.find(u => u.id === id);
const screensOf = (uid) => LAYOUT.filter(l => l.unit === uid);
const live = (m) => !!(m && !m._del);   // a map entry that is not a tombstone (boolean — classList.toggle treats undefined as "flip")

// ---------- meeting state ----------
// bar: the master values. ov: per-unit overrides. locks: per-unit captured looks (the picks).
// notes: per-unit text. general: meeting-wide text. Every entry carries \`at\` so two copies of the
// state (this browser, the page's database) merge newest-wins; removed entries stay as tombstones.
const state = {
  bar: { density: 'comfortable', palette: ${JSON.stringify(defaultPalette)}, font: ${JSON.stringify(defaultFont)}, mode: 'light', navicons: 'on', at: 0 },
  ov: {}, locks: {}, notes: {}, general: { text: '', at: 0 },
  active: null, panel: null,   // UI only, never stored
  compare: { pins: [], open: false, choosing: false, confirm: false, focus: null, pov: [{}, {}] },   // compare view: chosen unit ids, per-pane look overrides (UI only, never saved)
};
const DEFAULT_BAR = { ...state.bar };
const view = { x: 0, y: 0, s: 0.2 };
const viewport = $('.sb-viewport'), stage = $('.sb-stage'), overlays = $('.sb-overlays'), pop = $('.sb-pop'), notesPanel = $('.sb-notes');

const clean = (o) => { if (!o) return {}; const c = { ...o }; delete c.at; delete c._del; return c; };
function isLocked(uid) { return live(state.locks[uid]); }
function overrides(uid) { return live(state.ov[uid]) ? clean(state.ov[uid]) : {}; }
function effective(uid) {
  if (isLocked(uid)) return clean(state.locks[uid]);
  return { navicons: 'on', ...clean(state.bar), ...overrides(uid) };
}
function setBar(field, val) { if (READ_ONLY) return; state.bar[field] = val; state.bar.at = now(); }
function setOverride(uid, field, val) {
  if (READ_ONLY || isLocked(uid)) return;
  const ov = overrides(uid);
  if (val) ov[field] = val; else delete ov[field];
  state.ov[uid] = Object.keys(ov).length ? { ...ov, at: now() } : { _del: true, at: now() };
}
function clearOverride(uid) { if (!READ_ONLY && !isLocked(uid)) state.ov[uid] = { _del: true, at: now() }; }
function lock(uid) { if (READ_ONLY) return; state.locks[uid] = { ...effective(uid), at: now() }; state.ov[uid] = { _del: true, at: now() }; }
function unlock(uid) {
  if (READ_ONLY) return;
  const captured = clean(state.locks[uid]), bar = clean(state.bar), ov = {};
  for (const f of FIELDS) if (captured[f] !== bar[f]) ov[f] = captured[f];     // the captured look stays, as an ordinary override
  state.locks[uid] = { _del: true, at: now() };
  state.ov[uid] = Object.keys(ov).length ? { ...ov, at: now() } : { _del: true, at: now() };
}
function setNote(uid, text) { if (READ_ONLY) return; state.notes[uid] = text.trim() ? { text, at: now() } : { _del: true, at: now() }; }
const noteOf = (uid) => (live(state.notes[uid]) ? state.notes[uid].text : '');
const lockedUnits = () => UNITS.filter(u => isLocked(u.id));

// ---------- persistence: this browser + the hosted page's database ----------
const STORE_KEY = 'sb-meeting:' + (CLIENT || 'sandbox');
const serialize = () => ({ v: 2, client: CLIENT, bar: state.bar, ov: state.ov, locks: state.locks, notes: state.notes, general: state.general, savedAt: new Date().toISOString() });
function mergeMap(local, remote) { for (const [k, v] of Object.entries(remote || {})) { if (!v || typeof v !== 'object') continue; if (!local[k] || (v.at || 0) > (local[k].at || 0)) local[k] = v; } }
function merge(remote) {
  if (!remote || remote.v !== 2) return false;
  const before = JSON.stringify(serialize());
  if (remote.bar && (remote.bar.at || 0) > (state.bar.at || 0)) state.bar = { ...state.bar, ...remote.bar };
  mergeMap(state.ov, remote.ov); mergeMap(state.locks, remote.locks); mergeMap(state.notes, remote.notes);
  if (remote.general && (remote.general.at || 0) > (state.general.at || 0)) state.general = remote.general;
  return JSON.stringify(serialize()) !== before;
}
let db = null, dbDoc = null, dbState = 'local';   // 'local' | 'syncing' | 'synced' | 'error'
function saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch {} }
let dbTimer = null;
function saveDb() {
  if (!dbDoc) return;
  clearTimeout(dbTimer);
  dbTimer = setTimeout(async () => { try { await dbDoc.set(serialize()); dbState = 'synced'; } catch (e) { dbState = 'error'; } paintSync(); }, 500);
}
function persist(reason) {
  if (READ_ONLY) return;
  if (EMBEDDED) return bridgePost({ type: 'design-sandbox:state', state: serialize(), reason });
  saveLocal(); saveDb();
}
// ---------- bridge v1 (embedded build only; see references/embedding.md) ----------
function bridgePost(msg) {
  if (!HAS_PARENT) return;
  const target = msg.type === 'design-sandbox:ready' || !hostOrigin || hostOrigin === 'null' ? '*' : hostOrigin;
  window.parent.postMessage({ ...msg, v: 1 }, target);
}
function replaceState(s) {
  const copy = (m) => (m && typeof m === 'object' ? JSON.parse(JSON.stringify(m)) : {});
  state.bar = { ...DEFAULT_BAR }; state.ov = {}; state.locks = {}; state.notes = {}; state.general = { text: '', at: 0 };
  if (!s || s.v !== 2) return;
  if (s.bar && typeof s.bar === 'object') state.bar = { ...DEFAULT_BAR, ...copy(s.bar) };
  state.ov = copy(s.ov); state.locks = copy(s.locks); state.notes = copy(s.notes);
  if (s.general && typeof s.general === 'object') state.general = { text: '', at: 0, ...copy(s.general) };
}
function applyHostTheme(t) {
  const sb = $('.sb'); if (!t || typeof t !== 'object') return;
  for (const k of [...sb.style]) if (k.startsWith('--ui-')) sb.style.removeProperty(k);   // a token set is a full set: drop the previous one
  const tokens = t.tokens && typeof t.tokens === 'object' ? t.tokens : {};
  for (const [k, v] of Object.entries(tokens)) if (/^--ui-[a-z0-9-]+$/.test(k) && typeof v === 'string') sb.style.setProperty(k, v);
  if (t.fonts && typeof t.fonts.ui === 'string') sb.style.setProperty('--ui-font', t.fonts.ui);
  sb.classList.toggle('dark', !!t.dark); sb.style.colorScheme = t.dark ? 'dark' : 'light';
}
function onBridge(e) {
  if (window.parent === window || e.source !== window.parent) return;
  const m = e.data; if (!m || typeof m !== 'object' || m.v !== 1) return;
  if (m.type !== 'design-sandbox:init' && m.type !== 'design-sandbox:theme') return;
  if (hostOrigin === null) hostOrigin = e.origin;
  clearTimeout(noteTimer);
  if (m.type === 'design-sandbox:theme') return applyHostTheme(m.theme);
  const ae = document.activeElement; if (ae && ae.matches && ae.matches('textarea')) ae.blur();
  replaceState(m.state); READ_ONLY = !!m.readOnly;
  if (m.theme) applyHostTheme(m.theme);
  paint();
}
function loadLocal() { try { const raw = localStorage.getItem(STORE_KEY); if (raw) merge(JSON.parse(raw)); } catch {} }
// The database: ask once at load (so no prompt appears in front of a client), then subscribe live.
async function connectDb() {
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    const perms = await window.claude.use('permissions');
    if (perms && typeof perms.request === 'function') { const st = await perms.request(['db']); if (st && st.db && st.db !== 'granted') return; }
    db = await window.claude.use('db'); if (!db) return;
    dbDoc = db.doc('meeting/state'); dbState = 'syncing'; paintSync();
    const snap = await dbDoc.get();
    if (snap.exists) { if (merge(snap.data())) { saveLocal(); paint(); } }
    await dbDoc.set(serialize()); dbState = 'synced'; paintSync();
    dbDoc.onSnapshot((s) => { if (!s.exists || s.metadata.hasPendingWrites) return; if (merge(s.data())) { saveLocal(); paint(); } }, () => { dbState = 'error'; paintSync(); });
  } catch (e) { dbState = 'error'; paintSync(); }
}
function paintSync() {
  const el = $('.sb-notes-sync'); if (!el) return;
  el.textContent = EMBEDDED ? 'Saved to the host' : dbState === 'synced' ? 'Saved in this browser and on this page' : dbState === 'syncing' ? 'Saving to this page…' : dbState === 'error' ? 'Saved in this browser (page database unavailable)' : 'Saved in this browser';
}

// ---------- theme ----------
function paint() {
  $$('.sb-bar [data-density]').forEach(b => b.classList.toggle('on', b.dataset.density === state.bar.density));
  $$('.sb-bar [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === state.bar.mode));
  $$('.sb-bar [data-navicons]').forEach(b => b.classList.toggle('on', b.dataset.navicons === (state.bar.navicons || 'on')));
  $$('.sb-bar .sb-swatch').forEach(b => b.classList.toggle('on', b.dataset.palette === state.bar.palette));
  $('.sb-bar [data-font]').value = state.bar.font;
  for (const l of LAYOUT) {
    const eff = effective(l.unit), locked = isLocked(l.unit), ov = overrides(l.unit);
    const pal = PALETTES.find(p => p.id === eff.palette) || PALETTES[0], font = FONTS.find(f => f.id === eff.font) || FONTS[0];
    const wrap = $('.sb-screen[data-id="' + l.id + '"]'), sc = wrap.querySelector(':scope > .screen');
    sc.dataset.mode = eff.mode; sc.dataset.density = eff.density; sc.dataset.palette = pal.id; sc.dataset.navicons = eff.navicons || 'on';
    sc.style.setProperty('--font-head', font.head + ', ' + FB_HEAD); sc.style.setProperty('--font-body', font.body + ', ' + FB_BODY);
    wrap.classList.toggle('is-active', state.active === l.unit); wrap.classList.toggle('is-locked', locked);
    const root = $('.sb-ov[data-id="' + l.id + '"]');
    if (root) {
      root.classList.toggle('is-active', state.active === l.unit); root.classList.toggle('is-overridden', !locked && Object.keys(ov).length > 0); root.classList.toggle('is-locked', locked);
      const lb = $('.sb-lockbtn', root); if (lb) { lb.classList.toggle('on', locked); lb.title = locked ? 'Unlock (the look stays as an override)' : "Lock this screen's look — it stops following the bar"; }
      const nd = $('.sb-notedot', root); if (nd) nd.hidden = !noteOf(l.unit);
    }
  }
  const n = lockedUnits().length, lc = $('.sb-lockcount'); if (lc) lc.textContent = n ? String(n) : '';
  paintPop(); paintNotes(); paintCompare(); paintReadOnly();
}
// read-only (embedded only): every editing control disabled, note fields readonly, padlocks hidden (CSS)
const RO_DISABLE = '.sb-bar [data-density], .sb-bar [data-mode], .sb-bar [data-navicons], .sb-bar .sb-swatch, .sb-bar select[data-font], .sb-applybrand, .sb-resetall';
const RO_ARIA = RO_DISABLE + ', .sb-popcontrols, .sb-popreset, .sb-clearnotes, .sb-panesave, .sb-panelock';
function paintReadOnly() {
  if (!EMBEDDED) return;
  const ro = READ_ONLY; $('.sb').classList.toggle('readonly', ro);
  const fl = $('.sb-roflag'); if (fl) fl.hidden = !ro;
  for (const el of $$(RO_DISABLE)) el.disabled = ro;
  for (const el of $$(RO_ARIA)) { if (ro) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); }
  for (const ta of $$('.sb-note, .sb-general')) ta.readOnly = ro;
}
// the per-unit card shows the active unit; "Set" positions mean "same as the bar"
function paintPop() {
  const u = state.active && unitOf(state.active);
  pop.hidden = !u || state.panel !== 'pop'; if (pop.hidden) return;
  const uid = u.id, locked = isLocked(uid), ov = overrides(uid), eff = effective(uid);
  const pal = PALETTES.find(p => p.id === eff.palette) || PALETTES[0], font = FONTS.find(f => f.id === eff.font) || FONTS[0];
  const badge = $('.sb-pophead .sb-badge', pop); badge.textContent = u.label; badge.classList.add('wide');
  $('.sb-popname', pop).textContent = u.name; $('.sb-popset', pop).textContent = u.setTitle + ' · ' + (u.role === 'mobile' ? 'mobile' : 'desktop');
  const lb = $('.sb-poplock', pop); lb.classList.toggle('on', locked); lb.setAttribute('aria-label', locked ? 'Unlock' : 'Lock'); lb.title = locked ? 'Unlock (L) — the look stays as an override' : "Lock this screen's look (L)";
  $('.sb-popcontrols', pop).disabled = locked || READ_ONLY;
  const overridden = !locked && Object.keys(ov).length > 0;
  $('.sb-popflag:not(.lock)', pop).hidden = !overridden; $('.sb-popflag.lock', pop).hidden = !locked; $('.sb-popreset', pop).disabled = !overridden || READ_ONLY;
  const hint = $('.sb-pophint', pop); hint.hidden = overridden; hint.textContent = locked ? 'Locked in — unlock to change.' : 'Changes here affect only this screen.';
  for (const field of ['density', 'mode', 'navicons', 'palette']) {
    const cur = locked ? (eff[field] || (field === 'navicons' ? 'on' : '')) : (ov[field] !== undefined ? ov[field] : '');
    $$('[data-field="' + field + '"] button', pop).forEach(b => { b.classList.toggle('on', b.dataset.val === cur); b.classList.toggle('is-ov', !locked && cur !== '' && b.dataset.val === cur); });
  }
  $('.sb-popval[data-for="palette"]', pop).textContent = (locked || ov.palette !== undefined ? '' : 'Set · ') + pal.name;
  const fs = $('[data-field="font"]', pop); fs.value = locked ? eff.font : (ov.font !== undefined ? ov.font : ''); fs.classList.toggle('is-ov', !locked && ov.font !== undefined);
  fs.options[0].textContent = 'Set · ' + font.name;
  const ta = $('.sb-note', pop); if (ta.dataset.unit !== uid) { ta.value = noteOf(uid); ta.dataset.unit = uid; } else if (document.activeElement !== ta) ta.value = noteOf(uid);
}
function paintNotes() {
  notesPanel.hidden = state.panel !== 'notes'; if (notesPanel.hidden) return;
  const ga = $('.sb-general', notesPanel); if (document.activeElement !== ga) ga.value = state.general.text || '';
  const list = $('.sb-notelist', notesPanel); const items = UNITS.filter(u => noteOf(u.id));
  list.innerHTML = items.length ? items.map(u => '<li data-unit="' + u.id + '" title="Open this screen"><b>' + esc(shortTitle(u)) + '</b><span>' + esc(noteOf(u.id)) + '</span></li>').join('') : '<li class="empty">No per-screen notes yet — click a screen and type in its card.</li>';
  const cb = $('.sb-clearnotes', notesPanel); const any = items.length || (state.general.text || '').trim(); cb.disabled = !any || READ_ONLY; if (!any) { cb.dataset.armed = '0'; cb.textContent = 'Clear notes'; }
  paintSync();
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- canvas ----------
function apply() {
  stage.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
  $('.sb-zoom .pct').textContent = Math.round(view.s * 100) + '%';
  for (const s of SETS) {
    const t = $('.sb-rowtitle[data-row="' + s.key + '"]'); if (!t) continue;
    const sx = view.x + STAGE.pad * view.s, sy = view.y + (s.y + ${LABEL_H}) * view.s - 50;
    t.style.left = sx + 'px'; t.style.top = sy + 'px';
    t.style.display = (sy < 0 || sy > viewport.clientHeight) ? 'none' : 'flex';
  }
  for (const l of LAYOUT) {
    const ov = $('.sb-ov[data-id="' + l.id + '"]');
    const sx = view.x + l.x * view.s, sy = view.y + l.y * view.s, sw = l.w * view.s;
    ov.style.left = sx + 'px'; ov.style.top = sy + 'px';
    ov.style.display = (ov.classList.contains('is-hidden') || sx + Math.max(sw, 200) < 0 || sx > viewport.clientWidth || sy < 30 || sy - 60 > viewport.clientHeight) ? 'none' : 'flex';
  }
}
function fitRect(x, y, w, h, pad = 40) {
  const reserve = state.panel ? (state.panel === 'notes' ? 388 : 348) : 0; // keep the fitted area clear of an open card
  const vw = viewport.clientWidth - reserve - pad * 2, vh = viewport.clientHeight - pad * 2 - 44;
  view.s = Math.max(0.03, Math.min(2, Math.min(vw / w, vh / h)));
  view.x = (viewport.clientWidth - reserve - w * view.s) / 2 - x * view.s;
  view.y = (h * view.s < vh - 80 ? pad + 90 : (viewport.clientHeight - h * view.s) / 2 + 22) - y * view.s;
  apply();
}
function fitAll() { fitRect(0, 0, STAGE.w, STAGE.h, 24); }
// Show: all · desktop · mobile — which screens are on the canvas. Hidden screens keep their locks, notes and
// overrides; the visible ones re-flow so each row stays tight. Remembered per browser, never exported.
let show = 'all'; if (!EMBEDDED) try { show = localStorage.getItem('sb-show') || 'all'; } catch {}
const shown = (l) => show === 'all' || l.role === show;
function reflow() {
  let maxW = 0, y = STAGE.pad + STAGE.labelH;
  for (const s of SETS) {
    let x = STAGE.pad, rowH = 0; const row = LAYOUT.filter(l => l.set === s.key);
    for (let i = 0; i < row.length; i++) {
      const l = row[i]; if (!shown(l)) continue;
      l.x = x; l.y = y; rowH = Math.max(rowH, l.h); const nxt = row.slice(i + 1).find(shown);
      x += l.w + (nxt ? (nxt.role === 'mobile' && nxt.unit === UNITS.find(u => u.id === l.unit).pair ? STAGE.pairGap : STAGE.gap) : 0);
    }
    s.y = y - STAGE.labelH; s.h = rowH + STAGE.labelH; s.w = x - STAGE.pad;
    maxW = Math.max(maxW, x); y += rowH + STAGE.rowGap;
  }
  STAGE.w = maxW + STAGE.pad; STAGE.h = y - STAGE.rowGap + STAGE.pad; stage.style.width = STAGE.w + 'px'; stage.style.height = STAGE.h + 'px';
  for (const l of LAYOUT) { const el = $('.sb-screen[data-id="' + l.id + '"]'); el.style.left = l.x + 'px'; el.style.top = l.y + 'px'; el.hidden = !shown(l); const ov = $('.sb-ov[data-id="' + l.id + '"]'); if (ov) ov.classList.toggle('is-hidden', !shown(l)); }
  $$('.sb-bar [data-show]').forEach(b => b.classList.toggle('on', b.dataset.show === show));
}
function setShow(v) { show = v; if (!EMBEDDED) try { localStorage.setItem('sb-show', v); } catch {} reflow(); fitAll(); }
function fitUnit(uid) {
  const ls = screensOf(uid); const x = Math.min(...ls.map(l => l.x)), y = Math.min(...ls.map(l => l.y));
  const r = Math.max(...ls.map(l => l.x + l.w)), b = Math.max(...ls.map(l => l.y + l.h));
  fitRect(x, y - 70, r - x, b - y + 70, 40);
}
function zoomAt(factor, cx, cy) {
  const ns = Math.max(0.03, Math.min(3, view.s * factor));
  view.x = cx - (cx - view.x) * (ns / view.s); view.y = cy - (cy - view.y) * (ns / view.s); view.s = ns; apply();
}
viewport.addEventListener('wheel', (e) => {
  if (e.target.closest('.sb-pop, .sb-notes')) return;
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  else { view.x -= e.deltaX; view.y -= e.deltaY; apply(); }
}, { passive: false });
let drag = null;
viewport.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.sb-ov, .sb-pop, .sb-notes')) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; viewport.classList.add('dragging'); });
window.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); });
window.addEventListener('pointerup', (e) => {
  if (!drag) return; const moved = drag.moved; drag = null; viewport.classList.remove('dragging');
  if (moved) return;
  const scr = e.target.closest && e.target.closest('.sb-screen');
  if (cmp().choosing) { if (scr) choose(scr.dataset.unit); return; }  // choose mode: clicks pick the two sides
  if (scr && e.shiftKey) return startChoose(scr.dataset.unit);       // shift-click: shortcut into choose mode with this screen on the left
  if (scr) open(scr.dataset.unit);                                   // click a screen: point at it, open its card
  else if (state.panel === 'pop') { state.active = null; state.panel = null; paint(); }   // click empty canvas: close the card
});
viewport.addEventListener('dblclick', (e) => { if (cmp().choosing || e.target.closest('.sb-pop, .sb-notes, .sb-ov')) return; const scr = e.target.closest('.sb-screen'); if (scr) fitUnit(scr.dataset.unit); });
// keep the mockups' own links from navigating
stage.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) e.preventDefault(); });
window.addEventListener('resize', apply);

function open(uid) { state.active = uid; state.panel = 'pop'; paint(); }
function toggleLock(uid) { if (READ_ONLY) return; const was = isLocked(uid); if (was) unlock(uid); else lock(uid); persist(was ? 'unlock' : 'lock'); paint(); }
// One click puts the client's colors (and fonts, if supplied) on every unlocked screen: the bar takes the brand values
// and per-screen color/font overrides are cleared so nothing hides it. Locked screens keep their captured look.
function applyBrand() {
  if (!BRAND || READ_ONLY) return;
  if (BRAND.colors && PALETTES.some(p => p.id === 'brand')) setBar('palette', 'brand');
  if (BRAND.font && FONTS.some(f => f.id === 'brand')) setBar('font', 'brand');
  for (const u of UNITS) { if (isLocked(u.id)) continue; const ov = overrides(u.id); if (ov.palette !== undefined || ov.font !== undefined) { delete ov.palette; delete ov.font; state.ov[u.id] = Object.keys(ov).length ? { ...ov, at: now() } : { _del: true, at: now() }; } }
  toast((BRAND.name || 'Brand') + ' applied to every unlocked screen.');
}


// ---------- compare view ----------
// Flow: Compare (bar, card, C key or shift-click) starts *choose mode* — the rep clicks a screen, then a second
// one, or the same screen again to see it in two looks — and the view opens. Two units render as clones with
// their own look; a pane's look = the unit's effective look + that pane's own overrides (pov). "Save to screen"
// writes a pane's look into the real screen's overrides (or its lock, if locked); Done asks about unsaved looks.
const cmp = () => state.compare, cmpEl = $('.sb-compare'), chooseEl = $('.sb-choose');
let noteTimer = null;
function paneLook(i) { const uid = cmp().pins[i]; return uid ? { ...effective(uid), ...cmp().pov[i] } : null; }
function dirty(i) { const uid = cmp().pins[i]; if (!uid) return false; const eff = effective(uid), pov = cmp().pov[i]; return FIELDS.some(f => pov[f] !== undefined && pov[f] !== (eff[f] || (f === 'navicons' ? 'on' : ''))); }
function startChoose(seed) {
  const c = cmp(); c.pins = seed ? [seed] : []; c.pov = [{}, {}]; c.choosing = true; c.open = false; c.confirm = false; c.focus = null; state.panel = null; state.active = null;
  paint();
}
function cancelChoose() { const c = cmp(); c.choosing = false; c.pins = []; paint(); }
function choose(uid) {
  const c = cmp(); c.pins.push(uid); c.pov[c.pins.length - 1] = {};
  if (c.pins.length === 2) { c.choosing = false; c.open = true; c.focus = null; }
  paint();
}
function savePane(i) {
  if (READ_ONLY) return;
  const uid = cmp().pins[i], look = paneLook(i);
  if (isLocked(uid)) state.locks[uid] = { ...look, at: now() };                 // a locked screen keeps its lock, with the new look
  else { const ov = {}; for (const f of FIELDS) { const barVal = f === 'navicons' ? (state.bar.navicons || 'on') : state.bar[f]; if (look[f] !== barVal) ov[f] = look[f]; } state.ov[uid] = { ...ov, at: now() }; }
  cmp().pov[i] = {}; persist('compare-save'); toast('Saved to ' + unitTitle(unitOf(uid)) + '.');
}
// Done / Esc / bar button: close straight away when nothing is unsaved, otherwise ask first.
function requestClose() {
  const c = cmp(); if (!c.open) return;
  if (!dirty(0) && !dirty(1)) return closeCompare();
  c.confirm = true; paint();
}
function closeCompare() { const c = cmp(); c.open = false; c.confirm = false; c.focus = null; c.pins = []; c.pov = [{}, {}]; paint(); }
function paintChoose() {
  const c = cmp(); $('.sb').classList.toggle('choosing', c.choosing); chooseEl.hidden = !c.choosing;
  for (const l of LAYOUT) { const root = $('.sb-ov[data-id="' + l.id + '"]'), wrap = $('.sb-screen[data-id="' + l.id + '"]'); const chip = root && $('.sb-choicechip', root); const idx = c.choosing ? c.pins.indexOf(l.unit) : -1; if (chip) { chip.hidden = idx < 0; chip.textContent = idx === 0 ? '1 · Left' : ''; } wrap.classList.toggle('is-choice', idx >= 0); }
  $('.sb-comparebtn').classList.toggle('on', c.choosing || c.open); $('.sb-comparebtn b').textContent = c.choosing ? 'Cancel' : c.open ? 'Done' : 'Compare';
  if (!c.choosing) return;
  const t = $('.sb-choosetext', chooseEl);
  t.innerHTML = c.pins.length === 0
    ? ' — click a screen for the left side, then one for the right. Click the same screen twice to see it in two looks.'
    : ' — left: <b>' + esc(unitTitle(unitOf(c.pins[0]))) + '</b>. Now click a screen for the right side (the same one again for two looks).';
}
function paintCompare() {
  paintChoose();
  const c = cmp();
  cmpEl.hidden = !c.open; $('.sb').classList.toggle('comparing', c.open); if (cmpEl.hidden) return;
  // the unsaved-look strip in the head
  const conf = $('.sb-cmpconfirm', cmpEl); conf.hidden = !c.confirm;
  if (c.confirm) {
    const same = c.pins[0] === c.pins[1], d0 = dirty(0), d1 = dirty(1), name = (i) => esc(unitTitle(unitOf(c.pins[i])));
    const btn = (act, label) => '<button type="button" class="sb-btn" data-cmpact="' + act + '">' + label + '</button>';
    if (READ_ONLY) { const side = d0 && d1 ? 'both sides' : d0 ? 'the left side (' + name(0) + ')' : 'the right side (' + name(1) + ')'; $('.sb-cmpconfirmtext', conf).innerHTML = 'Read-only — the look on ' + side + ' cannot be saved.'; $('.sb-cmpconfirmbtns', conf).innerHTML = btn('discard', 'Discard') + btn('back', 'Keep comparing'); }
    else if (same && d0 && d1) { $('.sb-cmpconfirmtext', conf).innerHTML = 'Both sides changed ' + name(0) + ' — which look should it keep?'; $('.sb-cmpconfirmbtns', conf).innerHTML = btn('left', 'Left') + btn('right', 'Right') + btn('discard', 'Neither') + btn('back', 'Keep comparing'); }
    else { const side = d0 && d1 ? 'both sides' : d0 ? 'the left side (' + name(0) + ')' : 'the right side (' + name(1) + ')'; $('.sb-cmpconfirmtext', conf).innerHTML = 'Unsaved look on ' + side + '.'; $('.sb-cmpconfirmbtns', conf).innerHTML = btn('save', 'Save & close') + btn('discard', 'Discard') + btn('back', 'Keep comparing'); }
  }
  cmpEl.classList.toggle('focus-0', c.focus === 0); cmpEl.classList.toggle('focus-1', c.focus === 1);
  const same = c.pins[0] === c.pins[1]; cmpEl.classList.toggle('shared', same); $('.sb-sharednote', cmpEl).hidden = !same;
  for (let i = 0; i < 2; i++) {
    const uid = c.pins[i], u = unitOf(uid), look = paneLook(i), pane = $('.sb-pane[data-pane="' + i + '"]', cmpEl), bar = $('.sb-panebar', pane);
    const badge = $('.sb-badge', bar); badge.textContent = u.label; badge.classList.add('wide');
    $('.sb-panename', bar).textContent = unitTitle(u);
    for (const f of ['density', 'mode', 'navicons']) $$('[data-pfield="' + f + '"] button', bar).forEach(b => b.classList.toggle('on', b.dataset.val === (look[f] || (f === 'navicons' ? 'on' : ''))));
    $('[data-pfield="palette"]', bar).value = look.palette; $('[data-pfield="font"]', bar).value = look.font;
    const lb = $('.sb-panelock', bar); lb.classList.toggle('on', isLocked(uid)); lb.title = isLocked(uid) ? 'Unlock' : 'Lock this screen with the look shown here'; lb.disabled = READ_ONLY;
    const isDirty = dirty(i); pane.classList.toggle('is-dirty', isDirty); const sv = $('.sb-panesave', bar); sv.textContent = isDirty ? 'Save to screen' : 'Saved'; sv.disabled = !isDirty || READ_ONLY; sv.title = isDirty ? (isLocked(uid) ? "Update this locked screen's look to what is shown here" : "Save this look to the screen as its overrides") : 'The screen already has this look';
    // clones: rebuild only when the pinned unit changed; retheme every paint
    const stageEl = $('.sb-panestage', pane);
    if (stageEl.dataset.unit !== uid) { stageEl.innerHTML = ''; stageEl.dataset.unit = uid; for (const l of screensOf(uid)) { const src = $('.sb-screen[data-id="' + l.id + '"] > .screen'); const w = document.createElement('div'); w.className = 'sb-clone'; w.dataset.id = l.id; w.style.width = l.w + 'px'; w.style.height = l.h + 'px'; w.appendChild(src.cloneNode(true)); stageEl.appendChild(w); } }
    const pal = PALETTES.find(p => p.id === look.palette) || PALETTES[0], font = FONTS.find(f => f.id === look.font) || FONTS[0];
    for (const w of $$('.sb-clone', stageEl)) { const sc = w.firstElementChild; sc.dataset.mode = look.mode; sc.dataset.density = look.density; sc.dataset.palette = pal.id; sc.dataset.navicons = look.navicons || 'on'; sc.style.setProperty('--font-head', font.head + ', ' + FB_HEAD); sc.style.setProperty('--font-body', font.body + ', ' + FB_BODY); w.classList.toggle('is-locked', isLocked(uid)); }
    const ta = $('.sb-panenote .sb-pnote', pane); if (document.activeElement !== ta) ta.value = noteOf(uid);
  }
  if (same) { const ta = $('.sb-sharednote .sb-pnote', cmpEl); if (document.activeElement !== ta) ta.value = noteOf(c.pins[0]); }
  requestAnimationFrame(layoutPanes);
}
// fit each pane's clones (stacked: desktop above mobile for a pair) into its body
function layoutPanes() {
  const c = cmp(); if (!c.open) return;
  for (let i = 0; i < 2; i++) {
    const pane = $('.sb-pane[data-pane="' + i + '"]', cmpEl); if (pane.offsetParent === null) continue;
    const body = $('.sb-panebody', pane), stageEl = $('.sb-panestage', pane), clones = $$('.sb-clone', stageEl); if (!clones.length) continue;
    const GAPY = 60; let y = 0, W = 0; for (const w of clones) { w.style.left = '0px'; w.style.top = y + 'px'; y += parseFloat(w.style.height) + GAPY; W = Math.max(W, parseFloat(w.style.width)); }
    const H = y - GAPY, pad = 28, bw = body.clientWidth - pad * 2, bh = body.clientHeight - pad * 2;
    const sc = Math.min(bw / W, bh / H); stageEl.style.transform = 'translate(' + ((body.clientWidth - W * sc) / 2) + 'px,' + ((body.clientHeight - H * sc) / 2) + 'px) scale(' + sc + ')';
  }
}
window.addEventListener('resize', layoutPanes);
cmpEl.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('sb-cmpdone')) return requestClose();
  if (b.dataset.cmpact) {
    const act = b.dataset.cmpact;
    if (act === 'back') { cmp().confirm = false; return paint(); }
    if (act === 'save') { if (dirty(0)) savePane(0); if (dirty(1)) savePane(1); }
    else if (act === 'left') savePane(0); else if (act === 'right') savePane(1);
    return closeCompare();
  }
  if (b.classList.contains('sb-cmpswap')) { const c = cmp(); c.pins.reverse(); c.pov.reverse(); if (c.focus !== null) c.focus = 1 - c.focus; return paint(); }
  const pane = b.closest('.sb-pane'); if (!pane) return; const i = Number(pane.dataset.pane), uid = cmp().pins[i];
  if (b.classList.contains('sb-panefocus')) { cmp().focus = cmp().focus === i ? null : i; return paint(); }
  if (READ_ONLY && (b.classList.contains('sb-panesave') || b.classList.contains('sb-panelock'))) return;
  if (b.classList.contains('sb-panesave')) { savePane(i); return paint(); }
  if (b.classList.contains('sb-panelock')) { const was = isLocked(uid); if (was) unlock(uid); else { state.locks[uid] = { ...paneLook(i), at: now() }; state.ov[uid] = { _del: true, at: now() }; cmp().pov[i] = {}; } persist(was ? 'unlock' : 'lock'); return paint(); }
  const grp = b.closest('[data-pfield]'); if (grp) { cmp().pov[i][grp.dataset.pfield] = b.dataset.val; cmp().confirm = false; return paint(); }
});
cmpEl.addEventListener('change', (e) => { const sel = e.target; if (sel.tagName !== 'SELECT' || !sel.dataset.pfield) return; const i = Number(sel.closest('.sb-pane').dataset.pane); cmp().pov[i][sel.dataset.pfield] = sel.value; cmp().confirm = false; paint(); });
chooseEl.addEventListener('click', (e) => { if (e.target.closest('.sb-choosecancel')) cancelChoose(); });
cmpEl.addEventListener('input', (e) => {
  const t = e.target; if (READ_ONLY || !t.classList.contains('sb-pnote')) return;
  const pane = t.closest('.sb-pane'); const uid = pane ? cmp().pins[Number(pane.dataset.pane)] : cmp().pins[0];
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { setNote(uid, t.value); persist('note'); paint(); }, 400);
});

// ---------- controls ----------
document.addEventListener('click', (e) => {
  const li = e.target.closest('.sb-notelist li[data-unit]'); if (li) { open(li.dataset.unit); return; }
  if (e.target.classList && e.target.classList.contains('sb-exportmodal')) return closeExport();   // backdrop click
  const b = e.target.closest('button'); if (!b) return;
  if (b.closest('.sb-exportmodal')) { if (b.classList.contains('sb-exportcancel')) return closeExport(); if (b.dataset.export) { closeExport(); return exportCopy(b.dataset.export); } return; }
  if (b.closest('.sb-bar')) {
    const editing = b.dataset.density || b.dataset.mode || b.dataset.navicons || b.dataset.palette || b.classList.contains('sb-applybrand') || b.classList.contains('sb-resetall');
    if (READ_ONLY && editing) return;
    const reason = b.classList.contains('sb-applybrand') ? 'apply-brand' : b.classList.contains('sb-resetall') ? 'reset' : 'bar';
    if (b.dataset.density) setBar('density', b.dataset.density);
    else if (b.dataset.mode) setBar('mode', b.dataset.mode);
    else if (b.dataset.navicons) setBar('navicons', b.dataset.navicons);
    else if (b.dataset.palette) setBar('palette', b.dataset.palette);
    else if (b.classList.contains('sb-applybrand')) applyBrand();
    else if (b.dataset.fit === 'all') return fitAll();
    else if (b.dataset.show) return setShow(b.dataset.show);
    else if (b.dataset.zoom) return zoomAt(Number(b.dataset.zoom), viewport.clientWidth / 2, viewport.clientHeight / 2);
    else if (b.classList.contains('sb-exportopen')) return openExport();
    if (b.classList.contains('sb-theme')) return setTheme(!$('.sb').classList.contains('dark'));
    else if (b.classList.contains('sb-resetall')) { for (const u of UNITS) clearOverride(u.id); }
    else if (b.classList.contains('sb-notesbtn')) { state.panel = state.panel === 'notes' ? null : 'notes'; return paint(); }
    else if (b.classList.contains('sb-comparebtn')) return cmp().open ? requestClose() : cmp().choosing ? cancelChoose() : startChoose();
    if (EMBEDDED && !editing) return paint();   // only real edits reach the host
    persist(reason); return paint();
  }
  if (b.closest('.sb-pop')) {
    const uid = state.active; if (!uid) return;
    if (b.classList.contains('sb-popclose')) { state.active = null; state.panel = null; return paint(); }
    if (b.classList.contains('sb-popzoom')) return fitUnit(uid);
    if (READ_ONLY && (b.classList.contains('sb-poplock') || b.classList.contains('sb-popreset') || b.closest('[data-field]'))) return;
    if (b.classList.contains('sb-poplock')) return toggleLock(uid);
    if (b.classList.contains('sb-popreset')) { clearOverride(uid); persist('override'); return paint(); }
    if (b.classList.contains('sb-popcompare')) return startChoose(uid);
    const grp = b.closest('[data-field]'); if (!grp || isLocked(uid)) return;
    setOverride(uid, grp.dataset.field, b.dataset.val); persist('override'); return paint();
  }
  if (b.closest('.sb-notes')) {
    if (b.classList.contains('sb-notesclose')) { state.panel = null; return paint(); }
    if (b.classList.contains('sb-clearnotes')) {
      if (READ_ONLY) return;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to clear every note'; clearTimeout(b._t); b._t = setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'Clear notes'; }, 4000); return; }
      for (const u of UNITS) if (noteOf(u.id)) setNote(u.id, ''); state.general = { text: '', at: now() };
      b.dataset.armed = '0'; b.textContent = 'Clear notes'; persist('clear-notes'); paint(); return toast('Notes cleared.');
    }
    return;
  }
  const root = b.closest('.sb-ov');
  if (root) { if (cmp().choosing) return choose(root.dataset.unit); if (b.dataset.action === 'lock') return READ_ONLY ? undefined : toggleLock(root.dataset.unit); if (b.dataset.action === 'open') return open(root.dataset.unit); }
});
document.addEventListener('change', (e) => {
  const sel = e.target; if (sel.tagName !== 'SELECT' || READ_ONLY) return;
  if (sel.dataset.font !== undefined && sel.closest('.sb-bar')) { setBar('font', sel.value); persist('bar'); return paint(); }
  if (sel.closest('.sb-pop') && state.active && sel.dataset.field && !isLocked(state.active)) { setOverride(state.active, sel.dataset.field, sel.value); persist('override'); paint(); }
});
// notes save as you type (debounced), and show a small "saved" confirmation
document.addEventListener('input', (e) => {
  const t = e.target; if (READ_ONLY) return;
  if (t.classList.contains('sb-note') && state.active) { const uid = state.active; clearTimeout(noteTimer); noteTimer = setTimeout(() => { setNote(uid, t.value); persist('note'); paint(); const s = $('.sb-notesaved', pop); s.hidden = false; clearTimeout(s._t); s._t = setTimeout(() => { s.hidden = true; }, 1500); }, 400); }
  else if (t.classList.contains('sb-general')) { clearTimeout(noteTimer); noteTimer = setTimeout(() => { if (READ_ONLY) return; state.general = { text: t.value, at: now() }; persist('general'); paintSync(); }, 400); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (cmp().open && e.key === ' ') { e.preventDefault(); const c = cmp(); c.focus = c.focus === null ? 0 : c.focus === 0 ? 1 : null; return paint(); }
  if (cmp().open && e.key === 'Escape') return requestClose();
  if (cmp().open) return;                       // while comparing, the bar is hidden — its shortcuts sleep too
  if (cmp().choosing && e.key === 'Escape') return cancelChoose();
  if (e.key === 'c' && !cmp().open) return cmp().choosing ? cancelChoose() : startChoose();
  if (e.key === '0') fitAll();
  else if (e.key === '=' || e.key === '+') zoomAt(1.25, viewport.clientWidth / 2, viewport.clientHeight / 2);
  else if (e.key === '-') zoomAt(0.8, viewport.clientWidth / 2, viewport.clientHeight / 2);
  else if (e.key === 'd') { if (READ_ONLY) return; setBar('mode', next(MODES, state.bar.mode)); persist('bar'); paint(); }
  else if (e.key === 'l' && state.active) { if (READ_ONLY) return; toggleLock(state.active); }
  else if (e.key === 'n') { state.panel = state.panel === 'notes' ? null : 'notes'; paint(); }
  else if (e.key === 'Escape') { const em = $('.sb-exportmodal'); if (em && !em.hidden) return closeExport(); if (state.panel) { const was = state.panel; state.panel = null; if (was === 'pop') state.active = null; paint(); } }
});

// ---------- exports (the Export menu) — locked screens only ----------
const F = '\\u0060\\u0060\\u0060';
const stamp = () => (CLIENT ? ' · ' + CLIENT : '') + ' · ' + new Date().toISOString().slice(0, 10);
const palName = (id) => (PALETTES.find(p => p.id === id) || {}).name || id, fontName = (id) => (FONTS.find(f => f.id === id) || {}).name || id;
const lookLine = (v) => v.density + ' · ' + palName(v.palette) + ' · ' + fontName(v.font) + ' · ' + v.mode + (v.navicons === 'off' ? ' · nav icons off' : '');
const shortTitle = (u) => u.setTitle + ' ' + u.label;   // "Login A1" (desktop) / "Login A2" (its mobile)
const unitTitle = (u) => shortTitle(u) + ' — ' + u.name + (u.role === 'mobile' ? ' (mobile)' : '');
// every screen of every locked unit, with its element and a file-safe name
function lockedScreens() {
  const out = [];
  for (const u of lockedUnits()) for (const l of screensOf(u.id)) {
    out.push({ u, l, el: $('.sb-screen[data-id="' + l.id + '"] > .screen'), title: unitTitle(u), base: shortTitle(u).replace(/[^A-Za-z0-9]+/g, '-') });
  }
  return out;
}
const themeCssText = () => (($('#sb-theme-css') || {}).textContent || '').trim();
const spriteHtml = () => ($('#sb-icons') || {}).innerHTML || '';
const NO_PICKS = 'Nothing is locked yet — lock the screens to export (the padlock above a screen, or L with its card open), then export again.';

// The meeting record — the head of both exports (values are read from state, never retyped).
function summaryLines() {
  const bar = clean(state.bar), palB = PALETTES.find(p => p.id === bar.palette), fontB = FONTS.find(f => f.id === bar.font);
  const locked = lockedUnits();
  const lines = ['# Design Sandbox — choices' + stamp(), '', 'Locked in (final):'];
  if (locked.length) for (const u of locked) { const v = clean(state.locks[u.id]); const pal = PALETTES.find(p => p.id === v.palette) || {}; lines.push('- ' + unitTitle(u) + ' — ' + v.density + ' · ' + (pal.name || v.palette) + (pal.light ? ' (light ' + pal.light.join(' ') + ' · dark ' + pal.dark.join(' ') + ')' : '') + ' · ' + fontName(v.font) + ' · ' + v.mode + (v.navicons === 'off' ? ' · nav icons off' : '')); }
  else lines.push('- none');
  lines.push('', 'Set values at the end of the meeting: ' + bar.density + ' · ' + palB.name + ' — light ' + palB.light.join(' ') + ' · dark ' + palB.dark.join(' ') + ' · ' + fontB.name + ' (headings ' + fontB.head + ', body ' + fontB.body + ') · ' + bar.mode + ' · nav icons ' + (bar.navicons || 'on'));
  const ovs = UNITS.filter(u => !isLocked(u.id) && Object.keys(overrides(u.id)).length).map(u => '- ' + unitTitle(u) + ': ' + Object.entries(overrides(u.id)).map(([k, val]) => k + '=' + (k === 'palette' ? palName(val) : k === 'font' ? fontName(val) : val)).join(', '));
  lines.push('', 'Overrides on unlocked screens:', ...(ovs.length ? ovs : ['- none']));
  if (BRAND) { lines.push('', 'Brand supplied: ' + [BRAND.colors ? 'colors ' + BRAND.colors.join(' ') + (BRAND.borrowedFrom ? ' (secondary/tertiary borrowed from ' + BRAND.borrowedFrom + ')' : '') : null, BRAND.font ? 'fonts ' + BRAND.font : null, BRAND.logo ? 'logo (' + BRAND.logo + ')' : null].filter(Boolean).join('; ')); if (BRAND.report && BRAND.report.length) { lines.push('Contrast:'); for (const r of BRAND.report) lines.push('- ' + r); } }
  const notes = UNITS.filter(u => noteOf(u.id)).map(u => '- ' + unitTitle(u) + (isLocked(u.id) ? '' : ' (not locked)') + ': ' + noteOf(u.id).replace(/\\s*\\n\\s*/g, ' / '));
  lines.push('', 'Notes:', ...(notes.length ? notes : ['- (none on screens)']));
  lines.push('- General: ' + ((state.general.text || '').trim() ? state.general.text.trim().replace(/\\s*\\n\\s*/g, ' / ') : '(none)'));
  const notLocked = (set) => UNITS.filter(u => u.set === set && !isLocked(u.id)).map(u => u.label).join(', ') || 'none';
  lines.push('', 'Not locked: Login ' + notLocked('login') + ' · Dashboard ' + notLocked('dashboard') + ' — shown and passed over, not forgotten.');
  return lines;
}
// one line Claude can read back as picks.json (build.mjs --picks) if the rep pastes an export to Claude instead
const picksComment = () => '<!-- design-sandbox picks: ' + JSON.stringify({ v: 2, client: CLIENT, locks: Object.fromEntries(lockedUnits().map(u => [u.id, clean(state.locks[u.id])])), notes: Object.fromEntries(UNITS.filter(u => noteOf(u.id)).map(u => [u.id, noteOf(u.id)])), general: (state.general.text || '').trim(), bar: clean(state.bar), overrides: Object.fromEntries(UNITS.filter(u => !isLocked(u.id) && Object.keys(overrides(u.id)).length).map(u => [u.id, overrides(u.id)])) }) + ' -->';

// For Claude Design — complete, ready-to-save artboard files (one .dc.html per locked screen, static,
// theme + lock already on the markup) and nothing else, so its model only has to save them.
function designText() {
  const picked = lockedScreens(); if (!picked.length) return NO_PICKS;
  const themeCss = themeCssText(), sprite = spriteHtml(); const seen = {};
  const files = picked.map((x, i) => {
    let name = i === 0 ? 'Main.dc.html' : x.base + '.dc.html'; if (seen[name]) name = x.base + '-' + (++seen[x.base]) + '.dc.html'; seen[name] = 1; seen[x.base] = seen[x.base] || 1;
    return { name, title: x.title, w: x.l.w, h: x.l.h,
      html: ['<!doctype html>', '<html>', '<head>', '  <meta charset="utf-8">', '  <script src="./support.js"></' + 'script>', '</head>', '<body>', '<x-dc>', '<helmet>',
        '  <link rel="stylesheet" href="' + FONTS_HREF + '">', '  <style>', 'body { margin: 0; }', 'a { color: #1F2329; } a:hover { color: #000; }', themeCss, '  </style>', '</helmet>',
        '<div>' + sprite + x.el.outerHTML + '</div>', '</x-dc>', '</body>', '</html>'].join('\\n') };
  });
  const lines = [...summaryLines(), '', '## For Claude Design', '',
    'Create exactly ' + files.length + ' artboard file' + (files.length > 1 ? 's' : '') + ' on one canvas, side by side, from the blocks below: ' + files.map(f => '"' + f.name + '" (' + f.title + ', ' + f.w + '×' + f.h + ')').join(', ') + '. ' +
    'Save each block as that file, byte for byte — it is already a complete Design Component (keep the <script src="./support.js"> head line exactly). ' +
    'These are approved templates with the theme applied inline: do NOT merge them into one file, redesign, restyle, rename, re-word, add a screen switcher or any other control, or invent data. ' +
    'Keep the company name exactly as it appears in the markup' + (CLIENT ? ' (' + CLIENT + ')' : ' ("Acme")') + '. The only acceptable output is these files as their own artboards.'];
  for (const f of files) lines.push('', '## ' + f.name + ' — ' + f.title + ' — frame ' + f.w + '×' + f.h, F + 'html', f.html, F);
  let x = 0; const artboards = files.map(f => { const a = { file: f.name, x, y: 0, w: f.w, h: f.h, title: f.title }; x += f.w + 160; return a; });
  lines.push('', '## canvas.json — layout, if the canvas uses one', F + 'json', JSON.stringify({ artboards, launch: { view: 'canvas' } }, null, 2), F, '', picksComment());
  return lines.join('\\n');
}

// HTML only — one self-contained page with the locked screens, exactly as shown; opens in any browser, hands to a developer.
function htmlText() {
  const picked = lockedScreens(); if (!picked.length) return NO_PICKS;
  return ['<!doctype html>', '<!--', ...summaryLines().map(l => l.replace(/--/g, '—')), '', 'Theme tokens are the custom properties on .screen in the stylesheet below; data-mode / data-density / data-palette on each screen select them.', '-->', picksComment(), '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + esc('Design Sandbox — chosen screens' + stamp()) + '</title>',
    '<link rel="stylesheet" href="' + FONTS_HREF + '">', '<style>', 'body { margin: 0; padding: 48px; background: #E9EAEE; font-family: ui-sans-serif, system-ui, sans-serif; color: #1F2329; }',
    '.pick { margin: 0 auto 64px; width: max-content; max-width: 100%; overflow-x: auto; }', '.pick h2 { font-size: 15px; font-weight: 700; margin: 0 0 10px; }',
    '.pick > .screen { box-shadow: 0 2px 6px rgba(0,0,0,.10), 0 30px 80px -20px rgba(0,0,0,.28); border-radius: 6px; overflow: hidden; }', 'a { color: #1F2329; }',
    themeCssText(), '</style>', '</head>', '<body>', spriteHtml(),
    ...picked.map(x => '<section class="pick"><h2>' + esc(x.title) + '</h2>' + x.el.outerHTML + '</section>'),
    '</body>', '</html>'].join('\\n');
}

const EXPORTS = {
  design: { text: designText, mode: 'copy', done: 'Copied for Claude Design — paste it there to recreate the locked screens as artboards.' },
  html: { text: htmlText, mode: 'download', done: 'open it in any browser or hand it to a developer.' },
};
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
function fileName() { return 'design-sandbox-screens' + (CLIENT ? '-' + slug(CLIENT) : '') + '-' + new Date().toISOString().slice(0, 10) + '.html'; }
// Saving the HTML file: the hosted page (claude.ai) saves through the viewer's downloads capability, which shows the
// viewer a confirmation; the file on disk downloads directly; anything else falls back to the clipboard.
const canDownload = () => { try { return window.self === window.top; } catch { return false; } };
async function saveFile(text, name, done) {
  let dl = null;
  try { if (window.claude && typeof window.claude.use === 'function') dl = await window.claude.use('downloads'); } catch { dl = null; }
  if (dl) {
    try { await dl.save({ filename: name, data: text }); return toast('Saved ' + name + ' — ' + done); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return toast('Download cancelled.');
      if (code === 'rate_limited') return toast('A save prompt is already open — answer it first, then try again.', 3000);
    }
  }
  if (canDownload()) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return toast('Downloading ' + name + ' — ' + done);
  }
  try { await navigator.clipboard.writeText(text); toast('This page cannot save files here, so the HTML was copied instead — paste it into a plain-text editor and save it as ' + name + '.', 6000); }
  catch { window.prompt('Copy your export:', text); }
}
function toast(msg, ms = 1800) { const t = $('.sb-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
// Export modal (Abby, 2026-09-16): Actions ▸ Export… asks which of the two exports; both read the locked screens only.
function openExport() {
  const n = lockedUnits().length, m = $('.sb-exportmodal'); if (!m) return;
  $('.sb-exportcount', m).textContent = n ? (n === 1 ? '1 locked screen will be exported, with its look and note.' : n + ' locked screens will be exported, each with its look and note.') : 'Nothing is locked yet — lock the screens you want to export, then come back here.';
  for (const b of m.querySelectorAll('[data-export]')) b.disabled = !n;
  m.hidden = false; (m.querySelector('[data-export]:not([disabled])') || $('.sb-exportcancel', m)).focus();
}
function closeExport() { const m = $('.sb-exportmodal'); if (m) m.hidden = true; }
async function exportCopy(kind) {
  const ex = EXPORTS[kind]; if (!ex) return;
  const text = ex.text(); if (text === NO_PICKS) return toast(text, 3200);
  if (ex.mode === 'download') return saveFile(text, fileName(), ex.done);
  try { await navigator.clipboard.writeText(text); toast(ex.done); }
  catch { window.prompt('Copy your export:', text); }
}

// ---------- overlays ----------
const LOCK_SVG = ${JSON.stringify(LOCK_SVG)};
for (const s of SETS) {
  const el = document.createElement('div'); el.className = 'sb-rowtitle'; el.dataset.row = s.key;
  el.innerHTML = '<b>' + s.title + '</b><span>' + UNITS.filter(u => u.set === s.key && u.role === 'desktop').map(u => u.letter).join(' · ') + ' &nbsp;·&nbsp; 1 desktop · 2 mobile</span>';
  overlays.appendChild(el);
}
for (const l of LAYOUT) {
  const el = document.createElement('div'); el.className = 'sb-ov'; el.dataset.id = l.id; el.dataset.unit = l.unit; el.dataset.set = l.set; el.dataset.key = l.key;
  const mini = l.role === 'mobile';
  if (mini) el.classList.add('is-mini');
  el.innerHTML = '<button class="sb-pick only-badge" type="button" data-action="open" title="' + esc(l.name + (l.role === 'mobile' ? ' · mobile' : '')) + ' — open this screen\\'s card"><span class="sb-badge wide">' + l.label + '</span></button>' +
    '<button class="sb-lockbtn" type="button" data-action="lock" aria-label="Lock"><span class="lock-ic">' + LOCK_SVG + '</span></button><span class="sb-notedot" hidden title="Has a note"></span><span class="sb-choicechip" hidden></span>';
  overlays.appendChild(el);
}
// page theme (light by default; remembered per browser, never affects the screens)
function setTheme(dark) { $('.sb').classList.toggle('dark', !!dark); try { localStorage.setItem('sb-theme', dark ? 'dark' : 'light'); } catch {} }
if (EMBEDDED) {
  window.addEventListener('message', onBridge);
  paint(); reflow(); fitAll();
  bridgePost({ type: 'design-sandbox:ready' });
} else {
  try { setTheme(localStorage.getItem('sb-theme') === 'dark'); } catch {}
  loadLocal(); paint(); reflow(); fitAll(); connectDb();
}
`;

  const body = `
<div class="sb${embedded ? ' embedded' : ''}">
  <div class="sb-bar">
    <div class="sb-row title">
      <div class="sb-title">${PAGE_TITLE}</div>
      <div class="sb-tools">
        ${embedded ? '<span class="sb-roflag" hidden>Read-only</span>\n        ' : ''}<button class="sb-btn sb-tool sb-comparebtn" type="button" title="Compare two screens side by side, or one screen in two looks (C)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/></svg><b>Compare</b></button>
        <button class="sb-btn sb-tool sb-resetall" type="button" title="Clear every per-screen override — locked screens stay as they are"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><b>Reset</b></button>
        <button class="sb-btn sb-tool sb-notesbtn" type="button" title="Meeting notes and every screen's note (N)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11l-4 4H4z"/><path d="M8 10h8M8 14h5"/></svg><b>Notes</b></button>
${embedded ? `        <span class="sb-lockcount sb-lockchip" title="Locked screens"></span>
` : `        <button class="sb-btn sb-tool sb-exportopen" type="button" title="Export the locked screens — for Claude Design or as an HTML file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M4 15v4h16v-4"/></svg><b>Export</b><span class="sb-count sb-lockcount" title="Locked screens"></span></button>
        <span class="sb-vsep" aria-hidden="true"></span>
      <button class="sb-theme" type="button" title="Light / dark page" aria-label="Toggle the page between light and dark"><svg class="moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
`}      </div>
    </div>
    <div class="sb-row">
      <div class="sb-group"><label>Density</label><div class="sb-seg"><button type="button" data-density="comfortable">Comfortable</button><button type="button" data-density="compact">Compact</button></div></div>
      <div class="sb-group"><label>Font</label>${fontSelect}</div>
      <div class="sb-group"><label>Mode</label><div class="sb-seg"><button type="button" data-mode="light">Light</button><button type="button" data-mode="dark">Dark</button></div></div>
      <div class="sb-group"><label>Nav icons</label><div class="sb-seg"><button type="button" data-navicons="on">On</button><button type="button" data-navicons="off">Off</button></div></div>
      <div class="sb-right"><div class="sb-group"><label>Show</label><div class="sb-seg"><button type="button" data-show="all">All</button><button type="button" data-show="desktop">Desktop</button><button type="button" data-show="mobile">Mobile</button></div></div><div class="sb-zoom"><button type="button" data-fit="all" title="Fit every screen in view (0)">View all</button><button type="button" data-zoom="0.8" title="Zoom out (−)">−</button><span class="pct">20%</span><button type="button" data-zoom="1.25" title="Zoom in (+)">+</button></div></div>
    </div>
    <div class="sb-row">
      <div class="sb-group"><label>Color</label><div class="sb-swatches">${swatches}</div></div>
      ${brand && (brand.light || brand.font) ? `<button class="sb-btn sb-applybrand" type="button" title="Set ${brand.name}'s ${[brand.light ? 'colors' : null, brand.font ? 'fonts' : null].filter(Boolean).join(' and ')} on every unlocked screen">Apply ${brand.name} brand</button>` : ''}
    </div>
  </div>
  <div class="sb-work">
    <div class="sb-viewport">
      <div class="sb-stage">
        <div id="sb-icons" hidden>${iconsSprite}</div>
        ${screens}
      </div>
      <div class="sb-overlays"></div>
      ${popup}
      ${notesPanel}
      ${chooseBanner}
      ${compareView}
    </div>
  </div>
  <div class="sb-toast"></div>
${embedded ? '' : `  <div class="sb-exportmodal" hidden>
      <div class="sb-exportbox" role="dialog" aria-modal="true" aria-labelledby="sb-exporttitle">
        <div class="sb-exporthead"><b id="sb-exporttitle">Export the locked screens</b><button type="button" class="sb-btn sb-exportcancel" aria-label="Close">✕</button></div>
        <p class="sb-exportcount"></p>
        <div class="sb-exportopts">
          <button type="button" data-export="design"><b>For Claude Design</b><span>Copies a packet to paste into Claude Design — it recreates the locked screens as artboards, with their theme and the notes made here.</span></button>
          <button type="button" data-export="html"><b>HTML file</b><span>Saves one self-contained .html file with the locked screens stacked and labelled — open it in any browser or hand it to a developer.</span></button>
        </div>
      </div>
    </div>
`}</div>
<script>${js}</script>`;

  // Fonts: the page inlines the vendored latin woff2 files (offline-safe); a <link> remains only
  // for families that were not bundled. Exports read FONTS_HREF (the Google link), never #sb-fonts,
  // so the Claude Design paste and the HTML export stay small.
  const head = `<title>${PAGE_TITLE}</title>
${fontsHref ? `<link rel="stylesheet" href="${fontsHref}">` : ''}
${fontsCss ? `<style id="sb-fonts">\n${fontsCss}\n</style>` : ''}
<style id="sb-theme-css">
${themeCss}
</style>
<style>
${css}
</style>`;

  if (bodyOnly) return head + '\n' + body + '\n';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>${body}
</body>
</html>
`;
}
