#!/usr/bin/env node
/**
 * Add an official_url to each attraction in data/attractions.json.
 *
 * London Pass detail pages follow a fixed pattern:
 *   https://londonpass.com/en/london-attractions/<slug>
 * where <slug> is the kebab-cased attraction name (e.g. "Tower of London" ->
 * "tower-of-london"). The site is behind Cloudflare so the slugs can't be
 * scraped/verified programmatically; this derives them deterministically.
 *
 * Run: node tools/build-official-urls.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '..', 'data', 'attractions.json');
const BASE = 'https://londonpass.com/en/london-attractions/';

function slugify(name) {
  return String(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[’'`]/g, '')                              // drop apostrophes: st pauls
    .replace(/&/g, ' and ')                             // & -> and
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                        // non-alnum -> hyphen
    .replace(/^-+|-+$/g, '')                            // trim hyphens
    .replace(/-+/g, '-');                               // collapse
}

const list = JSON.parse(await fs.readFile(dataPath, 'utf8'));
for (const a of list) {
  a.official_slug = slugify(a.name);
  a.official_url = BASE + a.official_slug;
}
await fs.writeFile(dataPath, JSON.stringify(list, null, 2) + '\n');

console.log(`Added official_url to ${list.length} attractions.\nSample:`);
for (const a of list.slice(0, 12)) console.log('  ' + a.name.padEnd(42) + ' -> ' + a.official_url);
