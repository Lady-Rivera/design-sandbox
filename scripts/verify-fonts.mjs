#!/usr/bin/env node
// verify-fonts.mjs — maintainer check: open a Sandbox page with ALL network blocked and confirm every
// bundled font family really renders from the inlined files, not a fallback.
//   node scripts/verify-fonts.mjs <path-to-design-sandbox.html | design-sandbox.embedded.html>
// For every family named in the page's @font-face rules it (1) loads the family and counts its
// loaded faces, (2) asks document.fonts.check, and (3) renders a long fixed sample string off-screen in
// `'<family>', monospace` and in plain `monospace` — equal widths mean the family fell back.
// It never touches the page's own controls, so it works on the read-only embedded build too.
// Exits 1 if any family fails, if no @font-face rule is found, or if any request tried to leave the page.
import { chromium } from 'playwright';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'prebuilt/design-sandbox.html');
const SAMPLE = 'The quick brown fox jumps over the lazy dog. SPHINX OF BLACK QUARTZ, JUDGE MY VOW! 0123456789';
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

const result = await page.evaluate(async (sample) => {
  await document.fonts.ready;
  const unq = (f) => f.trim().replace(/^["']|["']$/g, '');
  // Families come from the @font-face source text (not the CSSOM), so a rule the browser dropped as
  // invalid — e.g. one whose src went missing — is still listed, and then fails below.
  const families = [];
  for (const st of document.querySelectorAll('style')) {
    for (const m of st.textContent.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/g)) { const f = unq(m[1]); if (f && !families.includes(f)) families.push(f); }
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:nowrap;font-size:32px;font-weight:400';
  document.body.appendChild(host);
  const width = (fam) => { const s = document.createElement('span'); s.style.fontFamily = fam; s.textContent = sample; host.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 100) / 100; };
  const mono = width('monospace');
  const out = {};
  for (const f of families) {
    // Force a load of the weights the screens use, then ask the font set what it has.
    try { await document.fonts.load(`600 16px "${f}"`); await document.fonts.load(`400 16px "${f}"`); await document.fonts.load(`400 32px "${f}"`, sample); } catch {}
    out[f] = {
      check: document.fonts.check(`16px "${f}"`),
      loaded: [...document.fonts].filter(ff => unq(ff.family) === f && ff.status === 'loaded').length,
      width: width(`"${f}", monospace`),
    };
  }
  host.remove();
  return { mono, families: out };
}, SAMPLE);

let ok = true;
const fams = Object.entries(result.families);
console.log(`Sample (${SAMPLE.length} chars) width in the monospace fallback: ${result.mono}px`);
if (!fams.length) { ok = false; console.log('FAIL  no @font-face rules found in the page'); }
for (const [f, r] of fams) {
  const fellBack = r.width === result.mono;
  const pass = r.check && r.loaded > 0 && !fellBack; ok = ok && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${f.padEnd(18)} loaded faces: ${r.loaded}  check: ${r.check}  width: ${r.width}px${fellBack ? '  (same as the monospace fallback)' : ''}`);
}
console.log(`${fams.length} families, ${new Set(fams.map(([, r]) => r.width)).size} distinct sample widths.`);
if (leaked.length) { ok = false; console.log('Network requests attempted (should be none):'); leaked.slice(0, 10).forEach(u => console.log('  ' + u)); }
else console.log('No network requests left the page.');
await browser.close();
process.exit(ok ? 0 : 1);
