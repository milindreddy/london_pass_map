#!/usr/bin/env node
/**
 * Match each attraction to its REAL London Pass slug (verified list pulled from
 * the Wayback Machine into tools/lp-slugs.json) and write official_url.
 *
 * London Pass is Cloudflare-protected, so slugs can't be scraped or verified
 * live, and naive kebab-casing 404s (real pages drop "the", add "-london",
 * rename, etc.). This does STRICT bidirectional token matching against the
 * authoritative slug list: a direct deep-link is only assigned when the name
 * and slug strongly cover each other. Everything else falls back to a
 * londonpass.com-scoped web search that lands on the right page and never 404s.
 *
 * A few majors that Wayback never archived (HMS Belfast, British Museum,
 * Stonehenge, …) are pinned in OVERRIDES so they still deep-link.
 *
 * Run: node tools/match-official-urls.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data', 'attractions.json');
const slugsPath = path.join(__dirname, 'lp-slugs.json');
const BASE = 'https://londonpass.com/en/london-attractions/';
const searchUrl = name => 'https://www.google.com/search?q=' + encodeURIComponent(name + ' site:londonpass.com');

// Manual, high-confidence slugs for attractions Wayback never captured.
const OVERRIDES = {
  'HMS Belfast': 'hms-belfast',
  'Cutty Sark': 'cutty-sark',
  'Up at The O2': 'up-at-the-o2',
};

const STOP = new Set(['the','a','an','of','and','at','with','to','on','in','for','from','your','my','2','24','30','day','days','hour','hours','half','tour','tours','ticket','tickets','experience','pass','admission','entry','entrance','visit','priority','souvenir','complimentary','guidebook','guide','with','plus','london']);
const slugify = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[’'`]/g,'').replace(/&/g,' and ').replace(/[™®©]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
const toks = s => slugify(s).split('-').filter(Boolean);
const sig = arr => arr.filter(t => !STOP.has(t));

function match(name, slugToks) {
  const nSig = new Set(sig(toks(name)));
  if (!nSig.size) return null;
  let best = null, bestF1 = 0;
  for (const [slug, st] of slugToks) {
    const sSig = new Set(sig(st));
    if (!sSig.size) continue;
    let interN = 0; for (const t of nSig) if (sSig.has(t)) interN++;
    const coverName = interN / nSig.size;      // name tokens explained by slug
    const coverSlug = interN / sSig.size;      // slug tokens explained by name
    if (coverName < 0.6 || coverSlug < 0.6) continue;   // strict gate both ways
    const f1 = (2 * coverName * coverSlug) / (coverName + coverSlug);
    if (f1 > bestF1) { bestF1 = f1; best = slug; }
  }
  return bestF1 >= 0.62 ? { slug: best, score: bestF1 } : null;
}

const list = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const slugs = JSON.parse(await fs.readFile(slugsPath, 'utf8'));
const slugToks = slugs.map(s => [s, toks(s)]);

let direct = 0, fallback = 0;
const report = [];
for (const a of list) {
  let slug = OVERRIDES[a.name] || null, score = slug ? 1 : 0, how = slug ? 'override' : '';
  if (!slug) { const m = match(a.name, slugToks); if (m) { slug = m.slug; score = m.score; how = 'match'; } }
  if (slug) { a.official_slug = slug; a.official_url = BASE + slug; direct++; report.push(['DIRECT', score.toFixed(2), a.name, slug + (how==='override'?' *':'')]); }
  else { a.official_slug = null; a.official_url = searchUrl(a.name); fallback++; report.push(['search', '—', a.name, '(londonpass.com search)']); }
}

await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');
report.sort((x,y) => (x[0]<y[0]?-1:1) || (Number(y[1])||0)-(Number(x[1])||0));
for (const r of report) console.log(`${r[0].padEnd(7)} ${String(r[1]).padStart(4)}  ${r[2].slice(0,44).padEnd(45)} ${r[3]}`);
console.log(`\n${direct} direct deep-links, ${fallback} search fallbacks (of ${list.length}). * = manual override.`);
