import fs from 'fs';
import path from 'path';

const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const KEY = process.env.ANON_KEY;
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;

const H = () => ({
  apikey: KEY,
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal'
});

let TOKEN;

async function rest(table, method, body, prefer) {
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${BASE}/rest/v1/${table}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, text };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  // 1. Authenticate
  const authRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const auth = await authRes.json();
  if (!auth.access_token) {
    console.error('Login failed:', JSON.stringify(auth).slice(0, 200));
    process.exit(1);
  }
  TOKEN = auth.access_token;
  const uid = auth.user.id;
  console.log(`authenticated as ${uid}\n`);

  const payload = JSON.parse(fs.readFileSync(path.resolve('import-payload.json'), 'utf8'));

  // 2. Ensure the profile row exists and give it a real username
  const prof = await rest('users', 'POST', {
    id: uid,
    username: 'Copez',
    avatar_url: null,
    banner_url: null
  }, 'resolution=merge-duplicates');
  console.log(`users upsert: [${prof.status}] ${prof.text.slice(0, 120)}`);

  // 3. Insert catalog rows (games)
  for (const batch of chunk(payload.catalog, 100)) {
    const r = await rest('games', 'POST', batch, 'resolution=merge-duplicates,return=minimal');
    console.log(`  games batch (${batch.length}): [${r.status}] ${r.text.slice(0, 160)}`);
    if (r.status >= 300) break;
  }

  // 4. Insert per-player stats (user_games)
  let ok = 0;
  for (const batch of chunk(payload.user_games, 100)) {
    const r = await rest('user_games', 'POST', batch, 'resolution=merge-duplicates,return=minimal');
    console.log(`  user_games batch (${batch.length}): [${r.status}] ${r.text.slice(0, 160)}`);
    if (r.status >= 300) break;
    ok += batch.length;
  }

  // 5. Insert the full library snapshot (games + collections)
  const lib = await rest('user_libraries', 'POST', payload.library, 'resolution=merge-duplicates,return=minimal');
  console.log(`\nuser_libraries: [${lib.status}] ${lib.text.slice(0, 160)}`);

  // 6. Verify
  console.log('\n--- verification ---');
  for (const [table, q] of [
    ['games', 'select=id&limit=1000'],
    ['user_games', 'select=game_id&limit=1000'],
    ['user_libraries', 'select=user_id'],
    ['users', 'select=id,username']
  ]) {
    const res = await fetch(`${BASE}/rest/v1/${table}?${q}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}` }
    });
    const rows = JSON.parse(await res.text());
    console.log(`${table.padEnd(15)} ${Array.isArray(rows) ? rows.length : '?'} rows`);
  }

  // playtime total sanity check
  const sum = await fetch(`${BASE}/rest/v1/user_games?select=total_hours&total_hours=gt.0`, {
    headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}` }
  });
  const played = JSON.parse(await sum.text());
  const totalSec = played.reduce((a, b) => a + (b.total_hours || 0), 0);
  console.log(`\ngames with playtime: ${played.length}`);
  console.log(`total playtime: ${(totalSec / 3600).toFixed(1)} hours`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });