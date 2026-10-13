#!/usr/bin/env node
// verify-fonts.mjs — maintainer check: open design-sandbox.html with ALL network blocked and
// confirm each of the five pairs really renders from the inlined files, not the fallback stack.
//   node scripts/verify-fonts.mjs <path-to-design-sandbox.html>
// Exits 1 if any family fails to load or any request tried to leave the page.
import { chromium } from 'playwright';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'prebuilt/design-sandbox.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const leaked = [];
await page.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('file://') || u.startsWith('data:')) return route.continue();
  leaked.push(u); route.abort();
});
await page.goto('file://' + file);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  await document.fonts.ready;
  const families = ['Manrope', 'Public Sans', 'DM Serif Display', 'DM Sans', 'Space Grotesk', 'IBM Plex Sans', 'Playfair Display', 'Source Sans 3', 'Nunito', 'Nunito Sans'];
  const out = {};
  for (const f of families) {
    // Force a load of the weights the screens use, then ask the font set what it has.
    try { await document.fonts.load(`600 16px "${f}"`); await document.fonts.load(`400 16px "${f}"`); } catch {}
    out[f] = { check: document.fonts.check(`16px "${f}"`), loaded: [...document.fonts].filter(ff => ff.family.replace(/^"|"$/g, '') === f && ff.status === 'loaded').length };
  }
  return out;
});

let ok = true;
for (const [f, r] of Object.entries(result)) { const pass = r.check && r.loaded > 0; ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${f.padEnd(18)} loaded faces: ${r.loaded}`); }
if (leaked.length) { ok = false; console.log('Network requests attempted (should be none):'); leaked.slice(0, 10).forEach(u => console.log('  ' + u)); }
else console.log('No network requests left the page.');

// A rendered proof: switch the bar through the five pairs and measure a heading's width — a
// fallback font gives a different width than the real one, so five distinct widths is a good sign.
const widths = await page.evaluate(async () => {
  const sel = document.querySelector('select[data-font]'); const out = {};
  for (const o of [...sel.options]) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await document.fonts.ready; await new Promise(r => setTimeout(r, 50));
    const h = document.querySelector('.sb-screen .screen h1, .sb-screen .screen h2'); const r = document.createRange(); r.selectNodeContents(h);
    out[o.textContent] = { family: getComputedStyle(h).fontFamily.split(',')[0], textWidth: Math.round(r.getBoundingClientRect().width * 10) / 10 }; }
  return out;
});
console.log('Heading text width per pair (should differ):', widths);
if (new Set(Object.values(widths).map(w => w.textWidth)).size < Object.keys(widths).length) { ok = false; console.log('FAIL  some pairs render at the same width — a fallback font is likely in use'); }
await browser.close();
process.exit(ok ? 0 : 1);
