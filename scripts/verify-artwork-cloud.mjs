import fs from 'fs';
import path from 'path';

const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const ANON = process.env.ANON_KEY;
const TOKEN = process.env.ACCESS_TOKEN;
const headers = { apikey: ANON, Authorization: `Bearer ${TOKEN}` };

async function get(table, query) {
  const res = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers });
  if (res.status >= 300) throw new Error(`[${res.status}] ${(await res.text()).slice(0, 200)}`);
  return JSON.parse(await res.text());
}

// The exact shape the renderer uses
const rows = await get(
  'user_games',
  'select=game_id, games(id, title, cover_url, banner_url, logo_url)&limit=400'
);
console.log(`user_games rows joined to catalog: ${rows.length}\n`);

const seen = new Map();
for (const r of rows) {
  if (!r.games) continue;
  seen.set(r.games.id, r.games);
}

const catalog = [...seen.values()];
const counts = { cover: 0, banner: 0, logo: 0 };
for (const g of catalog) {
  if (g.cover_url) counts.cover++;
  if (g.banner_url) counts.banner++;
  if (g.logo_url) counts.logo++;
}
console.log(`catalog artwork coverage across your ${catalog.length} games:`);
console.log(`  covers:  ${counts.cover}`);
console.log(`  banners: ${counts.banner}`);
console.log(`  logos:   ${counts.logo}\n`);

// HEAD-check one of each through the public CDN
let checked = 0;
for (const kind of ['cover_url', 'banner_url', 'logo_url']) {
  const g = catalog.find(x => x[kind]);
  if (!g) { console.log(`${kind}: none`); continue; }
  const res = await fetch(g[kind], { method: 'HEAD' });
  console.log(`${kind.padEnd(10)} [${res.status}] ${res.headers.get('content-type')}  ${g.title}`);
  checked++;
}

// Confirm the raw table also returns the column
const raw = await get('games', 'select=id,cover_url,banner_url,logo_url&limit=2');
console.log('\nraw REST sample keys:', Object.keys(raw[0] || {}).join(', '));
console.log(`\n${checked}/3 artwork types verified reachable.`);