#!/usr/bin/env node
/**
 * Design Sandbox — build
 *
 * Assembles the fixed, pre-reviewed screen templates in ../assets into the
 * two deliverable shapes:
 *
 *   Main.dc.html (Login set) + Dashboard.dc.html + canvas.json → Claude Design artboards
 *   design-sandbox.html                                → standalone page (any browser)
 *   design-sandbox.embedded.html                       → the same page for a host frame (postMessage bridge)
 *
 * Usage:
 *   node scripts/build.mjs --out ./out                       # no brand
 *   node scripts/build.mjs --out ./out --brand brand.json    # client brand added as an option
 *   node scripts/build.mjs --out ./out --client "Harbor Health"   # client name in titles (defaults to brand.name)
 *   node scripts/build.mjs --brand brand.json --check           # print the contrast report only, build nothing
 *   node scripts/build.mjs --check-palettes                     # print the ten palettes' contrast ratios (after editing assets/palettes.json)
 *   node scripts/build.mjs --out ./picks --picks picks.json      # export the chosen screens as editable Claude Design artboards
 *
 * brand.json (every key optional):
 *   {
 *     "name": "Client Co",
 *     "colors": ["#0F5F63", "#7A2E6A", "#8A5A00"],   // primary[, secondary[, tertiary]] — light surface values;
 *                                                     // missing ones are borrowed from the stock palette nearest in hue
 *     "colorsDark": ["#1CB0B7", ...],                 // optional dark-surface values; derived if missing
 *     "fonts": { "head": "Fraunces", "body": "Inter", "google": "Fraunces:wght@600;700&family=Inter:wght@400;500;600" },
 *     "logo": "./client-logo.png"                     // png/svg/jpg/webp; absolute, or relative to brand.json
 *   }
 *
 * Nothing here generates design. It only wires tweaks around the templates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(here, '..', 'assets');

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const OUT = path.resolve(opt('--out', './design-sandbox-out'));
const BRAND_PATH = opt('--brand', null);
const CHECK_ONLY = has('--check');
const CLIENT_ARG = opt('--client', null);
const MINIFY = has('--minify');
const EMIT_MD = opt('--emit-md', null);
const APPENDIX = opt('--emit-skill-appendix', null);
const PICKS = opt('--picks', null);

// ---------- fixed option sets ----------
// The ten approved palettes live in assets/palettes.json — edit them there (see its _readme). Dark trios may be
// omitted and are derived; contrast is verified below, after the color helpers exist.
const PALETTES_FILE = path.join(ASSETS, 'palettes.json');
const PALETTES = JSON.parse(fs.readFileSync(PALETTES_FILE, 'utf8')).palettes.map(p => ({ id: String(p.id), name: p.name, light: p.light.map(c => c.toUpperCase()), dark: p.dark ? p.dark.map(c => c.toUpperCase()) : null }));

const FONTS = [
  { id: 'f1', name: 'Manrope + Public Sans',          head: '"Manrope"',          body: '"Public Sans"',    google: 'Manrope:wght@500;600;700;800&family=Public+Sans:wght@400;500;600' },
  { id: 'f2', name: 'DM Serif Display + DM Sans',     head: '"DM Serif Display"', body: '"DM Sans"',        google: 'DM+Serif+Display&family=DM+Sans:wght@400;500;600;700' },
  { id: 'f3', name: 'Space Grotesk + IBM Plex Sans',  head: '"Space Grotesk"',    body: '"IBM Plex Sans"',  google: 'Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600' },
  { id: 'f4', name: 'Playfair Display + Source Sans', head: '"Playfair Display"', body: '"Source Sans 3"',  google: 'Playfair+Display:wght@500;600;700&family=Source+Sans+3:wght@400;500;600' },
  { id: 'f5', name: 'Nunito + Nunito Sans',           head: '"Nunito"',           body: '"Nunito Sans"',    google: 'Nunito:wght@600;700;800&family=Nunito+Sans:wght@400;500;600' },
];
const FALLBACK_HEAD = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FALLBACK_BODY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const SETS = [
  { key: 'login', title: 'Login', file: 'Main.dc.html', variants: [
    // Every variant carries its own mobile counterpart (2026-09-15): desktop + mobile are ONE unit (one card, lock, note; both export).
    { key: 'a', label: 'A', name: 'Centered card',        file: 'login-a.html',       w: 1440, h: 1000, mobile: { file: 'login-a-mobile.html', w: 390, h: 844 } },
    { key: 'b', label: 'B', name: 'Split brand panel',    file: 'login-b.html',       w: 1440, h: 1000, mobile: { file: 'login-b-mobile.html', w: 390, h: 844 } },
    { key: 'c', label: 'C', name: 'Form + product preview', file: 'login-c.html',     w: 1440, h: 1000, mobile: { file: 'login-c-mobile.html', w: 390, h: 844 } },
    { key: 'd', label: 'D', name: 'Dark frame, one-time code', file: 'login-d.html',  w: 1440, h: 1000, mobile: { file: 'login-d-mobile.html', w: 390, h: 844 } },
  ]},
  // Labels are unique across the page (Abby, 2026-09-16): logins A–D, dashboards E–H; on the page a desktop is "A1" and its mobile "A2".
  { key: 'dashboard', title: 'Dashboard', file: 'Dashboard.dc.html', variants: [
    { key: 'a', label: 'E', name: 'Light sidebar',        file: 'dashboard-a.html',   w: 1440, h: 1040, mobile: { file: 'dashboard-a-mobile.html', w: 390, h: 844 } },
    { key: 'b', label: 'F', name: 'Dark sidebar, order list', file: 'dashboard-b.html', w: 1440, h: 1040, mobile: { file: 'dashboard-b-mobile.html', w: 390, h: 844 } },
    { key: 'c', label: 'G', name: 'Top nav, order board', file: 'dashboard-c.html',   w: 1440, h: 1040, mobile: { file: 'dashboard-c-mobile.html', w: 390, h: 844 } },
    { key: 'd', label: 'H', name: 'Dark frame, panel + table', file: 'dashboard-d.html', w: 1440, h: 1040, mobile: { file: 'dashboard-d-mobile.html', w: 390, h: 844 } },
  ]},
];

// ---------- color math (WCAG 2.x relative luminance) ----------
const hexToRgb = (h) => { const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex) => { const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgbToHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; if (max === min) return [0, 0, l]; const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min); const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const hslToHex = ([h, s, l]) => { const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]); };
/** Lift a light-surface brand color until it clears `target` on a dark surface — raising lightness, keeping the hue and saturation, so a teal stays a teal. */
const deriveDark = (hex, target = 6) => { const [h, s, l0] = rgbToHsl(hexToRgb(hex)); let l = l0, c = hex; while (contrast(c, '#171B22') < target && l < 0.95) { l += 0.02; c = hslToHex([h, Math.min(1, s * 1.05), l]); } return c; };
/** Darken a color until it clears `target` as text on white. */
const deriveTextSafe = (hex, target = 4.5) => { let c = hex, t = 0; while (contrast(c, '#FFFFFF') < target && t < 1) { t += 0.05; c = mix(hex, '#000000', t); } return c; };
const hue = (hex) => { const [r, g, b] = hexToRgb(hex).map(v => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; if (!d) return null; let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; };
/** Stock palette whose primary is nearest in hue (chromatic ones only); near-neutral inputs get Slate & Emerald. */
const nearestPalette = (hex) => { const h = hue(hex); if (h === null) return PALETTES[7]; let best = PALETTES[0], bd = 999; for (const p of PALETTES) { const ph = hue(p.light[0]); if (ph === null) continue; const d = Math.min(Math.abs(ph - h), 360 - Math.abs(ph - h)); if (d < bd) { bd = d; best = p; } } return best; };
const isHex = (s) => typeof s === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s);
const normHex = (s) => (s.startsWith('#') ? s : '#' + s).toUpperCase();

// ---------- brand ----------
// ---------- palettes: derive missing dark trios, verify contrast (assets/palettes.json) ----------
{
  const ALLOW_LOW = has('--allow-low-contrast'); const problems = [];
  for (const p of PALETTES) {
    if (!/^\d\d$/.test(p.id)) problems.push(`palette "${p.name}": id must be two digits, got "${p.id}"`);
    if (!Array.isArray(p.light) || p.light.length !== 3 || p.light.some(c => !/^#[0-9A-F]{6}$/.test(c))) problems.push(`palette "${p.name}": light must be three #RRGGBB values`);
    if (!p.dark) p.dark = p.light.map(c => deriveDark(c, 6));
    p.light.forEach((c, k) => { const r = contrast(c, '#F1F2F5'); if (r < 4.5) problems.push(`palette "${p.name}" light[${k}] ${c}: ${r.toFixed(2)}:1 as text on #F1F2F5 (floor 4.5)`); });
    p.dark.forEach((c, k) => { const r = contrast(c, '#171B22'); if (r < 6) problems.push(`palette "${p.name}" dark[${k}] ${c}: ${r.toFixed(2)}:1 on #171B22 (floor 6)`); });
  }
  const ids = PALETTES.map(p => p.id); if (new Set(ids).size !== ids.length) problems.push('duplicate palette ids');
  if (problems.length) { console.error((ALLOW_LOW ? 'Palette warnings:' : 'Palette errors (fix assets/palettes.json, or pass --allow-low-contrast to build anyway):') + '\n  ' + problems.join('\n  ')); if (!ALLOW_LOW) process.exit(1); }
}
if (has('--check-palettes')) {   // print every palette's ratios and stop — for a maintainer editing assets/palettes.json
  console.log('id  palette             light trio (text on #F1F2F5)            dark trio (on #171B22)');
  for (const p of PALETTES) console.log(`${p.id}  ${p.name.padEnd(18)}  ${p.light.map(c => c + ' ' + contrast(c, '#F1F2F5').toFixed(1)).join('  ')}   ${p.dark.map(c => c + ' ' + contrast(c, '#171B22').toFixed(1)).join('  ')}`);
  process.exit(0);
}

let brand = null;
const report = [];
if (BRAND_PATH) {
  const raw = JSON.parse(fs.readFileSync(BRAND_PATH, 'utf8'));
  brand = { name: raw.name || 'Brand' };
  if (Array.isArray(raw.colors) && raw.colors.length) {
    const light = raw.colors.filter(isHex).map(normHex);
    if (!light.length) throw new Error('brand.colors has no valid hex values');
    const donor = nearestPalette(light[0]);
    brand.borrowedFrom = light.length < 3 ? donor.name : null;
    while (light.length < 3) light.push(donor.light[light.length]);
    const dark = (Array.isArray(raw.colorsDark) ? raw.colorsDark.filter(isHex).map(normHex) : []);
    while (dark.length < 3) dark.push(dark.length < raw.colors.filter(isHex).length ? deriveDark(light[dark.length]) : donor.dark[dark.length]);
    brand.light = light.slice(0, 3); brand.dark = dark.slice(0, 3);
    // on-primary: white unless the primary is too light for white text
    brand.onLight = contrast(brand.light[0], '#FFFFFF') >= 3 ? '#FFFFFF' : '#0E1116';
    brand.onDark  = contrast(brand.dark[0],  '#FFFFFF') >= 3 ? '#FFFFFF' : '#0E1116';
    // contrast report — the one input the pre-verified palettes cannot cover
    const chk = (label, fg, bg, floor) => { const r = contrast(fg, bg); report.push({ label, fg, bg, ratio: +r.toFixed(2), floor, pass: r >= floor }); };
    chk('Brand primary as text on white (light mode)', brand.light[0], '#FFFFFF', 4.5);
    chk('Brand primary as button fill vs white surface (boundary)', brand.light[0], '#FFFFFF', 3);
    chk(`Button label (${brand.onLight}) on brand primary`, brand.onLight, brand.light[0], 4.5);
    chk('Brand primary as text on dark surface #171B22', brand.dark[0], '#171B22', 4.5);
    chk(`Button label (${brand.onDark}) on dark-mode primary`, brand.onDark, brand.dark[0], 4.5);
    const textFail = report.find(r => r.label.startsWith('Brand primary as text on white') && !r.pass);
    if (textFail) { brand.textSafeLight = deriveTextSafe(brand.light[0]); report.push({ label: 'Derived text-safe variant for light mode (used for links/text only)', fg: brand.textSafeLight, bg: '#FFFFFF', ratio: +contrast(brand.textSafeLight, '#FFFFFF').toFixed(2), floor: 4.5, pass: true }); }
  }
  if (raw.fonts && (raw.fonts.head || raw.fonts.body)) {
    brand.font = { id: 'brand', name: `${brand.name} fonts`, head: `"${raw.fonts.head || raw.fonts.body}"`, body: `"${raw.fonts.body || raw.fonts.head}"`, google: raw.fonts.google || '' };
  }
  if (raw.logo) {
    const p = path.resolve(path.dirname(BRAND_PATH), raw.logo);
    if (!fs.existsSync(p)) throw new Error(`brand.logo not found: ${p}`);
    const ext = path.extname(p).toLowerCase().replace('.', '');
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
    if (!mime) throw new Error('brand.logo must be png, jpg, svg or webp');
    const buf = fs.readFileSync(p);
    if (buf.length > 70 * 1024) console.error(`warning: logo is ${(buf.length / 1024).toFixed(0)} KB — downsample to keep the canvas light`);
    brand.logo = { file: `brand-logo.${ext}`, mime, buf };
  }
}

if (brand && brand.borrowedFrom) console.error(`Brand trio: secondary/tertiary borrowed from "${brand.borrowedFrom}" (nearest stock palette in hue) — light ${brand.light.join(' ')} · dark ${brand.dark.join(' ')}`);
if (report.length) {
  console.error('Contrast report (WCAG 2.2 AA floors):');
  for (const r of report) console.error(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.ratio.toFixed(2).padStart(5)}:1  (floor ${r.floor})  ${r.label}  ${r.fg} on ${r.bg}`);
}
if (CHECK_ONLY) process.exit(0);

const paletteOptions = [...PALETTES, ...(brand && brand.light ? [{ id: 'brand', name: `${brand.name} (brand)`, light: brand.light, dark: brand.dark }] : [])];
const fontOptions = [...FONTS, ...(brand && brand.font ? [brand.font] : [])];
const defaultPalette = brand && brand.light ? 'brand' : '01';
const defaultFont = brand && brand.font ? 'brand' : 'f1';
const CLIENT = CLIENT_ARG || (brand && brand.name !== 'Brand' ? brand.name : null);
const PAGE_TITLE = CLIENT ? `Design Sandbox — ${CLIENT}` : 'Design Sandbox';

// ---------- assemble templates ----------
const read = (rel) => fs.readFileSync(path.join(ASSETS, rel), 'utf8');
const partials = Object.fromEntries(fs.readdirSync(path.join(ASSETS, 'partials')).map(f => [f.replace(/\.(html|svg)$/, ''), read(path.join('partials', f))]));

function logoMark(target) {
  if (!brand || !brand.logo) return partials['logo-mark'];
  const src = target === 'canvas' ? brand.logo.file : `data:${brand.logo.mime};base64,${brand.logo.buf.toString('base64')}`;
  return `<img src="${src}" alt="${brand.name} logo">`;
}
function expand(html, target) {
  let out = html;
  for (let i = 0; i < 6; i++) {
    // `<!-- @include sidebar collapsed -->` includes the sidebar with its rail toggle pre-checked (Dashboard D opens on the icon rail).
    out = out.replace(/<!-- @include ([\w-]+)( collapsed)? -->/g, (_, n, collapsed) => { if (!partials[n]) throw new Error(`missing partial ${n}`); return collapsed ? partials[n].replace('class="collapse-toggle" type="checkbox"', 'class="collapse-toggle" type="checkbox" checked') : partials[n]; });
    out = out.replace(/<!-- @logo-mark -->/g, logoMark(target));
  }
  if (brand && brand.logo) out = out.replace(/<span class="wordmark">Acme<\/span>/g, '');
  if (brand && brand.name) out = out.replace(/aria-label="Acme home"/g, `aria-label="${brand.name} home"`);
  return out.replace(/<!--(?! @)[\s\S]*?-->/g, '').trim();
}

let themeCss = read('theme.css');
{ // the palette rules are generated from assets/palettes.json between these markers — never edit them by hand
  const rules = PALETTES.map(p => `.screen[data-palette="${p.id}"] { --primary:${p.light[0]}; --secondary:${p.light[1]}; --tertiary:${p.light[2]}; --on-primary:#fff; }`).join('\n') + '\n\n' +
    PALETTES.map(p => `.screen[data-mode="dark"][data-palette="${p.id}"] { --primary:${p.dark[0]}; --secondary:${p.dark[1]}; --tertiary:${p.dark[2]}; --on-primary:#0E1116; }`).join('\n');
  const re = /\/\* @PALETTES:BEGIN \*\/[\s\S]*?\/\* @PALETTES:END \*\//;
  if (!re.test(themeCss)) throw new Error('theme.css is missing the /* @PALETTES:BEGIN */ … /* @PALETTES:END */ markers');
  themeCss = themeCss.replace(re, '/* @PALETTES:BEGIN */\n' + rules + '\n/* @PALETTES:END */');
}
const squeezeCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\n/g, '');
const squeezeHtml = (html) => html.replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n');
if (MINIFY) themeCss = squeezeCss(themeCss);
if (brand && brand.light) {
  const [p, s, t] = brand.light, [dp, ds, dt] = brand.dark;
  themeCss = themeCss.replace('/* @BRAND_PALETTE@ */',
    `.screen[data-palette="brand"] { --primary:${p}; --secondary:${s}; --tertiary:${t}; --on-primary:${brand.onLight}; }\n` +
    `.screen[data-mode="dark"][data-palette="brand"] { --primary:${dp}; --secondary:${ds}; --tertiary:${dt}; --on-primary:${brand.onDark}; }\n` +
    (brand.textSafeLight ? `.screen[data-palette="brand"] { --primary-text:${brand.textSafeLight}; }\n` : ''));
}

const googleHref = 'https://fonts.googleapis.com/css2?family=' + fontOptions.map(f => f.google).filter(Boolean).join('&family=') + '&display=swap';

// ---------- offline fonts ----------
// The sandbox page inlines the five pairs as @font-face data URIs (latin woff2 vendored in
// assets/fonts by scripts/fetch-fonts.mjs) so the meeting room's Wi-Fi cannot change the
// typography. Exports and the .dc.html artboards keep the Google Fonts link — a data-URI
// stylesheet would push the Claude Design paste past 2 MB. `--no-inline-fonts` restores the link.
const INLINE_FONTS = !has('--no-inline-fonts');
const FONTS_DIR = path.resolve(opt('--fonts', path.join(ASSETS, 'fonts')));
function fontFaceCss(dir) {
  const manifestPath = path.join(dir, 'fonts.json');
  if (!fs.existsSync(manifestPath)) return { css: '', families: [] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rules = [], families = new Set();
  for (const f of manifest.faces) {
    const p = path.join(dir, f.file);
    if (!fs.existsSync(p)) { console.error(`warning: ${f.file} listed in ${manifestPath} is missing — ${f.family} ${f.weight} will load from Google instead`); continue; }
    const b64 = fs.readFileSync(p).toString('base64');
    rules.push(`@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");${f.unicodeRange ? 'unicode-range:' + f.unicodeRange + ';' : ''}}`);
    families.add(f.family);
  }
  return { css: rules.join('\n'), families: [...families] };
}
let fontsCss = '', fontsHref = googleHref;   // what the sandbox page itself uses
if (INLINE_FONTS) {
  const stock = fontFaceCss(FONTS_DIR);
  let css = stock.css; const families = new Set(stock.families);
  if (!css) console.error(`note: no vendored fonts in ${FONTS_DIR} (run scripts/fetch-fonts.mjs) — the page will load its fonts from Google`);
  if (brand && brand.font && brand.font.google && !CHECK_ONLY) {
    // Fetch the client's family once, into the output folder, so it is offline-safe too.
    const bdir = path.join(OUT, 'fonts');
    try {
      const { execFileSync } = await import('node:child_process');
      fs.mkdirSync(bdir, { recursive: true });
      execFileSync(process.execPath, [path.join(here, 'fetch-fonts.mjs'), '--query', brand.font.google, '--out', bdir], { stdio: ['ignore', 'ignore', 'inherit'] });
      const b = fontFaceCss(bdir); css += (css ? '\n' : '') + b.css; b.families.forEach(f => families.add(f));
      console.error(`Brand font bundled for offline use: ${b.families.join(', ')}`);
    } catch (e) {
      console.error(`Brand font could not be fetched (no network?) — it will load from Google at view time and needs internet in the room. Stock pairs are bundled and work offline.`);
    }
  }
  fontsCss = css;
  // Families that are not bundled (a brand font that failed to fetch, a missing file) still get a link.
  const unbundled = fontOptions.filter(f => f.google && !f.google.split('&family=').every(q => families.has(decodeURIComponent(q.split(':')[0]).replace(/\+/g, ' '))));
  fontsHref = unbundled.length ? 'https://fonts.googleapis.com/css2?family=' + unbundled.map(f => f.google).join('&family=') + '&display=swap' : '';
}

// Sandbox chrome — deliberately neutral, reads as an inspector, never as part of the design.
let chromeCss = `
.ds-set { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #ECEDF0; color: #1F2329; padding: 36px 40px 40px; min-height: 100%; box-sizing: border-box; }
.ds-set *, .ds-set *::before, .ds-set *::after { box-sizing: inherit; }
.ds-head { display: flex; align-items: baseline; gap: 18px; margin-bottom: 22px; }
.ds-head h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
.ds-head p { margin: 0; color: #5F6672; font-size: 13px; }
.ds-row { display: flex; align-items: flex-start; gap: 40px; }
.ds-variant { display: flex; flex-direction: column; gap: 10px; flex: none; }
.ds-label { display: flex; align-items: center; gap: 12px; height: 34px; }
.ds-label .ds-pick { display: inline-flex; align-items: center; gap: 10px; height: 34px; padding: 0 12px 0 6px; border-radius: 8px; border: 1px solid transparent; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600; color: #1F2329; cursor: pointer; }
.ds-label .ds-pick .ds-badge { width: 24px; height: 24px; border-radius: 6px; background: #1F2329; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.ds-label .ds-pick .ds-badge.wide { width: auto; padding: 0 8px; }
.ds-label .ds-pick:hover { background: #fff; border-color: #D7DAE0; }
.ds-variant.is-selected .ds-pick { background: #fff; border-color: #1F2329; box-shadow: 0 0 0 2px #1F2329; }
.ds-variant.is-selected .ds-frame { outline: 3px solid #1F2329; outline-offset: 6px; border-radius: 6px; }
.ds-label .ds-name { color: #5F6672; font-weight: 500; }
.ds-strip { display: none; align-items: center; gap: 6px; margin-left: 6px; }
.ds-variant:hover .ds-strip, .ds-variant:focus-within .ds-strip, .ds-variant.is-overridden .ds-strip { display: inline-flex; }
.ds-strip button { height: 26px; padding: 0 10px; border-radius: 6px; border: 1px solid #D7DAE0; background: #fff; color: #1F2329; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.ds-strip button:hover { border-color: #1F2329; }
.ds-strip button.on { background: #1F2329; color: #fff; border-color: #1F2329; }
.ds-strip .ds-reset { color: #8A5A00; border-color: #E8D9B5; background: #FFF8E6; }
.ds-strip select { height: 26px; padding: 0 8px; border-radius: 6px; border: 1px solid #D7DAE0; background: #fff; color: #1F2329; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; max-width: 240px; }
.ds-strip select:hover { border-color: #1F2329; }
.ds-strip select.is-ov { border-color: #1F2329; font-weight: 600; }
.ds-frame { box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 12px 32px -8px rgba(0,0,0,.18); border-radius: 4px; overflow: hidden; }
.ds-variant-m { margin-left: -20px; }
.ds-frame-m { border-radius: 12px; }

.ds-bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: 22px; padding: 12px 24px; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border-bottom: 1px solid #D7DAE0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 13px; color: #1F2329; }
.ds-bar .ds-title { font-weight: 700; font-size: 15px; margin-right: 8px; }
.ds-bar .ds-group { display: inline-flex; align-items: center; gap: 8px; }
.ds-bar .ds-group > span { color: #5F6672; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.ds-bar .ds-seg { display: inline-flex; background: #ECEDF0; border-radius: 8px; padding: 3px; gap: 2px; }
.ds-bar .ds-seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: #5F6672; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.ds-bar .ds-seg button:hover { color: #1F2329; }
.ds-bar .ds-seg button.on { background: #fff; color: #1F2329; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.ds-bar .ds-swatches { display: inline-flex; gap: 6px; }
.ds-bar .ds-swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; padding: 2px; background: transparent; cursor: pointer; position: relative; }
.ds-bar .ds-swatch i { display: block; width: 100%; height: 100%; border-radius: 50%; background: conic-gradient(var(--p) 0 60%, var(--s) 60% 85%, var(--t) 85%); }
.ds-bar .ds-swatch:hover { border-color: #A0A6B1; }
.ds-bar .ds-swatch.on { border-color: #1F2329; }
.ds-bar select { height: 30px; border-radius: 6px; border: 1px solid #D7DAE0; background: #fff; font: inherit; font-size: 13px; padding: 0 8px; }
.ds-bar .ds-copy { margin-left: auto; height: 30px; padding: 0 14px; border-radius: 6px; border: 1px solid #1F2329; background: #1F2329; color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.ds-bar .ds-copy:hover { background: #000; }
.ds-page { background: #ECEDF0; min-height: 100vh; }
.ds-page .ds-set { padding-top: 28px; }
.ds-page .ds-set + .ds-set { border-top: 1px solid #D7DAE0; }
`;

if (MINIFY) chromeCss = squeezeCss(chromeCss);
const iconsSprite = partials['icons'];

// ---------- artboard (.dc.html) ----------
function bindRoot(html, key) {
  // swap the static defaults on the screen root for tweak-bound holes
  return html.replace(/data-mode="light" data-density="comfortable" data-palette="01"/,
    `data-mode="{{${key}.mode}}" data-density="{{${key}.density}}" data-palette="{{${key}.palette}}" style="--font-head: {{${key}.fontHead}}; --font-body: {{${key}.fontBody}}"`);
}

function artboard(set) {
  // every screen is its own variant here too (2026-09-16): the mobile counterpart follows its desktop with key "<k>m" and its own strip
  const entries = set.variants.flatMap(v => [{ key: v.key, label: v.label + '1', name: v.name, file: v.file, mobile: false }, ...(v.mobile ? [{ key: v.key + 'm', label: v.label + '2', name: v.name + ' · mobile', file: v.mobile.file, mobile: true }] : [])]);
  const variants = entries.map(v => {
    const screen = bindRoot(expand(read(path.join('screens', v.file)), 'canvas'), v.key);
    const badgeClass = 'ds-badge wide';
    return `
    <div class="ds-variant${v.mobile ? ' ds-variant-m' : ''} {{${v.key}.cls}}">
      <div class="ds-label">
        <button class="ds-pick" type="button" onClick="{{${v.key}.select}}"><span class="${badgeClass}">${v.label}</span><span class="ds-name">${v.name}</span></button>
        <div class="ds-strip">
          <button type="button" onClick="{{${v.key}.cycleDensity}}">{{${v.key}.densityLabel}}</button>
          <select aria-label="Color for this screen" value="{{${v.key}.palette}}" onChange="{{${v.key}.setPalette}}"><sc-for list="{{${v.key}.paletteOptions}}" as="o" hint-placeholder-count="3"><option value="{{o.id}}">{{o.label}}</option></sc-for></select>
          <select aria-label="Font for this screen" value="{{${v.key}.font}}" onChange="{{${v.key}.setFont}}"><sc-for list="{{${v.key}.fontOptions}}" as="o" hint-placeholder-count="3"><option value="{{o.id}}">{{o.label}}</option></sc-for></select>
          <button type="button" onClick="{{${v.key}.cycleMode}}">{{${v.key}.modeLabel}}</button>
          <button type="button" class="ds-reset" onClick="{{${v.key}.reset}}">Reset</button>
        </div>
      </div>
      <div class="ds-frame${v.mobile ? ' ds-frame-m' : ''}">${screen}</div>
    </div>`;
  }).join('\n');

  const props = {
    density: { editor: 'enum', default: 'comfortable', options: ['comfortable', 'compact'], section: 'Tweaks' },
    palette: { editor: 'enum', default: paletteOptions.find(p => p.id === defaultPalette).name, options: paletteOptions.map(p => p.name), section: 'Tweaks' },
    font:    { editor: 'enum', default: fontOptions.find(f => f.id === defaultFont).name, options: fontOptions.map(f => f.name), section: 'Tweaks' },
    mode:    { editor: 'enum', default: 'light', options: ['light', 'dark'], section: 'Tweaks' },
  };
  const propsAttr = JSON.stringify(props).replace(/&/g, '&amp;').replace(/'/g, '&#39;');

  const logic = `
const PALETTES = ${JSON.stringify(paletteOptions.map(p => ({ id: p.id, name: p.name })))};
const FONTS = ${JSON.stringify(fontOptions.map(f => ({ id: f.id, name: f.name, head: f.head, body: f.body })))};
const DENSITIES = ['comfortable', 'compact'];
const MODES = ['light', 'dark'];
const VARIANTS = ${JSON.stringify(entries.map(v => v.key))};
const FB_HEAD = ${JSON.stringify(FALLBACK_HEAD)};
const FB_BODY = ${JSON.stringify(FALLBACK_BODY)};
const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
class Component extends DCLogic {
  state = { selected: null, ov: {} };
  setOv(key, patch) { const ov = { ...this.state.ov, [key]: { ...(this.state.ov[key] || {}), ...patch } }; this.setState({ ov }); }
  renderVals() {
    const P = this.props || {};
    const base = {
      density: DENSITIES.includes(P.density) ? P.density : 'comfortable',
      palette: (PALETTES.find(p => p.name === P.palette) || PALETTES[0]).id,
      font: (FONTS.find(f => f.name === P.font) || FONTS[0]).id,
      mode: MODES.includes(P.mode) ? P.mode : 'light',
    };
    const out = {};
    for (const key of VARIANTS) {
      const ov = this.state.ov[key] || {};
      const eff = { ...base, ...ov };
      const pal = PALETTES.find(p => p.id === eff.palette) || PALETTES[0];
      const font = FONTS.find(f => f.id === eff.font) || FONTS[0];
      const overridden = Object.keys(ov).length > 0;
      const dot = (k) => (ov[k] !== undefined ? ' •' : '');
      out[key] = {
        mode: eff.mode, density: eff.density, palette: pal.id,
        fontHead: font.head + ', ' + FB_HEAD, fontBody: font.body + ', ' + FB_BODY,
        cls: (this.state.selected === key ? 'is-selected' : '') + (overridden ? ' is-overridden' : ''),
        densityLabel: 'Density: ' + cap(eff.density) + dot('density'),
        font: font.id,
        paletteOptions: PALETTES.map(p => ({ id: p.id, label: 'Color: ' + p.name + (p.id === eff.palette ? dot('palette') : '') })),
        fontOptions: FONTS.map(f => ({ id: f.id, label: 'Font: ' + f.name + (f.id === eff.font ? dot('font') : '') })),
        modeLabel: 'Mode: ' + cap(eff.mode) + dot('mode'),
        select: () => this.setState({ selected: this.state.selected === key ? null : key }),
        cycleDensity: () => this.setOv(key, { density: next(DENSITIES, eff.density) }),
        setPalette: (e) => this.setOv(key, { palette: e.target.value }),
        setFont: (e) => this.setOv(key, { font: e.target.value }),
        cycleMode: () => this.setOv(key, { mode: next(MODES, eff.mode) }),
        reset: () => { const ov = { ...this.state.ov }; delete ov[key]; this.setState({ ov }); },
      };
    }
    return out;
  }
}`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${googleHref}">
  <style>
body { margin: 0; background: #ECEDF0; }
a { color: #1F2329; } a:hover { color: #000; }
${themeCss}
${chromeCss}
  </style>
</helmet>
<div class="ds-set">
  ${iconsSprite}
  <div class="ds-head"><h1>${set.title}</h1><p>${CLIENT ? CLIENT + ' · ' : ''}One theme across every layout. The chips above the artboard change every screen; hover a label to override density, color, font or mode on just that one.</p></div>
  <div class="ds-row">${variants}
  </div>
</div>
</x-dc>
<script data-dc-script data-props='${propsAttr}'>${logic}
</script>
</body>
</html>
`;
}

// ---------- standalone canvas page ----------
import { canvasPage } from './canvas-page.mjs';
function standalone(bodyOnly = false, { embedded = false } = {}) {
  const screensHtml = {};
  for (const set of SETS) for (const v of set.variants) {
    screensHtml[`${set.key}/${v.key}`] = expand(read(path.join('screens', v.file)), 'html');
    if (v.mobile) screensHtml[`${set.key}/${v.key}~m`] = expand(read(path.join('screens', v.mobile.file)), 'html');   // a variant's own mobile counterpart (pair)
  }
  return canvasPage({ SETS, screensHtml, paletteOptions, fontOptions, defaultPalette, defaultFont, CLIENT, PAGE_TITLE, brand, report, googleHref, fontsCss, fontsHref, themeCss, iconsSprite, FALLBACK_HEAD, FALLBACK_BODY, bodyOnly, embedded });
}

// ---------- export the picks as editable Claude Design artboards ----------
// --picks picks.json : { login: 'c', dashboard: 'b', density, palette, font, mode, overrides: { 'dashboard/c': { mode: 'dark' } } }
function pickArtboard(set, variantKey, picks, look = null, file = null) {
  const v = set.variants.find(x => x.key === variantKey);
  if (!v) throw new Error(`no ${set.key} variant "${variantKey}"`);
  const ov = (picks.overrides || {})[`${set.key}/${variantKey}`] || {};
  const eff = look ? { density: 'comfortable', palette: defaultPalette, font: defaultFont, mode: 'light', ...look }
    : { density: picks.density || 'comfortable', palette: picks.palette || defaultPalette, font: picks.font || defaultFont, mode: picks.mode || 'light', ...ov };
  const pal = paletteOptions.find(p => p.id === eff.palette) || paletteOptions[0];
  const font = fontOptions.find(f => f.id === eff.font) || fontOptions[0];
  const screen = expand(read(path.join('screens', file || v.file)), 'canvas')
    .replace(/data-mode="light" data-density="comfortable" data-palette="01"/, `data-mode="{{mode}}" data-density="{{density}}" data-palette="{{palette}}" data-navicons="{{navicons}}" style="--font-head: {{fontHead}}; --font-body: {{fontBody}}"`);
  const props = {
    density: { editor: 'enum', default: eff.density, options: ['comfortable', 'compact'] },
    navicons: { editor: 'enum', default: eff.navicons || 'on', options: ['on', 'off'] },
    palette: { editor: 'enum', default: pal.name, options: paletteOptions.map(p => p.name) },
    font:    { editor: 'enum', default: font.name, options: fontOptions.map(f => f.name) },
    mode:    { editor: 'enum', default: eff.mode, options: ['light', 'dark'] },
  };
  const propsAttr = JSON.stringify(props).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  const logic = `
const PALETTES = ${JSON.stringify(paletteOptions.map(p => ({ id: p.id, name: p.name })))};
const FONTS = ${JSON.stringify(fontOptions.map(f => ({ id: f.id, name: f.name, head: f.head, body: f.body })))};
class Component extends DCLogic {
  renderVals() {
    const P = this.props || {};
    const pal = PALETTES.find(p => p.name === P.palette) || PALETTES.find(p => p.id === ${JSON.stringify(pal.id)});
    const font = FONTS.find(f => f.name === P.font) || FONTS.find(f => f.id === ${JSON.stringify(font.id)});
    return { mode: P.mode || ${JSON.stringify(eff.mode)}, density: P.density || ${JSON.stringify(eff.density)}, navicons: P.navicons || ${JSON.stringify(eff.navicons || 'on')}, palette: pal.id, fontHead: font.head + ', ' + ${JSON.stringify(FALLBACK_HEAD)}, fontBody: font.body + ', ' + ${JSON.stringify(FALLBACK_BODY)} };
  }
}`;
  return { html: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${googleHref}">
  <style>
body { margin: 0; }
a { color: #1F2329; } a:hover { color: #000; }
${themeCss}
  </style>
</helmet>
<div>${iconsSprite}${screen}</div>
</x-dc>
<script data-dc-script data-props='${propsAttr}'>${logic}
</script>
</body>
</html>
`, w: v.w, h: v.h, label: v.label, name: v.name, eff, pal, font };
}
function exportPicks(picksPath) {
  const picks = JSON.parse(fs.readFileSync(picksPath, 'utf8'));
  const [loginSet, dashSet] = SETS;
  const out = [];
  if (picks.v === 2 && picks.locks) {
    // v2 (2026-09): the locked screens, each with its captured look. Since 2026-09-16 every screen is its own unit:
    // "login/a" is the desktop, "login/a~m" its mobile counterpart — each exports on its own.
    for (const [uid, look] of Object.entries(picks.locks)) {
      const [setKey, rawKey] = uid.split('/'); const set = SETS.find(s => s.key === setKey); if (!set) throw new Error(`picks.json: unknown set in "${uid}"`);
      const mobile = rawKey.endsWith('~m'), key = mobile ? rawKey.slice(0, -2) : rawKey;
      const v = set.variants.find(x => x.key === key); if (!v || (mobile && !v.mobile)) throw new Error(`picks.json: unknown variant "${uid}"`);
      const base = `${set.title}-${v.label}${mobile ? '2' : '1'}`;
      const file = out.length ? `${base}.dc.html` : 'Main.dc.html';
      if (mobile) out.push({ file, title: `${set.title} ${v.label}2 — ${v.name} (mobile)`, ...pickArtboard(set, key, picks, look, v.mobile.file), w: v.mobile.w, h: v.mobile.h });
      else out.push({ file, title: `${set.title} ${v.label}1 — ${v.name}`, ...pickArtboard(set, key, picks, look) });
    }
    if (!out.length) throw new Error('picks.json has no locked screens');
  } else {
    if (picks.login) out.push({ file: 'Main.dc.html', title: `Login — ${loginSet.variants.find(v => v.key === picks.login).label}`, ...pickArtboard(loginSet, picks.login, picks) });
    if (picks.dashboard) out.push({ file: out.length ? 'Dashboard.dc.html' : 'Main.dc.html', title: `Dashboard — ${dashSet.variants.find(v => v.key === picks.dashboard).label}`, ...pickArtboard(dashSet, picks.dashboard, picks) });
    if (!out.length) throw new Error('picks.json names neither a login nor a dashboard variant');
  }
  let x = 0; const artboards = [];
  for (const a of out) { fs.writeFileSync(path.join(OUT, a.file), a.html); artboards.push({ file: a.file, x, y: 0, w: a.w, h: a.h, title: a.title, is_interactive: false }); x += a.w + 160; }
  fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify({ artboards, launch: { view: 'canvas' } }, null, 2) + '\n');
  console.log(`exported ${out.map(a => a.file).join(', ')} (theme baked in as defaults), canvas.json → ${OUT}`);
  return true;
}

// ---------- canvas.json ----------
function canvasJson() {
  const W = 40 * 2 + SETS[0].variants.reduce((w, v) => w + v.w + (v.mobile ? 20 + v.mobile.w : 0), 0) + (SETS[0].variants.length - 1) * 40;   // padding + frames (+ mobiles, 20px after their desktop) + gaps
  const H = (set) => 36 + 22 + 40 + 34 + 10 + Math.max(...set.variants.map(v => Math.max(v.h, v.mobile ? v.mobile.h : 0))) + 40;
  const [login, dash] = SETS;
  return JSON.stringify({
    artboards: [
      { file: login.file, x: 0, y: 0,                  w: W, h: H(login), title: 'Login',     expand: 'fit', is_interactive: true },
      { file: dash.file,  x: 0, y: H(login) + 160,     w: W, h: H(dash),  title: 'Dashboard', expand: 'fit', is_interactive: true },
    ],
    launch: { view: 'canvas' },
  }, null, 2) + '\n';
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
if (PICKS) { exportPicks(PICKS); if (brand && brand.logo) fs.writeFileSync(path.join(OUT, brand.logo.file), brand.logo.buf); process.exit(0); }
const post = (s) => MINIFY ? squeezeHtml(s) : s;
for (const set of SETS) fs.writeFileSync(path.join(OUT, set.file), post(artboard(set)));
fs.writeFileSync(path.join(OUT, 'canvas.json'), canvasJson());
fs.writeFileSync(path.join(OUT, 'design-sandbox.html'), post(standalone(false)));
fs.writeFileSync(path.join(OUT, 'design-sandbox.artifact.html'), post(standalone(true)));
fs.writeFileSync(path.join(OUT, 'design-sandbox.embedded.html'), post(standalone(false, { embedded: true })));   // framed by a host page: postMessage bridge, host-styled chrome
if (brand && brand.logo) fs.writeFileSync(path.join(OUT, brand.logo.file), brand.logo.buf);
fs.writeFileSync(path.join(OUT, 'build-info.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  client: CLIENT,
  brand: brand ? { name: brand.name, colors: brand.light || null, colorsDark: brand.dark || null, borrowedFrom: brand.borrowedFrom || null, font: brand.font ? brand.font.name : null, logo: brand.logo ? brand.logo.file : null, textSafeLight: brand.textSafeLight || null } : null,
  defaults: { density: 'comfortable', palette: defaultPalette, font: defaultFont, mode: 'light' },
  contrastReport: report,
  files: [...SETS.map(s => s.file), 'canvas.json', 'design-sandbox.html', 'design-sandbox.artifact.html', 'design-sandbox.embedded.html', ...(brand && brand.logo ? [brand.logo.file] : [])],
}, null, 2) + '\n');

if (EMIT_MD) {
  fs.mkdirSync(EMIT_MD, { recursive: true });
  const fence = (lang, body) => '```' + lang + '\n' + body.replace(/```/g, '` ` `') + '\n```\n';
  const intro = (file, what) => `# Artboard source — \`${file}\`\n\nThis is the exact, reviewed content of \`${file}\` (${what}). It is the same as \`prebuilt/${file}\`, kept here so a surface that can read markdown but not other files still has it.\n\n**Use it verbatim.** Create a file named \`${file}\` whose content is the code block below, character for character — no edits, no reformatting, no "improvements", nothing added or removed. Do not paraphrase it into your own version of the screens. If you cannot create the file with this exact content, stop and say so.\n\n`;
  for (const set of SETS) fs.writeFileSync(path.join(EMIT_MD, `artboard-${set.key}.md`), intro(set.file, `the ${set.title} set — each layout as a desktop (1) with its mobile counterpart (2) to its right`) + fence('html', fs.readFileSync(path.join(OUT, set.file), 'utf8')));
  fs.writeFileSync(path.join(EMIT_MD, 'canvas-layout.md'), `# Canvas layout — \`canvas.json\`\n\nThe exact content of \`canvas.json\`: two artboards, Login above Dashboard, opening in the pan-and-zoom canvas view. Create it verbatim alongside the two artboard files.\n\n` + fence('json', fs.readFileSync(path.join(OUT, 'canvas.json'), 'utf8')));
  console.log(`emitted artboard-login.md, artboard-dashboard.md, canvas-layout.md → ${EMIT_MD}`);
}
if (APPENDIX) {
  const MARK = '\n\n<!-- APPENDIX:BEGIN — generated by scripts/build.mjs --emit-skill-appendix; do not edit by hand -->\n';
  let skill = fs.readFileSync(APPENDIX, 'utf8');
  const i = skill.indexOf(MARK.trim()); if (i >= 0) skill = skill.slice(0, i).replace(/\s+$/, '');
  const fence = (lang, body) => '```' + lang + '\n' + body.replace(/```/g, '` ` `') + '\n```\n';
  const [login, dash] = SETS;
  const app = MARK +
    `## Appendix A — \`${login.file}\` (the Login set), verbatim\n\nCreate a file named \`${login.file}\` whose content is exactly this block.\n\n` + fence('html', fs.readFileSync(path.join(OUT, login.file), 'utf8')) +
    `\n## Appendix B — \`${dash.file}\` (the Dashboard set), verbatim\n\nCreate a file named \`${dash.file}\` whose content is exactly this block.\n\n` + fence('html', fs.readFileSync(path.join(OUT, dash.file), 'utf8')) +
    `\n## Appendix C — \`canvas.json\`, verbatim\n\nCreate a file named \`canvas.json\` whose content is exactly this block.\n\n` + fence('json', fs.readFileSync(path.join(OUT, 'canvas.json'), 'utf8')) +
    '\n<!-- APPENDIX:END -->\n';
  fs.writeFileSync(APPENDIX, skill + app);
  console.log(`appended verbatim artboard sources to ${APPENDIX}`);
}
console.log(`built ${SETS.map(s => s.file).join(', ')}, canvas.json, design-sandbox.html, design-sandbox.artifact.html, design-sandbox.embedded.html${brand && brand.logo ? ', ' + brand.logo.file : ''} → ${OUT}`);
