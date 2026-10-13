#!/usr/bin/env node
// verify-embedded.mjs — maintainer check for the embedded build (bridge v1) and the standalone regression.
//   node scripts/verify-embedded.mjs [--only ac1,ac2,...]
// Drives scripts/fixtures/embed-host.html and the prebuilt pages in headless Chromium (Playwright), DPR 1,
// a fresh browser context per check, every request blocked except file: and data:, and a counter on
// Storage.prototype.setItem in every frame. Writes its evidence under test-results/<ac-slug>/, prints one
// PASS/FAIL line per assertion, and exits 1 if any failed. The 4c05b19 baseline page is regenerated with
// `git show` into a temp dir and never written into the repo.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
const EMBEDDED = path.join(ROOT, 'prebuilt/design-sandbox.embedded.html');
const STANDALONE = path.join(ROOT, 'prebuilt/design-sandbox.html');
const FIXTURE = path.join(ROOT, 'scripts/fixtures/embed-host.html');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/sample-state.json'), 'utf8'));
const EMBEDDED_TEXT = fs.readFileSync(EMBEDDED, 'utf8');
const BASELINE_REF = '4c05b19';
const STORE_KEY = 'sb-meeting:sandbox';   // the standalone page's key (CLIENT is null in the prebuilt pages)
const FAMILIES = ['Manrope', 'Public Sans', 'DM Serif Display', 'DM Sans', 'Space Grotesk', 'IBM Plex Sans', 'Playfair Display', 'Source Sans 3', 'Nunito', 'Nunito Sans'];
const STATE_KEYS = ['bar', 'client', 'general', 'locks', 'notes', 'ov', 'savedAt', 'v'];

const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();
const want = (ac) => !only || only.includes(ac);

// ---------- reporting ----------
const results = [];
function check(ac, name, ok, detail) {
  results.push({ ac, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${ac.toUpperCase()}  ${name}${!ok && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 400) : ''}`);
  return !!ok;
}
const dirFor = (slug, clear = true) => { const d = path.join(OUT, slug); if (clear) fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- harness ----------
const browser = await chromium.launch();
async function newContext({ viewport = { width: 1440, height: 900 }, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const net = { requests: [], aborted: [] };
  ctx.on('request', (r) => net.requests.push(r.url().slice(0, 120)));
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:')) return route.continue();
    net.aborted.push(u); return route.abort();
  });
  if (storage) await ctx.addInitScript((entries) => { try { for (const [k, v] of entries) localStorage.setItem(k, v); } catch {} }, Object.entries(storage));
  await ctx.addInitScript(() => {
    window.__setItemCalls = 0; window.__cspViolations = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { window.__setItemCalls++; return orig.apply(this, a); };
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push({ directive: e.violatedDirective, blocked: String(e.blockedURI).slice(0, 80) }));
  });
  return { ctx, net };
}
async function openFixture(ctx, { query = '', srcdoc = false } = {}) {
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(FIXTURE).href + query);
  if (srcdoc) await page.evaluate((t) => window.embedHost.loadSrcdoc(t), EMBEDDED_TEXT);
  await page.waitForFunction((sd) => window.embedHost.ready.src && (!sd || window.embedHost.ready.srcdoc), srcdoc, { timeout: 20000 });
  const frames = { src: await (await page.$('#frame-src')).contentFrame() };
  if (srcdoc) frames.srcdoc = await (await page.$('#frame-srcdoc')).contentFrame();
  return { page, frames };
}
const hostLog = (page) => page.evaluate(() => window.embedHost.log);
const stateMsgs = async (page, frame, since = 0) => (await hostLog(page)).slice(since).filter(e => e.frame === frame && e.dir === 'in' && e.msg.type === 'design-sandbox:state');
async function waitStates(page, frame, n, since = 0, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const m = await stateMsgs(page, frame, since); if (m.length >= n) return m; await sleep(50); }
  return stateMsgs(page, frame, since);
}
const settle = async (frame) => { await frame.evaluate(() => document.fonts.ready); await sleep(150); };
const live = (e) => !!(e && !e._del);
function stripAt(x) {
  if (Array.isArray(x)) return x.map(stripAt);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) if (k !== 'at' && k !== 'savedAt') o[k] = stripAt(x[k]); return o; }
  return x;
}

// reads what the page shows for the state (DOM only)
const readCanvas = (frame) => frame.evaluate(() => {
  const ids = (sel) => [...document.querySelectorAll(sel)].map(e => e.dataset.id).sort();
  const on = (sel, attr) => { const b = document.querySelector(sel + '.on'); return b ? b.dataset[attr] : null; };
  return {
    locked: ids('.sb-ov.is-locked'), overridden: ids('.sb-ov.is-overridden'),
    noteDots: [...document.querySelectorAll('.sb-ov')].filter(e => !e.querySelector('.sb-notedot').hidden).map(e => e.dataset.id).sort(),
    bar: { density: on('.sb-bar [data-density]', 'density'), mode: on('.sb-bar [data-mode]', 'mode'), navicons: on('.sb-bar [data-navicons]', 'navicons'), palette: on('.sb-bar .sb-swatch', 'palette'), font: document.querySelector('.sb-bar select[data-font]').value },
    lockCount: (document.querySelector('.sb-lockcount') || {}).textContent,
    readOnlyFlagShown: !!document.querySelector('.sb-roflag') && !document.querySelector('.sb-roflag').hidden,
  };
});
const readCard = (frame) => frame.evaluate(() => {
  const pop = document.querySelector('.sb-pop'); const v = (f) => { const b = pop.querySelector('[data-field="' + f + '"] button.on'); return b ? b.dataset.val : null; };
  return { hidden: pop.hidden, name: pop.querySelector('.sb-badge').textContent, density: v('density'), mode: v('mode'), navicons: v('navicons'), palette: v('palette'), font: pop.querySelector('[data-field="font"]').value,
    lockedFlag: !pop.querySelector('.sb-popflag.lock').hidden, overriddenFlag: !pop.querySelector('.sb-popflag:not(.lock)').hidden, note: pop.querySelector('.sb-note').value };
});
const openCard = (frame, id) => frame.locator(`.sb-ov[data-id="${id}"] .sb-pick`).dispatchEvent('click');

// ======================= AC1 — the host sends a saved state; the page shows it =======================
if (want('ac1')) {
  const dir = dirFor('ac1-init-state');
  const { ctx, net } = await newContext();
  const { page, frames } = await openFixture(ctx, { srcdoc: true });
  const inlined = await page.evaluate(() => window.embedHost.SAMPLE);
  check('ac1', 'the fixture\'s inlined sample state equals scripts/fixtures/sample-state.json', eq(inlined, SAMPLE));
  await page.evaluate(() => window.embedHost.sendSample());
  const dom = {};
  for (const key of ['src', 'srcdoc']) {
    const f = frames[key]; await settle(f);
    const canvas = await readCanvas(f);
    await openCard(f, 'login/a'); const cardOverride = await readCard(f);
    await openCard(f, 'login/c'); const cardLocked = await readCard(f);
    await f.locator('.sb-notesbtn').dispatchEvent('click');
    const notes = await f.evaluate(() => ({ general: document.querySelector('.sb-general').value, perScreen: [...document.querySelectorAll('.sb-notelist li[data-unit]')].map(li => li.dataset.unit).sort(), sync: document.querySelector('.sb-notes-sync').textContent }));
    dom[key] = { canvas, cardOverride, cardLocked, notes };
    check('ac1', `${key}: locks shown on login/c and dashboard/b~m only`, eq(canvas.locked, ['dashboard/b~m', 'login/c']), canvas.locked);
    check('ac1', `${key}: lock count reads 2`, canvas.lockCount === '2', canvas.lockCount);
    check('ac1', `${key}: override shown on login/a only`, eq(canvas.overridden, ['login/a']), canvas.overridden);
    check('ac1', `${key}: note dots on login/c and dashboard/a`, eq(canvas.noteDots, ['dashboard/a', 'login/c']), canvas.noteDots);
    check('ac1', `${key}: bar shows compact · Indigo Slate (03) · f3 · dark · nav icons off`, eq(canvas.bar, { density: 'compact', mode: 'dark', navicons: 'off', palette: '03', font: 'f3' }), canvas.bar);
    check('ac1', `${key}: not read-only after init (readOnly: false)`, !canvas.readOnlyFlagShown);
    check('ac1', `${key}: login/a card shows its overrides (comfortable, palette 02, rest "Set")`, eq({ d: cardOverride.density, p: cardOverride.palette, m: cardOverride.mode, n: cardOverride.navicons, f: cardOverride.font, o: cardOverride.overriddenFlag }, { d: 'comfortable', p: '02', m: '', n: '', f: '', o: true }), cardOverride);
    check('ac1', `${key}: login/c card shows its lock (comfortable, 05, f2, light, icons on) and note`, eq({ d: cardLocked.density, p: cardLocked.palette, m: cardLocked.mode, n: cardLocked.navicons, f: cardLocked.font, l: cardLocked.lockedFlag, note: cardLocked.note }, { d: 'comfortable', p: '05', m: 'light', n: 'on', f: 'f2', l: true, note: 'Client prefers this split layout for the sign-in page.' }), cardLocked);
    check('ac1', `${key}: notes panel shows the general note and both per-screen notes`, notes.general === 'Synthetic sample state for the embed fixture — no client data.' && eq(notes.perScreen, ['dashboard/a', 'login/c']), notes);
    await page.locator(key === 'src' ? '#frame-src' : '#frame-srcdoc').screenshot({ path: path.join(dir, `${key}.png`) });
  }
  check('ac1', 'no request left the fixture', net.aborted.length === 0, net.aborted);
  writeJson(path.join(dir, 'dom.json'), { sample: 'scripts/fixtures/sample-state.json', frames: dom, abortedRequests: net.aborted });
  await ctx.close();
}

// ============ AC2 — every change posts the full new state; nothing is written to browser storage ============
async function editFlow(page, f, key) {
  const steps = [];
  const step = async (reason, act) => { const before = (await stateMsgs(page, key)).length; await act(); const got = await waitStates(page, key, before + 1); steps.push({ reason, got: got.length - before }); };
  await step('lock', () => f.locator('.sb-ov[data-id="dashboard/a"] .sb-lockbtn').dispatchEvent('click'));
  await step('unlock', () => f.locator('.sb-ov[data-id="dashboard/a"] .sb-lockbtn').dispatchEvent('click'));
  await openCard(f, 'login/b');
  await step('override', () => f.locator('.sb-pop [data-field="density"] button[data-val="comfortable"]').dispatchEvent('click'));
  await step('note', () => f.locator('.sb-pop .sb-note').fill('AC2 per-screen note on login/b'));
  await f.locator('.sb-notesbtn').dispatchEvent('click');
  await step('general', () => f.locator('.sb-general').fill('AC2 general note'));
  await sleep(800);   // anything late (a debounce, a second post) would show up here
  return steps;
}
function assertFlowMessages(ac, label, msgs) {
  const reasons = msgs.map(m => m.msg.reason);
  check(ac, `${label}: exactly 5 state messages, reasons lock, unlock, override, note, general`, eq(reasons, ['lock', 'unlock', 'override', 'note', 'general']), reasons);
  check(ac, `${label}: every message is v: 1 with the full serialize() shape (v 2, client, bar, ov, locks, notes, general, savedAt)`, msgs.every(m => m.msg.v === 1 && m.msg.type === 'design-sandbox:state' && eq(Object.keys(m.msg.state).sort(), STATE_KEYS) && m.msg.state.v === 2), msgs.map(m => Object.keys(m.msg.state || {})));
  check(ac, `${label}: every message still carries the sample's locks, notes and general note (full state, not a diff)`, msgs.every((m, i) => live(m.msg.state.locks['login/c']) && live(m.msg.state.locks['dashboard/b~m']) && live(m.msg.state.notes['dashboard/a']) && (i === 4 || m.msg.state.general.text === SAMPLE.general.text)));
  const [l, u, o, n, g] = msgs.map(m => m.msg.state);
  if (msgs.length === 5) {
    check(ac, `${label}: lock message has dashboard/a locked`, live(l.locks['dashboard/a']), l.locks['dashboard/a']);
    check(ac, `${label}: unlock message has dashboard/a's lock as a tombstone`, u.locks['dashboard/a'] && u.locks['dashboard/a']._del === true, u.locks['dashboard/a']);
    check(ac, `${label}: override message has login/b density comfortable`, o.ov['login/b'] && o.ov['login/b'].density === 'comfortable', o.ov['login/b']);
    check(ac, `${label}: note message has login/b's note`, n.notes['login/b'] && n.notes['login/b'].text === 'AC2 per-screen note on login/b', n.notes['login/b']);
    check(ac, `${label}: general message has the general note`, g.general.text === 'AC2 general note', g.general);
  }
}
if (want('ac2')) {
  const dir = dirFor('ac2-bridge-messages');
  // (1) the fixture's own frame: sandbox="allow-scripts" (storage is blocked by the browser there)
  const a = await newContext();
  const A = await openFixture(a.ctx);
  await A.page.evaluate(() => window.embedHost.sendSample()); await settle(A.frames.src);
  const stepsA = await editFlow(A.page, A.frames.src, 'src');
  const msgsA = await stateMsgs(A.page, 'src');
  assertFlowMessages('ac2', 'sandboxed src frame', msgsA);
  const storA = await A.frames.src.evaluate(() => { let access; try { access = { length: localStorage.length }; } catch (e) { access = { blocked: e.name }; } return { setItemCalls: window.__setItemCalls, localStorage: access }; });
  check('ac2', 'sandboxed src frame: Storage.prototype.setItem called 0 times', storA.setItemCalls === 0, storA);
  // (2) the same page in an un-sandboxed src frame, where storage is reachable — still nothing written
  const b = await newContext();
  const B = await openFixture(b.ctx, { query: '?sandbox=off' });
  const sandboxAttr = await B.page.evaluate(() => document.getElementById('frame-src').getAttribute('sandbox'));
  check('ac2', 'un-sandboxed run: frame (a) has no sandbox attribute', sandboxAttr === null, sandboxAttr);
  await B.page.evaluate(() => window.embedHost.sendSample()); await settle(B.frames.src);
  const stepsB = await editFlow(B.page, B.frames.src, 'src');
  const msgsB = await stateMsgs(B.page, 'src');
  assertFlowMessages('ac2', 'un-sandboxed src frame', msgsB);
  const storB = await B.frames.src.evaluate(() => ({ setItemCalls: window.__setItemCalls, localStorageLength: localStorage.length, keys: Object.keys(localStorage), sessionStorageLength: sessionStorage.length }));
  check('ac2', 'un-sandboxed src frame: Storage.prototype.setItem called 0 times', storB.setItemCalls === 0, storB);
  check('ac2', 'un-sandboxed src frame: localStorage.length === 0 and sessionStorage.length === 0', storB.localStorageLength === 0 && storB.sessionStorageLength === 0, storB);
  check('ac2', 'no request left either fixture', a.net.aborted.length === 0 && b.net.aborted.length === 0, [...a.net.aborted, ...b.net.aborted]);
  writeJson(path.join(dir, 'messages.json'), { sandboxed: { steps: stepsA, messages: msgsA }, unsandboxed: { steps: stepsB, messages: msgsB } });
  writeJson(path.join(dir, 'storage.json'), { sandboxed: storA, unsandboxed: storB });
  await a.ctx.close(); await b.ctx.close();
}

// ============ AC3 — read-only: editing controls disabled or hidden; Compare still opens ============
if (want('ac3')) {
  const dir = dirFor('ac3-read-only');
  const { ctx, net } = await newContext();
  const { page, frames } = await openFixture(ctx);
  const f = frames.src;
  await page.evaluate(() => window.embedHost.sendSample()); await settle(f);
  const since = (await hostLog(page)).length;
  await page.evaluate(() => window.embedHost.setReadOnly(true)); await settle(f);
  const initMsg = (await hostLog(page)).slice(since).find(e => e.dir === 'out' && e.msg.type === 'design-sandbox:init');
  check('ac3', 'the host re-sent init with readOnly: true', initMsg && initMsg.msg.readOnly === true);
  await openCard(f, 'login/b');
  const controls = await f.evaluate(() => {
    const all = (sel) => [...document.querySelectorAll(sel)];
    const dis = (sel) => { const els = all(sel); return { n: els.length, disabled: els.every(e => e.disabled), aria: els.every(e => e.getAttribute('aria-disabled') === 'true') }; };
    const hidden = (sel) => { const els = all(sel); return { n: els.length, hidden: els.every(e => getComputedStyle(e).display === 'none') }; };
    return {
      readOnlyFlag: !document.querySelector('.sb-roflag').hidden,
      canvasPadlocks: hidden('.sb-ov .sb-lockbtn'), cardPadlock: hidden('.sb-pop .sb-poplock'),
      barDensity: dis('.sb-bar [data-density]'), barMode: dis('.sb-bar [data-mode]'), barNavicons: dis('.sb-bar [data-navicons]'), barSwatches: dis('.sb-bar .sb-swatch'), barFont: dis('.sb-bar select[data-font]'),
      reset: dis('.sb-resetall'), cardFieldset: dis('.sb-popcontrols'), cardUseSetValues: dis('.sb-popreset'),
      applyBrand: { n: all('.sb-applybrand').length }, notesReadonly: all('.sb-note, .sb-general').every(t => t.readOnly), noteFields: all('.sb-note, .sb-general').length,
      paneSave: { n: all('.sb-panesave').length, aria: all('.sb-panesave').every(e => e.getAttribute('aria-disabled') === 'true') }, paneLock: { n: all('.sb-panelock').length, aria: all('.sb-panelock').every(e => e.getAttribute('aria-disabled') === 'true') },
    };
  });
  check('ac3', 'the Read-only flag shows in the title row', controls.readOnlyFlag);
  check('ac3', 'canvas padlocks (16) and the card padlock are hidden', controls.canvasPadlocks.n === 16 && controls.canvasPadlocks.hidden && controls.cardPadlock.n === 1 && controls.cardPadlock.hidden, [controls.canvasPadlocks, controls.cardPadlock]);
  for (const k of ['barDensity', 'barMode', 'barNavicons', 'barSwatches', 'barFont', 'reset', 'cardFieldset']) check('ac3', `${k}: disabled with aria-disabled="true"`, controls[k].n > 0 && controls[k].disabled && controls[k].aria, controls[k]);
  check('ac3', 'card "Use the set values": disabled with aria-disabled="true"', controls.cardUseSetValues.disabled && controls.cardUseSetValues.aria, controls.cardUseSetValues);
  check('ac3', 'every note field is readonly', controls.noteFields > 0 && controls.notesReadonly, controls.noteFields);
  check('ac3', 'Compare pane Save to screen and padlock carry aria-disabled="true"', controls.paneSave.n === 2 && controls.paneSave.aria && controls.paneLock.n === 2 && controls.paneLock.aria, [controls.paneSave, controls.paneLock]);
  await page.locator('#frame-src').screenshot({ path: path.join(dir, 'controls.png') });

  // attempts through the DOM and the keyboard — none may produce a state message
  const attempts = [];
  const tryDom = async (label, fn, arg) => { await f.evaluate(fn, arg); attempts.push(label); };
  const clickEl = (sel) => { for (const el of document.querySelectorAll(sel)) el.click(); };
  await tryDom('canvas padlock click (dashboard/a)', clickEl, '.sb-ov[data-id="dashboard/a"] .sb-lockbtn');
  await tryDom('card padlock click', clickEl, '.sb-pop .sb-poplock');
  await tryDom('card override click (density comfortable)', clickEl, '.sb-pop [data-field="density"] button[data-val="comfortable"]');
  await tryDom('card "Use the set values"', clickEl, '.sb-pop .sb-popreset');
  await tryDom('card font select change', () => { const s = document.querySelector('.sb-pop select[data-field="font"]'); s.value = 'f5'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await tryDom('card note input event', () => { const t = document.querySelector('.sb-pop .sb-note'); t.value = 'read-only attempt'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await tryDom('bar density/mode/nav icons/swatch clicks', clickEl, '.sb-bar [data-density="comfortable"], .sb-bar [data-mode="light"], .sb-bar [data-navicons="on"], .sb-bar .sb-swatch[data-palette="01"]');
  await tryDom('bar font select change', () => { const s = document.querySelector('.sb-bar select[data-font]'); s.value = 'f1'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await tryDom('Reset click', clickEl, '.sb-resetall');
  await tryDom('Apply brand click (absent in this build: no brand)', clickEl, '.sb-applybrand');
  await f.locator('.sb-title').click();
  await page.keyboard.press('l'); await page.keyboard.press('d'); attempts.push('keys l (card open) and d');
  await f.locator('.sb-notesbtn').dispatchEvent('click');
  controls.clearNotes = await f.evaluate(() => { const b = document.querySelector('.sb-notes .sb-clearnotes'); return { panelOpen: !document.querySelector('.sb-notes').hidden, disabled: b.disabled, aria: b.getAttribute('aria-disabled') === 'true' }; });
  check('ac3', 'notes panel open: Clear notes disabled with aria-disabled="true"', controls.clearNotes.panelOpen && controls.clearNotes.disabled && controls.clearNotes.aria, controls.clearNotes);
  await tryDom('Clear notes clicked twice', clickEl, '.sb-clearnotes'); await tryDom('Clear notes (second click)', clickEl, '.sb-clearnotes');
  await tryDom('general note input event', () => { const t = document.querySelector('.sb-general'); t.value = 'read-only attempt'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await f.locator('.sb-general').focus(); await page.keyboard.type('typed'); await f.locator('.sb-general').blur(); attempts.push('typing into the general note');
  const generalAfter = await f.evaluate(() => document.querySelector('.sb-general').value);

  // Compare: c, then two picks — it must open; pane-local tweaks work; Done offers Discard / Keep comparing only
  await f.locator('.sb-title').click(); await page.keyboard.press('c');
  await f.locator('.sb-screen[data-id="login/a"]').click(); await f.locator('.sb-screen[data-id="login/b"]').click();
  const compareOpen = await f.evaluate(() => !document.querySelector('.sb-compare').hidden);
  check('ac3', 'c + two picks opens Compare', compareOpen);
  await f.locator('.sb-pane[data-pane="0"] [data-pfield="density"] button:not(.on)').click();
  const paneDirty = await f.evaluate(() => document.querySelector('.sb-pane[data-pane="0"]').classList.contains('is-dirty'));
  check('ac3', 'a pane-local tweak still works in Compare', paneDirty);
  const paneButtons = await f.evaluate(() => ({ save: document.querySelector('.sb-pane[data-pane="0"] .sb-panesave').disabled, lock: document.querySelector('.sb-pane[data-pane="0"] .sb-panelock').disabled, lockVisible: getComputedStyle(document.querySelector('.sb-pane[data-pane="0"] .sb-panelock')).display !== 'none' }));
  check('ac3', 'Compare pane Save to screen disabled; pane padlock visible but disabled', paneButtons.save && paneButtons.lock && paneButtons.lockVisible, paneButtons);
  await tryDom('pane Save to screen and pane padlock clicks', clickEl, '.sb-pane[data-pane="0"] .sb-panesave, .sb-pane[data-pane="0"] .sb-panelock');
  await f.locator('.sb-cmpdone').click();
  const confirm = await f.evaluate(() => ({ shown: !document.querySelector('.sb-cmpconfirm').hidden, acts: [...document.querySelectorAll('.sb-cmpconfirmbtns [data-cmpact]')].map(b => b.dataset.cmpact), text: document.querySelector('.sb-cmpconfirmtext').textContent }));
  check('ac3', 'Done with a pane tweak offers Discard / Keep comparing only', confirm.shown && eq(confirm.acts, ['discard', 'back']), confirm);
  await page.locator('#frame-src').screenshot({ path: path.join(dir, 'compare-open.png') });
  await f.locator('.sb-cmpconfirmbtns [data-cmpact="discard"]').click();
  const closed = await f.evaluate(() => document.querySelector('.sb-compare').hidden);
  check('ac3', 'Discard closes Compare', closed);
  await sleep(800);
  const after = (await hostLog(page)).slice(since);
  const stateAfter = after.filter(e => e.dir === 'in' && e.msg.type === 'design-sandbox:state');
  check('ac3', 'zero state messages after read-only was switched on', stateAfter.length === 0, stateAfter.map(e => e.msg.reason));
  check('ac3', 'typing did not change the readonly general note', !generalAfter.includes('typed'), generalAfter);
  check('ac3', 'no request left the fixture', net.aborted.length === 0, net.aborted);
  writeJson(path.join(dir, 'messages.json'), { attempts, controls, compare: { open: compareOpen, paneDirty, paneButtons, confirm }, messagesSinceReadOnly: after, stateMessages: stateAfter.length });
  await ctx.close();
}

// ============ AC4 — chrome follows the host's tokens, fonts and light/dark; mockups identical ============
if (want('ac4')) {
  const dir = dirFor('ac4-chrome-and-mockups');
  const result = { chrome: {}, focus: {}, mockups: {} };
  const { ctx, net } = await newContext({ viewport: { width: 1440, height: 900 } });
  const { page, frames } = await openFixture(ctx);
  const f = frames.src;
  const { TOKENS, FONTS } = await page.evaluate(() => ({ TOKENS: window.embedHost.TOKENS, FONTS: window.embedHost.FONTS }));
  await page.evaluate(() => window.embedHost.sendSample());
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/'/g, '"').trim();
  const readChrome = () => f.evaluate(async () => {
    await document.fonts.ready; const sb = document.querySelector('.sb'), cs = getComputedStyle(sb);
    return { uiBg: cs.getPropertyValue('--ui-bg').trim(), uiFocus: cs.getPropertyValue('--ui-focus').trim(), uiAccent: cs.getPropertyValue('--ui-accent').trim(), fontFamily: cs.fontFamily, background: cs.backgroundColor, dark: sb.classList.contains('dark'), colorScheme: cs.colorScheme, dmSans: document.fonts.check('16px "DM Sans"'), themeToggle: document.querySelectorAll('.sb-theme').length, exportButton: document.querySelectorAll('.sb-exportopen').length, exportModal: document.querySelectorAll('.sb-exportmodal').length };
  });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ['light', 'dark']) {
      await page.evaluate((d) => window.embedHost.setDark(d), mode === 'dark'); await settle(f);
      const c = await readChrome(); result.chrome[`${mode}-${width}`] = c;
      const t = TOKENS[mode];
      check('ac4', `${mode} ${width}: computed --ui-bg on .sb equals the sent ${t['--ui-bg']}`, c.uiBg === t['--ui-bg'], c.uiBg);
      check('ac4', `${mode} ${width}: --ui-focus and --ui-accent equal the sent values`, c.uiFocus === t['--ui-focus'] && c.uiAccent === t['--ui-accent'], [c.uiFocus, c.uiAccent]);
      check('ac4', `${mode} ${width}: font-family on .sb equals the sent fonts.ui`, norm(c.fontFamily) === norm(FONTS.ui), c.fontFamily);
      check('ac4', `${mode} ${width}: .sb.dark ${mode === 'dark' ? 'on' : 'off'} and color-scheme ${mode}`, c.dark === (mode === 'dark') && c.colorScheme === mode, [c.dark, c.colorScheme]);
      check('ac4', `${mode} ${width}: document.fonts.check('16px "DM Sans"') in the frame`, c.dmSans);
      check('ac4', `${mode} ${width}: no theme toggle, Export button or export modal`, c.themeToggle === 0 && c.exportButton === 0 && c.exportModal === 0, c);
      await page.screenshot({ path: path.join(dir, `${mode}-${width}.png`) });
    }
  }
  // focus ring: a Tab-focused bar button in each theme uses --ui-focus
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const mode of ['light', 'dark']) {
    await page.evaluate((d) => window.embedHost.setDark(d), mode === 'dark'); await settle(f);
    await f.locator('.sb-title').click(); await page.keyboard.press('Tab');
    const fr = await f.evaluate(() => {
      const a = document.activeElement, cs = getComputedStyle(a);
      const probe = document.createElement('i'); probe.style.color = 'var(--ui-focus)'; document.querySelector('.sb').appendChild(probe); const focusColor = getComputedStyle(probe).color; probe.remove();
      const r = a.getBoundingClientRect();
      return { element: a.className, inBar: !!a.closest('.sb-bar'), focusVisible: a.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, focusColor, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    });
    result.focus[mode] = fr;
    check('ac4', `focus ${mode}: Tab focuses a bar button with a visible 2px solid ring in --ui-focus (${fr.focusColor})`, fr.inBar && fr.focusVisible && fr.outlineStyle === 'solid' && fr.outlineWidth === '2px' && fr.outlineColor === fr.focusColor, fr);
    const box = await page.locator('#frame-src').boundingBox();
    await page.screenshot({ path: path.join(dir, `focus-${mode}.png`), clip: { x: Math.max(0, box.x + fr.rect.x - 16), y: Math.max(0, box.y + fr.rect.y - 16), width: fr.rect.w + 32, height: fr.rect.h + 32 } });
  }
  check('ac4', 'no request left the fixture', net.aborted.length === 0, net.aborted);
  await ctx.close();

  // mockups: the same state, embedded (Copilot dark tokens) vs standalone — the inner .screen, inset 6px, byte-equal
  const VIEW = { width: 1600, height: 1300 };
  const TARGETS = ['login/a', 'login/c', 'dashboard/b', 'dashboard/b~m'];   // override, lock, follows the bar, locked mobile
  const pin = (fr, id) => fr.evaluate((id) => {
    const l = LAYOUT.find(x => x.id === id); view.s = 1; view.x = 40 - l.x; view.y = 40 - l.y; apply();   // eslint-disable-line no-undef
    // the stage is will-change: transform, so Chromium keeps a raster scale chosen from the page's zoom history;
    // drop the hint on both sides so each re-rasters at exactly scale 1 and only the markup can differ
    document.querySelector('.sb-stage').style.willChange = 'auto';
    for (const el of document.querySelectorAll('.sb-screen')) el.style.visibility = el.dataset.id === id ? '' : 'hidden';
    document.querySelector('.sb-overlays').style.visibility = 'hidden';
    const r = document.querySelector('.sb-screen[data-id="' + id + '"] > .screen').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
  const shoot = async (pageX, fr, offset, id, file) => {
    const r = await pin(fr, id); await fr.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))); await sleep(200);
    const clip = { x: offset.x + r.x + 6, y: offset.y + r.y + 6, width: r.w - 12, height: r.h - 12 };
    const fits = clip.x >= 0 && clip.y >= 0 && clip.x + clip.width <= VIEW.width && clip.y + clip.height <= VIEW.height;
    return { buf: await pageX.screenshot({ path: file, clip }), clip, fits };
  };
  const E = await newContext({ viewport: VIEW });
  const EF = await openFixture(E.ctx, { query: '?frame=full' });
  await EF.page.evaluate(() => { window.embedHost.setDark(true); window.embedHost.sendSample(); }); await settle(EF.frames.src);
  const off = await EF.page.locator('#frame-src').boundingBox();
  // the standalone page in the same edge-to-edge frame shape (un-sandboxed, so it reads the injected localStorage),
  // so both sides go through the same compositing path and only the page itself can differ
  const tmpHost = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mockup-host-'));
  const hostFile = path.join(tmpHost, 'standalone-host.html');
  fs.writeFileSync(hostFile, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}iframe{position:fixed;left:0;top:0;width:100vw;height:100vh;border:0}</style></head><body><iframe id="frame-src" src="${pathToFileURL(STANDALONE).href}"></iframe></body></html>`);
  const S = await newContext({ viewport: VIEW, storage: { [STORE_KEY]: JSON.stringify(SAMPLE) } });
  const SP = await S.ctx.newPage(); await SP.goto(pathToFileURL(hostFile).href);
  const SF = await (await SP.$('#frame-src')).contentFrame(); await SF.waitForFunction(() => document.querySelectorAll('.sb-ov').length > 0); await settle(SF);
  const soff = await SP.locator('#frame-src').boundingBox();
  const sLocked = await SF.evaluate(() => [...document.querySelectorAll('.sb-ov.is-locked')].map(e => e.dataset.id).sort());
  check('ac4', 'standalone page loaded the same state from localStorage (locks login/c, dashboard/b~m)', eq(sLocked, ['dashboard/b~m', 'login/c']), sLocked);
  for (const id of TARGETS) {
    const slug = id.replace(/[^a-z0-9]+/gi, '-');
    const e = await shoot(EF.page, EF.frames.src, off, id, path.join(dir, `mockup-${slug}-embedded.png`));
    const s = await shoot(SP, SF, soff, id, path.join(dir, `mockup-${slug}-standalone.png`));
    const same = Buffer.compare(e.buf, s.buf) === 0;
    result.mockups[id] = { embeddedClip: e.clip, standaloneClip: s.clip, fits: e.fits && s.fits, bytes: [e.buf.length, s.buf.length], byteEqual: same };
    check('ac4', `mockup ${id}: inner .screen fits the ${VIEW.width}×${VIEW.height} viewport in both`, e.fits && s.fits, [e.clip, s.clip]);
    check('ac4', `mockup ${id}: embedded and standalone PNG buffers byte-equal`, same, result.mockups[id]);
  }
  check('ac4', 'no request left either mockup page', E.net.aborted.length === 0 && S.net.aborted.length === 0, [...E.net.aborted, ...S.net.aborted]);
  writeJson(path.join(dir, 'result.json'), { tokensSent: TOKENS, fontsSent: FONTS, ...result });
  await E.ctx.close(); await S.ctx.close(); fs.rmSync(tmpHost, { recursive: true, force: true });
}

// ============ AC5 — the srcdoc + CSP frame works with the network blocked ============
if (want('ac5')) {
  const dir = dirFor('ac5-offline', false);   // verify-fonts.txt (the font check's own output) may live here too
  const { ctx, net } = await newContext();
  const { page, frames } = await openFixture(ctx, { srcdoc: true });
  await page.evaluate(() => window.embedHost.sendSample());
  const f = frames.srcdoc; await settle(f);
  const inFrame = await f.evaluate(async (families) => {
    const fonts = {};
    for (const fam of families) { try { await document.fonts.load(`400 16px "${fam}"`); await document.fonts.load(`600 16px "${fam}"`); } catch {} fonts[fam] = { check: document.fonts.check(`16px "${fam}"`), loadedFaces: [...document.fonts].filter(ff => ff.family.replace(/^"|"$/g, '') === fam && ff.status === 'loaded').length }; }
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return { url: location.href, compatMode: document.compatMode, csp: csp ? csp.content : null, cspViolations: window.__cspViolations, fonts, locked: [...document.querySelectorAll('.sb-ov.is-locked')].map(e => e.dataset.id).sort() };
  }, FAMILIES);
  check('ac5', 'frame (b) is the srcdoc document with the CSP meta, in standards mode', inFrame.url === 'about:srcdoc' && !!inFrame.csp && inFrame.csp.startsWith("default-src 'none'") && inFrame.compatMode === 'CSS1Compat', { url: inFrame.url, csp: inFrame.csp, compatMode: inFrame.compatMode });
  check('ac5', 'frame (b) rendered the sent state (locks login/c, dashboard/b~m)', eq(inFrame.locked, ['dashboard/b~m', 'login/c']), inFrame.locked);
  for (const fam of FAMILIES) check('ac5', `frame (b): document.fonts.check("${fam}") with a loaded face`, inFrame.fonts[fam].check && inFrame.fonts[fam].loadedFaces > 0, inFrame.fonts[fam]);
  check('ac5', 'frame (b): zero CSP violations', inFrame.cspViolations.length === 0, inFrame.cspViolations);
  check('ac5', 'zero aborted (non-file:/data:) requests', net.aborted.length === 0, net.aborted);
  writeJson(path.join(dir, 'srcdoc-network.json'), { blockedExcept: ['file:', 'data:'], requests: net.requests, aborted: net.aborted, frame: inFrame });
  await ctx.close();
}

// ============ AC6 — standalone regression against 4c05b19 ============
if (want('ac6')) {
  const dir = dirFor('ac6-standalone-regression');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-baseline-'));
  const baseline = path.join(tmp, 'design-sandbox.html');
  fs.writeFileSync(baseline, execFileSync('git', ['show', `${BASELINE_REF}:prebuilt/design-sandbox.html`], { cwd: ROOT, maxBuffer: 64 << 20 }));
  const pages = { baseline, new: STANDALONE };
  const flows = {}, exportsText = {}, aborted = [];
  for (const [name, file] of Object.entries(pages)) {
    const { ctx, net } = await newContext({ storage: { [STORE_KEY]: JSON.stringify(SAMPLE) } });
    const p = await ctx.newPage(); await p.goto(pathToFileURL(file).href); await settle(p.mainFrame());
    // lock → Compare → Save to screen → note
    await p.locator('.sb-ov[data-id="dashboard/a"] .sb-lockbtn').dispatchEvent('click');
    await p.locator('.sb-comparebtn').dispatchEvent('click');
    await p.locator('.sb-ov[data-id="login/b"] .sb-pick').dispatchEvent('click');
    await p.locator('.sb-ov[data-id="login/d"] .sb-pick').dispatchEvent('click');
    const opened = await p.evaluate(() => !document.querySelector('.sb-compare').hidden);
    await p.locator('.sb-pane[data-pane="0"] [data-pfield="mode"] button:not(.on)').click();
    await p.locator('.sb-pane[data-pane="0"] .sb-panesave').click();
    await p.locator('.sb-cmpdone').click();
    const closed = await p.evaluate(() => document.querySelector('.sb-compare').hidden);
    await p.locator('.sb-ov[data-id="login/b"] .sb-pick').dispatchEvent('click');
    await p.locator('.sb-pop .sb-note').fill('AC6 note after Compare');
    await sleep(700);
    flows[name] = { opened, closed, state: await p.evaluate(() => serialize()), stored: await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORE_KEY) };   // eslint-disable-line no-undef
    exportsText[name] = await p.evaluate(() => [designText(), htmlText()]);   // eslint-disable-line no-undef
    aborted.push(...net.aborted);
    await ctx.close();
  }
  const dateless = (t) => t.replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD');
  check('ac6', 'the flow opened and closed Compare in both pages', flows.baseline.opened && flows.baseline.closed && flows.new.opened && flows.new.closed, { baseline: [flows.baseline.opened, flows.baseline.closed], new: [flows.new.opened, flows.new.closed] });
  check('ac6', 'the flow left equal serialize() (modulo at/savedAt)', eq(stripAt(flows.baseline.state), stripAt(flows.new.state)), { baseline: stripAt(flows.baseline.state), new: stripAt(flows.new.state) });
  check('ac6', 'the flow changed the state as expected (dashboard/a locked, login/b saved look and note)', live(flows.new.state.locks['dashboard/a']) && live(flows.new.state.ov['login/b']) && flows.new.state.notes['login/b'] && flows.new.state.notes['login/b'].text === 'AC6 note after Compare', { locks: flows.new.state.locks['dashboard/a'], ov: flows.new.state.ov['login/b'] });
  check('ac6', 'both pages persisted the same state to localStorage (modulo at/savedAt)', eq(stripAt(flows.baseline.stored), stripAt(flows.new.stored)));
  check('ac6', 'designText() equal modulo the date', dateless(exportsText.baseline[0]) === dateless(exportsText.new[0]), [exportsText.baseline[0].length, exportsText.new[0].length]);
  check('ac6', 'htmlText() equal modulo the date', dateless(exportsText.baseline[1]) === dateless(exportsText.new[1]), [exportsText.baseline[1].length, exportsText.new[1].length]);
  // look: a fresh load of each page with the flow's final state, light and dark page theme, byte-equal
  const shots = {};
  const finalState = JSON.stringify(flows.new.state);
  for (const mode of ['light', 'dark']) {
    const bufs = {};
    for (const [name, file] of Object.entries(pages)) {
      const { ctx, net } = await newContext({ storage: { [STORE_KEY]: finalState, 'sb-theme': mode } });
      const p = await ctx.newPage(); await p.goto(pathToFileURL(file).href); await settle(p.mainFrame());
      // same raster normalisation on both sides as AC4: re-raster the will-change stage at its final scale
      await p.evaluate(() => { document.querySelector('.sb-stage').style.willChange = 'auto'; return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); }); await sleep(300);
      bufs[name] = await p.screenshot({ path: path.join(dir, `${name}-${mode}.png`), fullPage: true });
      aborted.push(...net.aborted);
      await ctx.close();
    }
    shots[mode] = { byteEqual: Buffer.compare(bufs.baseline, bufs.new) === 0, bytes: [bufs.baseline.length, bufs.new.length] };
    check('ac6', `fresh load with the final state, ${mode}: baseline and new full-page screenshots byte-equal`, shots[mode].byteEqual, shots[mode]);
  }
  check('ac6', 'no request left either page', aborted.length === 0, aborted);
  writeJson(path.join(dir, 'result.json'), { baseline: `git show ${BASELINE_REF}:prebuilt/design-sandbox.html (temp, not committed)`, flow: 'lock dashboard/a → Compare login/b vs login/d → pane 0 mode tweak → Save to screen → Done → note on login/b', serializeEqual: eq(stripAt(flows.baseline.state), stripAt(flows.new.state)), finalState: flows.new.state, exportsEqual: { designText: dateless(exportsText.baseline[0]) === dateless(exportsText.new[0]), htmlText: dateless(exportsText.baseline[1]) === dateless(exportsText.new[1]) }, screenshots: shots });
  fs.rmSync(tmp, { recursive: true, force: true });
}

await browser.close();
const failed = results.filter(r => !r.ok);
const byAc = {};
for (const r of results) { byAc[r.ac] = byAc[r.ac] || { pass: 0, fail: 0 }; byAc[r.ac][r.ok ? 'pass' : 'fail']++; }
console.log('');
for (const [ac, c] of Object.entries(byAc)) console.log(`${c.fail ? 'FAIL' : 'PASS'}  ${ac.toUpperCase()}  ${c.pass} passed, ${c.fail} failed`);
console.log(`${failed.length ? 'FAIL' : 'PASS'}  verify-embedded: ${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
