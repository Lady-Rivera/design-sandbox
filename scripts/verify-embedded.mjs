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
const STATE_KEYS = ['bar', 'client', 'general', 'locks', 'notes', 'ov', 'savedAt', 'v'];

const ACS = ['ac1', 'ac2', 'ac3', 'ac4', 'ac5', 'ac6'];
const only = (() => {
  const i = process.argv.indexOf('--only'); if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) { console.error(`verify-embedded: --only needs a comma-separated list drawn from ${ACS.join(', ')}`); process.exit(2); }
  const list = v.split(',').map(x => x.trim()).filter(Boolean), bad = list.filter(x => !ACS.includes(x));
  if (!list.length || bad.length) { console.error(`verify-embedded: unknown --only value ${JSON.stringify(bad.length ? bad.join(',') : v)}; expected some of ${ACS.join(', ')}`); process.exit(2); }
  return list;
})();
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
async function waitStates(ac, page, frame, n, since = 0, timeout = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const m = await stateMsgs(page, frame, since); if (m.length >= n) return m; await sleep(50); }
  const m = await stateMsgs(page, frame, since);
  check(ac, `timed out waiting for ${n} state messages (got ${m.length})`, false);
  return m;
}
// host-log entries matching pred since an index, polled until at least one arrives or the timeout passes
async function waitLog(page, pred, since, timeout = 2000) {
  const t0 = Date.now();
  for (;;) { const m = (await hostLog(page)).slice(since).filter(pred); if (m.length || Date.now() - t0 >= timeout) return m; await sleep(50); }
}
// settle: wait until the frame shows the expected DOM state (a FAIL line on timeout), then for its fonts
async function settle(ac, frame, label, fn, arg, timeout = 10000) {
  try { await frame.waitForFunction(fn, arg, { timeout, polling: 50 }); }
  catch { check(ac, `timed out after ${timeout} ms waiting for ${label}`, false); return false; }
  await frame.evaluate(() => document.fonts.ready); return true;
}
const live = (e) => !!(e && !e._del);
const lockCount = (n) => [`${n} locked screens on the canvas`, (k) => document.querySelectorAll('.sb-ov').length > 0 && document.querySelectorAll('.sb-ov.is-locked').length === k, n];
const SAMPLE_LOCKS = Object.values(SAMPLE.locks).filter(live).length;
const darkIs = (d) => [`the page ${d ? 'dark' : 'light'}`, (x) => document.querySelector('.sb').classList.contains('dark') === x, d];
const readOnlyIs = (ro) => [`the page ${ro ? 'read-only' : 'editable'}`, (x) => document.querySelector('.sb').classList.contains('readonly') === x, ro];
// barrier: the page handles messages in order, so once a theme carrying a fresh marker token is applied,
// everything posted before it has been handled
let markerN = 0;
async function barrier(page, frame, key = 'src') {
  const m = 'sync-' + (++markerN);
  await page.evaluate(([k, x]) => window.embedHost.post(k, { type: 'design-sandbox:theme', theme: { dark: false, tokens: { '--ui-sync-marker': x } } }), [key, m]);
  await frame.waitForFunction((x) => document.querySelector('.sb').style.getPropertyValue('--ui-sync-marker') === x, m, { timeout: 5000 });
}
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
    const f = frames[key]; await settle('ac1', f, ...lockCount(SAMPLE_LOCKS));
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
async function editFlow(ac, page, f, key) {
  const steps = [];
  const step = async (reason, act) => { const before = (await stateMsgs(page, key)).length; await act(); const got = await waitStates(ac, page, key, before + 1); steps.push({ reason, got: got.length - before }); };
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
  check(ac, `${label}: every message carries client null (the build's CLIENT, as the host sent none)`, msgs.length > 0 && msgs.every(m => m.msg.state.client === null), msgs.map(m => m.msg.state.client));
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
  await A.page.evaluate(() => window.embedHost.sendSample()); await settle('ac2', A.frames.src, ...lockCount(SAMPLE_LOCKS));
  const stepsA = await editFlow('ac2', A.page, A.frames.src, 'src');
  const msgsA = await stateMsgs(A.page, 'src');
  assertFlowMessages('ac2', 'sandboxed src frame', msgsA);
  const storA = await A.frames.src.evaluate(() => { let access; try { access = { length: localStorage.length }; } catch (e) { access = { blocked: e.name }; } return { setItemCalls: window.__setItemCalls, localStorage: access }; });
  check('ac2', 'sandboxed src frame: Storage.prototype.setItem called 0 times', storA.setItemCalls === 0, storA);
  // (2) the same page in an un-sandboxed src frame, where storage is reachable — still nothing written
  const b = await newContext();
  const B = await openFixture(b.ctx, { query: '?sandbox=off' });
  const sandboxAttr = await B.page.evaluate(() => document.getElementById('frame-src').getAttribute('sandbox'));
  check('ac2', 'un-sandboxed run: frame (a) has no sandbox attribute', sandboxAttr === null, sandboxAttr);
  await B.page.evaluate(() => window.embedHost.sendSample()); await settle('ac2', B.frames.src, ...lockCount(SAMPLE_LOCKS));
  const stepsB = await editFlow('ac2', B.page, B.frames.src, 'src');
  const msgsB = await stateMsgs(B.page, 'src');
  assertFlowMessages('ac2', 'un-sandboxed src frame', msgsB);
  const storB = await B.frames.src.evaluate(() => ({ setItemCalls: window.__setItemCalls, localStorageLength: localStorage.length, keys: Object.keys(localStorage), sessionStorageLength: sessionStorage.length }));
  check('ac2', 'un-sandboxed src frame: Storage.prototype.setItem called 0 times', storB.setItemCalls === 0, storB);
  check('ac2', 'un-sandboxed src frame: localStorage.length === 0 and sessionStorage.length === 0', storB.localStorageLength === 0 && storB.sessionStorageLength === 0, storB);
  check('ac2', 'no request left either fixture', a.net.aborted.length === 0 && b.net.aborted.length === 0, [...a.net.aborted, ...b.net.aborted]);
  writeJson(path.join(dir, 'messages.json'), { sandboxed: { steps: stepsA, messages: msgsA }, unsandboxed: { steps: stepsB, messages: msgsB } });
  writeJson(path.join(dir, 'storage.json'), { sandboxed: storA, unsandboxed: storB });
  await a.ctx.close(); await b.ctx.close();

  // (3) a theme message mid-typing never drops the note; the host's client round-trips
  const c = await newContext();
  const C = await openFixture(c.ctx); const cf = C.frames.src;
  await C.page.evaluate(() => window.embedHost.sendSample()); await settle('ac2', cf, ...lockCount(SAMPLE_LOCKS));
  await cf.locator('.sb-notesbtn').dispatchEvent('click');
  const sinceT = (await stateMsgs(C.page, 'src')).length;
  const TYPED = 'Typed just before a theme change';
  const t0 = Date.now();
  await cf.locator('.sb-general').fill(TYPED);
  await C.page.evaluate(() => window.embedHost.setDark(true));
  const themeAfter = Date.now() - t0;
  check('ac2', `theme mid-typing: the theme message went out ${themeAfter} ms after the typing (inside the 400 ms debounce)`, themeAfter < 400, themeAfter);
  await waitStates('ac2', C.page, 'src', sinceT + 1); await sleep(800);
  const typed = (await stateMsgs(C.page, 'src')).slice(sinceT).map(m => ({ reason: m.msg.reason, general: m.msg.state.general && m.msg.state.general.text }));
  check('ac2', 'theme mid-typing: exactly one state message, reason general, carrying the typed text', eq(typed, [{ reason: 'general', general: TYPED }]), typed);
  const kept = await cf.evaluate(() => ({ value: document.querySelector('.sb-general').value, dark: document.querySelector('.sb').classList.contains('dark') }));
  check('ac2', 'theme mid-typing: the general note textarea keeps the typed text, and the theme applied', kept.value === TYPED && kept.dark, kept);
  const CLIENT_SENT = 'Round Trip Co (synthetic)';
  await C.page.evaluate((s) => window.embedHost.sendInit('src', s, false), { ...SAMPLE, client: CLIENT_SENT });
  await barrier(C.page, cf);
  const sinceC = (await stateMsgs(C.page, 'src')).length;
  await cf.locator('.sb-title').click(); await C.page.keyboard.press('d');
  const cm = (await waitStates('ac2', C.page, 'src', sinceC + 1)).slice(sinceC);
  check('ac2', 'client round-trips: after an init whose state carries a client, the next state message carries that client', cm.length === 1 && cm[0].msg.state.client === CLIENT_SENT, cm.map(m => m.msg.state.client));
  check('ac2', 'no request left the theme/client fixture', c.net.aborted.length === 0, c.net.aborted);
  writeJson(path.join(dir, 'theme-and-client.json'), { themeSentMsAfterTyping: themeAfter, messagesAfterTyping: typed, textarea: kept, clientSent: CLIENT_SENT, clientPosted: cm.map(m => m.msg.state.client) });
  await c.ctx.close();
}

// ============ AC3 — read-only: editing controls disabled or hidden; Compare still opens ============
if (want('ac3')) {
  const dir = dirFor('ac3-read-only');
  const { ctx, net } = await newContext();
  const { page, frames } = await openFixture(ctx);
  const f = frames.src;
  await page.evaluate(() => window.embedHost.sendSample()); await settle('ac3', f, ...lockCount(SAMPLE_LOCKS));
  // positive control, still editable: the l key (card open) and the d key each post a state message
  await openCard(f, 'login/b'); await f.locator('.sb-title').click();
  const posBefore = (await stateMsgs(page, 'src')).length; let posN = 0;
  for (const k of ['l', 'l', 'd', 'd']) { await page.keyboard.press(k); await waitStates('ac3', page, 'src', posBefore + ++posN); }
  const positive = (await stateMsgs(page, 'src')).slice(posBefore).map(m => m.msg.reason);
  check('ac3', 'positive control (editable): keys l (card open) and d each post a state message — lock, unlock, bar, bar', eq(positive, ['lock', 'unlock', 'bar', 'bar']), positive);
  const since = (await hostLog(page)).length;
  await page.evaluate(() => window.embedHost.setReadOnly(true)); await settle('ac3', f, ...readOnlyIs(true));
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
      reset: dis('.sb-resetall'), cardFieldset: dis('.sb-popcontrols'), cardUseSetValues: dis('.sb-popreset'), screens: all('.sb-screen').length,
      applyBrand: dis('.sb-applybrand'), notesReadonly: all('.sb-note, .sb-general').every(t => t.readOnly), noteFields: all('.sb-note, .sb-general').length,
      paneSave: { n: all('.sb-panesave').length, aria: all('.sb-panesave').every(e => e.getAttribute('aria-disabled') === 'true') }, paneLock: { n: all('.sb-panelock').length, aria: all('.sb-panelock').every(e => e.getAttribute('aria-disabled') === 'true') },
    };
  });
  check('ac3', 'the Read-only flag shows in the title row', controls.readOnlyFlag);
  check('ac3', `canvas padlocks (one per screen, ${controls.screens}) and the card padlock are hidden`, controls.canvasPadlocks.n > 0 && controls.canvasPadlocks.n === controls.screens && controls.canvasPadlocks.hidden && controls.cardPadlock.n === 1 && controls.cardPadlock.hidden, [controls.canvasPadlocks, controls.cardPadlock]);
  for (const k of ['barDensity', 'barMode', 'barNavicons', 'barSwatches', 'barFont', 'reset', 'cardFieldset']) check('ac3', `${k}: disabled with aria-disabled="true"`, controls[k].n > 0 && controls[k].disabled && controls[k].aria, controls[k]);
  check('ac3', 'Apply brand: absent from this build, or disabled with aria-disabled="true"', controls.applyBrand.n === 0 || (controls.applyBrand.disabled && controls.applyBrand.aria), controls.applyBrand);
  check('ac3', 'card "Use the set values": disabled with aria-disabled="true"', controls.cardUseSetValues.n > 0 && controls.cardUseSetValues.disabled && controls.cardUseSetValues.aria, controls.cardUseSetValues);
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
  await tryDom('Clear notes (first click)', clickEl, '.sb-clearnotes'); await tryDom('Clear notes (second click)', clickEl, '.sb-clearnotes');
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
  writeJson(path.join(dir, 'messages.json'), { positiveControl: positive, attempts, controls, compare: { open: compareOpen, paneDirty, paneButtons, confirm }, messagesSinceReadOnly: after, stateMessages: stateAfter.length });
  await ctx.close();

  // ---- unrecognised states stay read-only; readOnly is editable only when it is exactly false ----
  const evidence = { badFirstInit: {}, badReInit: null, readOnlyValues: {}, nullState: null, fixtureReadOnlyBeforeState: null };
  const readMode = (fr) => fr.evaluate(() => ({ readOnly: document.querySelector('.sb').classList.contains('readonly'), flag: !document.querySelector('.sb-roflag').hidden, locked: [...document.querySelectorAll('.sb-ov.is-locked')].map(e => e.dataset.id).sort(), noteDots: [...document.querySelectorAll('.sb-ov')].filter(e => !e.querySelector('.sb-notedot').hidden).map(e => e.dataset.id).sort() }));
  const sendRaw = (pg, msg) => pg.evaluate((m) => window.embedHost.post('src', m), msg);
  const isErr = (e) => e.frame === 'src' && e.dir === 'in' && e.msg.type === 'design-sandbox:error';
  const badStateErr = (errs) => errs.length === 1 && errs[0].msg.v === 1 && errs[0].msg.code === 'bad-state' && typeof errs[0].msg.message === 'string' && errs[0].msg.message.length > 0;
  // edit attempts: a padlock click, bar clicks and the d key — then the 800 ms window for anything late
  async function tryEdits(pg, fr) {
    const before = (await stateMsgs(pg, 'src')).length;
    await fr.evaluate(() => { for (const el of document.querySelectorAll('.sb-ov[data-id="dashboard/a"] .sb-lockbtn, .sb-bar [data-navicons="off"], .sb-bar [data-navicons="on"]')) el.click(); });
    await fr.locator('.sb-title').click(); await pg.keyboard.press('d'); await sleep(800);
    return (await stateMsgs(pg, 'src')).slice(before).map(m => m.msg.reason);
  }
  const BAD = [
    ['a JSON string', JSON.stringify(SAMPLE)],
    ['v: 3', { ...SAMPLE, v: 3 }],
    ['general.text: 5', { ...SAMPLE, general: { text: 5, at: 1760000600000 } }],
    ['a lock entry that is a string', { ...SAMPLE, locks: { ...SAMPLE.locks, 'login/a': 'locked' } }],
  ];
  const nets = [];
  for (const [label, bad] of BAD) {
    const X = await newContext(); nets.push(X.net);
    const { page: xp, frames: xf } = await openFixture(X.ctx); const fr = xf.src;
    const since0 = (await hostLog(xp)).length;
    await sendRaw(xp, { type: 'design-sandbox:init', state: bad, readOnly: false }); await barrier(xp, fr);
    const mode = await readMode(fr), errs = await waitLog(xp, isErr, since0), posted = await tryEdits(xp, fr);
    evidence.badFirstInit[label] = { mode, errors: errs.map(e => e.msg), stateMessages: posted };
    check('ac3', `bad state (${label}) with readOnly: false: the page stays read-only, flag shown`, mode.readOnly && mode.flag, mode);
    check('ac3', `bad state (${label}): the default canvas (no locks, no notes)`, mode.locked.length === 0 && mode.noteDots.length === 0, mode);
    check('ac3', `bad state (${label}): posts design-sandbox:error { v: 1, code: "bad-state", message }`, badStateErr(errs), errs.map(e => e.msg));
    check('ac3', `bad state (${label}): a padlock click, bar clicks and the d key post no state`, posted.length === 0, posted);
    await X.ctx.close();
  }
  // a failed re-init keeps the current state and makes the page read-only; a later valid init recovers
  {
    const X = await newContext(); nets.push(X.net);
    const { page: xp, frames: xf } = await openFixture(X.ctx); const fr = xf.src;
    await xp.evaluate(() => window.embedHost.sendSample()); await settle('ac3', fr, ...lockCount(SAMPLE_LOCKS)); await settle('ac3', fr, ...readOnlyIs(false));
    const since0 = (await hostLog(xp)).length;
    await sendRaw(xp, { type: 'design-sandbox:init', state: { ...SAMPLE, v: 3 }, readOnly: false }); await barrier(xp, fr);
    const mode = await readMode(fr), errs = await waitLog(xp, isErr, since0), posted = await tryEdits(xp, fr);
    check('ac3', 'failed re-init (v: 3) after a valid one: read-only, flag shown', mode.readOnly && mode.flag, mode);
    check('ac3', 'failed re-init: the previous state is not wiped (locks login/c, dashboard/b~m; note dots dashboard/a, login/c)', eq(mode.locked, ['dashboard/b~m', 'login/c']) && eq(mode.noteDots, ['dashboard/a', 'login/c']), mode);
    check('ac3', 'failed re-init: posts design-sandbox:error code bad-state', badStateErr(errs), errs.map(e => e.msg));
    check('ac3', 'failed re-init: edit attempts post no state', posted.length === 0, posted);
    await xp.evaluate((s) => window.embedHost.sendInit('src', s, false), SAMPLE); await barrier(xp, fr);
    const beforeR = (await stateMsgs(xp, 'src')).length;
    await fr.locator('.sb-title').click(); await xp.keyboard.press('d');
    const rec = (await waitStates('ac3', xp, 'src', beforeR + 1)).slice(beforeR);
    check('ac3', 'a later valid init makes the page editable again: the d key posts one state with the sample locks', rec.length === 1 && rec[0].msg.reason === 'bar' && live(rec[0].msg.state.locks['login/c']) && live(rec[0].msg.state.locks['dashboard/b~m']), rec.map(m => m.msg.reason));
    evidence.badReInit = { mode, errors: errs.map(e => e.msg), stateMessagesWhileBad: posted, afterValidInit: rec.map(m => m.msg.reason) };
    await X.ctx.close();
  }
  // readOnly fail-safe, the fixture's read-only toggle before any state, and a null state
  {
    const X = await newContext(); nets.push(X.net);
    const { page: xp, frames: xf } = await openFixture(X.ctx); const fr = xf.src;
    const sinceF = (await hostLog(xp)).length;
    await xp.evaluate(() => { window.embedHost.setReadOnly(true); window.embedHost.setReadOnly(false); });
    const outInits = (await hostLog(xp)).slice(sinceF).filter(e => e.frame === 'src' && e.dir === 'out' && e.msg.type === 'design-sandbox:init').map(e => ({ readOnly: e.msg.readOnly, state: e.msg.state }));
    evidence.fixtureReadOnlyBeforeState = outInits;
    check('ac3', 'fixture: Read-only on / off before any state was sent re-sends state: null (never the sample unasked)', outInits.length === 2 && outInits.every(i => i.state === null), outInits.map(i => (i.state === null ? null : 'a state')));
    for (const [label, val] of [['"false"', 'false'], ['missing', undefined], ['1', 1], ['null', null]]) {
      await xp.evaluate((s) => window.embedHost.sendInit('src', s, false), SAMPLE); await barrier(xp, fr);
      const msg = { type: 'design-sandbox:init', state: SAMPLE }; if (label !== 'missing') msg.readOnly = val;
      await sendRaw(xp, msg); await barrier(xp, fr);
      const mode = await readMode(fr), posted = await tryEdits(xp, fr);
      evidence.readOnlyValues[label] = { mode, stateMessages: posted };
      check('ac3', `readOnly ${label}: read-only (only readOnly === false is editable), and edits post no state`, mode.readOnly && mode.flag && posted.length === 0, { mode, posted });
    }
    const sinceN = (await hostLog(xp)).length;
    await sendRaw(xp, { type: 'design-sandbox:init', state: null, readOnly: false }); await barrier(xp, fr);
    const mode = await readMode(fr), errs = await waitLog(xp, isErr, sinceN, 800);
    const beforeN = (await stateMsgs(xp, 'src')).length;
    await fr.locator('.sb-title').click(); await xp.keyboard.press('d');
    const nm = (await waitStates('ac3', xp, 'src', beforeN + 1)).slice(beforeN);
    evidence.nullState = { mode, errors: errs.map(e => e.msg), stateMessages: nm.map(m => m.msg.reason) };
    check('ac3', 'state null with readOnly false: editable default canvas, no error, and the d key posts one state', !mode.readOnly && mode.locked.length === 0 && errs.length === 0 && nm.length === 1, evidence.nullState);
    await X.ctx.close();
  }
  check('ac3', 'no request left the bad-state fixtures', nets.every(n => n.aborted.length === 0), nets.flatMap(n => n.aborted));
  writeJson(path.join(dir, 'bad-states.json'), evidence);
}

// ============ AC4 — chrome follows the host's tokens, fonts and light/dark; mockups identical ============
if (want('ac4')) {
  const dir = dirFor('ac4-chrome-and-mockups');
  const result = { chrome: {}, focus: {}, mockups: {} };
  const { ctx, net } = await newContext({ viewport: { width: 1440, height: 900 } });
  const { page, frames } = await openFixture(ctx);
  const f = frames.src;
  const { TOKENS, FONTS } = await page.evaluate(() => ({ TOKENS: window.embedHost.TOKENS, FONTS: window.embedHost.FONTS }));
  await page.evaluate(() => window.embedHost.sendSample()); await settle('ac4', f, ...lockCount(SAMPLE_LOCKS));
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/'/g, '"').trim();
  const readChrome = () => f.evaluate(async () => {
    await document.fonts.ready; const sb = document.querySelector('.sb'), cs = getComputedStyle(sb);
    return { uiBg: cs.getPropertyValue('--ui-bg').trim(), uiFocus: cs.getPropertyValue('--ui-focus').trim(), uiAccent: cs.getPropertyValue('--ui-accent').trim(), fontFamily: cs.fontFamily, background: cs.backgroundColor, dark: sb.classList.contains('dark'), colorScheme: cs.colorScheme, dmSans: document.fonts.check('16px "DM Sans"'), themeToggle: document.querySelectorAll('.sb-theme').length, exportButton: document.querySelectorAll('.sb-exportopen').length, exportModal: document.querySelectorAll('.sb-exportmodal').length };
  });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ['light', 'dark']) {
      await page.evaluate((d) => window.embedHost.setDark(d), mode === 'dark'); await settle('ac4', f, ...darkIs(mode === 'dark'));
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
    await page.evaluate((d) => window.embedHost.setDark(d), mode === 'dark'); await settle('ac4', f, ...darkIs(mode === 'dark'));
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
    const l = LAYOUT.find(x => x.id === id); view.s = 1; view.x = 40 - l.x; view.y = 40 - l.y; apply();   // LAYOUT, view, apply: the page's own globals
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
  await EF.page.evaluate(() => { window.embedHost.setDark(true); window.embedHost.sendSample(); }); await settle('ac4', EF.frames.src, ...lockCount(SAMPLE_LOCKS)); await settle('ac4', EF.frames.src, ...darkIs(true));
  const off = await EF.page.locator('#frame-src').boundingBox();
  // the standalone page in the same edge-to-edge frame shape (un-sandboxed, so it reads the injected localStorage),
  // so both sides go through the same compositing path and only the page itself can differ
  const tmpHost = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mockup-host-'));
  const hostFile = path.join(tmpHost, 'standalone-host.html');
  fs.writeFileSync(hostFile, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}iframe{position:fixed;left:0;top:0;width:100vw;height:100vh;border:0}</style></head><body><iframe id="frame-src" src="${pathToFileURL(STANDALONE).href}"></iframe></body></html>`);
  const S = await newContext({ viewport: VIEW, storage: { [STORE_KEY]: JSON.stringify(SAMPLE) } });
  const SP = await S.ctx.newPage(); await SP.goto(pathToFileURL(hostFile).href);
  const SF = await (await SP.$('#frame-src')).contentFrame(); await settle('ac4', SF, ...lockCount(SAMPLE_LOCKS));
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
  const f = frames.srcdoc; await settle('ac5', f, ...lockCount(SAMPLE_LOCKS));
  const inFrame = await f.evaluate(async () => {
    // the families come from the page's own @font-face rules (source text, as verify-fonts.mjs reads them)
    const unq = (x) => x.trim().replace(/^["']|["']$/g, ''), families = [];
    for (const st of document.querySelectorAll('style')) for (const m of st.textContent.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/g)) { const x = unq(m[1]); if (x && !families.includes(x)) families.push(x); }
    const fonts = {};
    for (const fam of families) { try { await document.fonts.load(`400 16px "${fam}"`); await document.fonts.load(`600 16px "${fam}"`); } catch {} fonts[fam] = { check: document.fonts.check(`16px "${fam}"`), loadedFaces: [...document.fonts].filter(ff => ff.family.replace(/^"|"$/g, '') === fam && ff.status === 'loaded').length }; }
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return { url: location.href, compatMode: document.compatMode, csp: csp ? csp.content : null, cspViolations: window.__cspViolations, families, fonts, locked: [...document.querySelectorAll('.sb-ov.is-locked')].map(e => e.dataset.id).sort() };
  });
  check('ac5', 'frame (b) is the srcdoc document with the CSP meta, in standards mode', inFrame.url === 'about:srcdoc' && !!inFrame.csp && inFrame.csp.startsWith("default-src 'none'") && inFrame.compatMode === 'CSS1Compat', { url: inFrame.url, csp: inFrame.csp, compatMode: inFrame.compatMode });
  check('ac5', 'frame (b) rendered the sent state (locks login/c, dashboard/b~m)', eq(inFrame.locked, ['dashboard/b~m', 'login/c']), inFrame.locked);
  check('ac5', `frame (b) declares @font-face families (${inFrame.families.length})`, inFrame.families.length > 0, inFrame.families);
  for (const fam of inFrame.families) check('ac5', `frame (b): document.fonts.check("${fam}") with a loaded face`, inFrame.fonts[fam].check && inFrame.fonts[fam].loadedFaces > 0, inFrame.fonts[fam]);
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
    const p = await ctx.newPage(); await p.goto(pathToFileURL(file).href); await settle('ac6', p.mainFrame(), ...lockCount(SAMPLE_LOCKS));
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
    await settle('ac6', p.mainFrame(), `${name}: localStorage holding the login/b note`, (k) => { try { const s = JSON.parse(localStorage.getItem(k)); return !!(s && s.notes && s.notes['login/b'] && s.notes['login/b'].text === 'AC6 note after Compare'); } catch { return false; } }, STORE_KEY);
    // serialize, designText, htmlText: the page's own globals
    flows[name] = { opened, closed, state: await p.evaluate(() => serialize()), stored: await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORE_KEY) };
    exportsText[name] = await p.evaluate(() => [designText(), htmlText()]);
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
      const p = await ctx.newPage(); await p.goto(pathToFileURL(file).href); await settle('ac6', p.mainFrame(), ...lockCount(Object.values(flows.new.state.locks).filter(live).length));
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
if (!results.length) { console.log('FAIL  verify-embedded: zero assertions ran'); process.exit(1); }
const failed = results.filter(r => !r.ok);
const byAc = {};
for (const r of results) { byAc[r.ac] = byAc[r.ac] || { pass: 0, fail: 0 }; byAc[r.ac][r.ok ? 'pass' : 'fail']++; }
console.log('');
for (const [ac, c] of Object.entries(byAc)) console.log(`${c.fail ? 'FAIL' : 'PASS'}  ${ac.toUpperCase()}  ${c.pass} passed, ${c.fail} failed`);
console.log(`${failed.length ? 'FAIL' : 'PASS'}  verify-embedded: ${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
