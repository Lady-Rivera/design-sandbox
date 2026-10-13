#!/usr/bin/env node
// fetch-fonts.mjs — maintainer script: download the latin-subset woff2 files for the
// sandbox's five font pairs (and, with --brand, a client's Google font) so build.mjs can
// inline them into the sandbox page and the page renders its typography offline.
//
//   node scripts/fetch-fonts.mjs                          → assets/fonts/*.woff2 + fonts.json
//   node scripts/fetch-fonts.mjs --out <dir>              → same, elsewhere
//   node scripts/fetch-fonts.mjs --brand brand.json --out <dir>   → only the brand family (build.mjs calls this)
//   node scripts/fetch-fonts.mjs --query "Inter:wght@400..700" --out <dir>
//
// Needs network access to fonts.googleapis.com and fonts.gstatic.com. Run it once when a
// pair changes; the files it writes are vendored into the skill and never fetched at meeting time.
// Variable-weight files are requested first (one file per family covers every weight); a family
// that only ships static weights falls back to the discrete weights the page uses.
// All five pairs are licensed under the SIL Open Font License 1.1, which permits embedding.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(flag('--out') || path.join(HERE, '..', 'assets', 'fonts'));

// Same queries build.mjs uses for the Google link (discrete weights), plus a variable-range form.
export const STOCK = [
  { family: 'Manrope',          range: 'Manrope:wght@500..800',          discrete: 'Manrope:wght@500;600;700;800' },
  { family: 'Public Sans',      range: 'Public+Sans:wght@400..600',      discrete: 'Public+Sans:wght@400;500;600' },
  { family: 'DM Serif Display', range: null,                             discrete: 'DM+Serif+Display' },
  { family: 'DM Sans',          range: 'DM+Sans:wght@400..700',          discrete: 'DM+Sans:wght@400;500;600;700' },
  { family: 'Space Grotesk',    range: 'Space+Grotesk:wght@500..700',    discrete: 'Space+Grotesk:wght@500;600;700' },
  { family: 'IBM Plex Sans',    range: 'IBM+Plex+Sans:wght@400..600',    discrete: 'IBM+Plex+Sans:wght@400;500;600' },
  { family: 'Playfair Display', range: 'Playfair+Display:wght@500..700', discrete: 'Playfair+Display:wght@500;600;700' },
  { family: 'Source Sans 3',    range: 'Source+Sans+3:wght@400..600',    discrete: 'Source+Sans+3:wght@400;500;600' },
  { family: 'Nunito',           range: 'Nunito:wght@600..800',           discrete: 'Nunito:wght@600;700;800' },
  { family: 'Nunito Sans',      range: 'Nunito+Sans:wght@400..600',      discrete: 'Nunito+Sans:wght@400;500;600' },
];

// A browser UA makes Google answer with woff2 and unicode-range subsets.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function css(query) {
  const r = await fetch('https://fonts.googleapis.com/css2?family=' + query + '&display=swap', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Google Fonts answered ${r.status} for ${query}`);
  return r.text();
}

// Parse @font-face blocks; keep only the ones Google labels "latin" (the comment precedes each block).
function latinFaces(text) {
  const faces = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== 'latin') continue;
    const body = m[2];
    const get = (p) => { const mm = body.match(new RegExp(p + ':\\s*([^;]+);')); return mm ? mm[1].trim() : null; };
    const url = (body.match(/url\(([^)]+)\)/) || [])[1];
    faces.push({ family: (get('font-family') || '').replace(/^['"]|['"]$/g, ''), style: get('font-style') || 'normal', weight: get('font-weight') || '400', unicodeRange: get('unicode-range'), url });
  }
  return faces;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchFamily(entry, manifest) {
  let faces = null, used = null;
  for (const q of [entry.range, entry.discrete].filter(Boolean)) {
    try { faces = latinFaces(await css(q)); used = q; if (faces.length) break; } catch (e) { process.stderr.write(`  ${entry.family}: ${e.message}\n`); }
  }
  if (!faces || !faces.length) throw new Error(`no latin @font-face for ${entry.family}`);
  for (const f of faces) {
    const r = await fetch(f.url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${r.status} fetching ${f.url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `${slug(f.family)}-${f.weight.replace(/\s+/g, '_')}${f.style !== 'normal' ? '-' + f.style : ''}.woff2`;
    fs.writeFileSync(path.join(OUT, file), buf);
    manifest.push({ family: f.family, style: f.style, weight: f.weight, unicodeRange: f.unicodeRange, file, bytes: buf.length, query: used });
    process.stderr.write(`  ${f.family} ${f.weight} → ${file} (${(buf.length / 1024).toFixed(1)} KB)\n`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  let entries;
  if (flag('--brand')) {
    const b = JSON.parse(fs.readFileSync(path.resolve(flag('--brand')), 'utf8'));
    const q = b.fonts && b.fonts.google;
    if (!q) { process.stderr.write('brand.json has no fonts.google query — nothing to fetch\n'); process.exit(2); }
    entries = q.split('&family=').map(part => ({ family: decodeURIComponent(part.split(':')[0]).replace(/\+/g, ' '), range: null, discrete: part }));
  } else if (flag('--query')) {
    entries = flag('--query').split('&family=').map(part => ({ family: decodeURIComponent(part.split(':')[0]).replace(/\+/g, ' '), range: null, discrete: part }));
  } else entries = STOCK;
  for (const e of entries) await fetchFamily(e, manifest);
  fs.writeFileSync(path.join(OUT, 'fonts.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), license: 'SIL Open Font License 1.1 (all Google Fonts used here)', faces: manifest }, null, 2) + '\n');
  const total = manifest.reduce((a, f) => a + f.bytes, 0);
  console.log(`${manifest.length} latin woff2 files, ${(total / 1024).toFixed(0)} KB (≈${(total * 4 / 3 / 1024).toFixed(0)} KB as base64) → ${OUT}`);
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
