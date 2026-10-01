import fs from 'fs';
import path from 'path';

const ANON = process.env.ANON_KEY;
const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const TOKEN = process.env.ACCESS_TOKEN;

const dataDir = path.join(process.env.APPDATA, 'copez-launcher', 'data');
const localGames = JSON.parse(fs.readFileSync(path.join(dataDir, 'games_4680307a-e42f-40f5-aa3e-cbbf6d5eade9.json'), 'utf8'));
const catalog = localGames.games || [];
const urls = JSON.parse(fs.readFileSync(path.resolve('r2-urls.json'), 'utf8'));

const headers = { apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function get(table, query) {
  const res = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers });
  return { status: res.status, rows: JSON.parse(await res.text()) };
}

const { rows: cloudGames } = await get('games', 'select=id,title,cover_url,banner_url&limit=1000');
console.log(`catalog rows in cloud: ${cloudGames.length}`);

let withCover = 0, withBanner = 0;
for (const g of cloudGames) {
  if (g.cover_url) withCover++;
  if (g.banner_url) withBanner++;
}
console.log(`currently: ${withCover} covers, ${withBanner} banners\n`);

// Option C: first-writer-wins. Only write where the column is still NULL,
// unless FORCE=1 (creator override).
const FORCE = process.env.FORCE === '1';

let updates = [];
let created = 0;
let skipped = 0;
let noArt = 0;

for (const g of cloudGames) {
  const cover = urls[`${g.id}:cover`] || null;
  const banner = urls[`${g.id}:banner`] || null;

  if (!cover && !banner) { noArt++; continue; }

  const patch = {};
  if (cover && (FORCE || !g.cover_url)) patch.cover_url = cover;
  if (banner && (FORCE || !g.banner_url)) patch.banner_url = banner;

  if (Object.keys(patch).length === 0) { skipped++; continue; }

  // logo has no cloud column yet; attach to the catalog row via the
  // user_games-independent artwork map in app_config instead
  updates.push({ id: g.id, patch });
  created++;
}

console.log(`games with no local art:  ${noArt}`);
console.log(`already set (skipped):    ${skipped}`);
console.log(`rows to update:           ${created}`);

if (FORCE) {
  console.log('\nFORCE mode: overwriting existing cover_url/banner_url');
} else {
  console.log('\nfirst-writer-wins: only filling NULL columns (creator override uses FORCE=1)');
}

// apply in batches
let applied = 0;
for (let i = 0; i < updates.length; i += 100) {
  const batch = updates.slice(i, i + 100);
  for (const u of batch) {
    const res = await fetch(`${BASE}/rest/v1/games?id=eq.${encodeURIComponent(u.id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(u.patch)
    });
    if (res.status >= 300) console.log(`  FAIL ${u.id}: [${res.status}] ${(await res.text()).slice(0, 120)}`);
    else applied++;
  }
  console.log(`  ${Math.min(i + 100, updates.length)}/${updates.length}`);
}

console.log(`\napplied: ${applied}`);

// logos: store in app_config as a single shared map
const logoMap = {};
for (const [key, url] of Object.entries(urls)) {
  if (key.endsWith(':logo')) logoMap[key.split(':')[0]] = url;
}
console.log(`\nlogo entries: ${Object.keys(logoMap).length}`);

if (process.env.SKIP_APPLY !== '1') {
  const cfgRes = await fetch(`${BASE}/rest/v1/app_config`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'artwork_logo_map', value: logoMap })
  });
  console.log(`app_config artwork_logo_map: [${cfgRes.status}] ${cfgRes.status >= 300 ? (await cfgRes.text()).slice(0, 200) : ''}`);
}

// verify
const { rows: after } = await get('games', 'select=id,cover_url,banner_url&limit=1000');
const c = after.filter(g => g.cover_url).length;
const b = after.filter(g => g.banner_url).length;
console.log(`\nVERIFIED: ${c} covers, ${b} banners out of ${after.length} games`);
const { rows: cfgRows } = await get('app_config', 'select=key');
console.log(`app_config keys: ${cfgRows.map(r => r.key).join(', ')}`);