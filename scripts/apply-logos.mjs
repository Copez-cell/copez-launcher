import fs from 'fs';
import path from 'path';

const ANON = process.env.ANON_KEY;
const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const TOKEN = process.env.ACCESS_TOKEN;
const headers = { apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const urls = JSON.parse(fs.readFileSync(path.resolve('r2-urls.json'), 'utf8'));

async function get(table, query) {
  const res = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${table}: [${res.status}] ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// Does logo_url exist yet?
let hasColumn = true;
try {
  await get('games', 'select=logo_url&limit=1');
} catch {
  hasColumn = false;
}

if (!hasColumn) {
  console.log('logo_url column does not exist yet.');
  console.log('Run supabase-add-logo-url.sql in the Supabase SQL Editor, then re-run this script.');
  process.exit(2);
}

const cloud = await get('games', 'select=id,cover_url,banner_url,logo_url&limit=1000');
console.log(`catalog rows: ${cloud.length}`);

const updates = [];
let filled = 0, skipped = 0, none = 0;

for (const g of cloud) {
  const logo = urls[`${g.id}:logo`] || null;
  if (!logo) { none++; continue; }
  if (g.logo_url && !process.env.FORCE) { skipped++; continue; }
  updates.push({ id: g.id, logo_url: logo });
  filled++;
}

console.log(`logos available locally: ${Object.keys(urls).filter(k => k.endsWith(':logo')).length}`);
console.log(`  to fill: ${filled}`);
console.log(`  already set (first-writer-wins): ${skipped}`);
console.log(`  no logo available: ${none}`);

if (process.env.SKIP_APPLY === '1') {
  console.log('\nSKIP_APPLY set: no writes performed.');
  process.exit(0);
}

let done = 0;
for (const u of updates) {
  const res = await fetch(`${BASE}/rest/v1/games?id=eq.${encodeURIComponent(u.id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ logo_url: u.logo_url })
  });
  if (res.status >= 300) console.log(`  FAIL ${u.id}: [${res.status}] ${(await res.text()).slice(0, 100)}`);
  else done++;
}
console.log(`\napplied: ${done}`);

const after = await get('games', 'select=id,cover_url,banner_url,logo_url&limit=1000');
const c = after.filter(g => g.cover_url).length;
const b = after.filter(g => g.banner_url).length;
const l = after.filter(g => g.logo_url).length;
console.log(`\nFINAL catalog artwork (${after.length} games):`);
console.log(`  covers: ${c}`);
console.log(`  banners: ${b}`);
console.log(`  logos:   ${l}`);

// sample-check that a logo URL is actually live
const sample = after.find(g => g.logo_url);
if (sample) {
  const r = await fetch(sample.logo_url, { method: 'HEAD' });
  console.log(`\nlogo reachable: [${r.status}] ${sample.logo_url}`);
}