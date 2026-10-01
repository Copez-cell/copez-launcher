import fs from 'fs';
import path from 'path';

const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const ANON = process.env.ANON_KEY;
const [email, password] = fs
  .readFileSync(path.join(process.env.TEMP, 'copez_newpass.txt'), 'utf8')
  .trim()
  .split('\n');

const authRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const auth = await authRes.json();
if (!auth.access_token) {
  console.error('login failed:', JSON.stringify(auth).slice(0, 200));
  process.exit(1);
}
console.log(`signed in as ${auth.user.id}\n`);

const h = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` };
const get = async (t, q) => (await fetch(`${BASE}/rest/v1/${t}?${q}`, { headers: h })).json();

const ug = await get('user_games', 'select=total_hours,is_platinum,average_rating');
const libs = await get('user_libraries', 'select=collections,updated_at');
const games = await get('games', 'select=id,cover_url,banner_url,logo_url');

const played = ug.filter((r) => r.total_hours > 0);
const hours = ug.reduce((a, b) => a + (b.total_hours || 0), 0) / 3600;
const cols = libs[0]?.collections || [];

console.log(`user_games:      ${ug.length} rows (${played.length} with playtime, ${hours.toFixed(1)} hours)`);
console.log(`platinum:        ${ug.filter((r) => r.is_platinum).length}`);
console.log(`rated:           ${ug.filter((r) => r.average_rating > 0).length}`);
console.log(`collections:     ${cols.map((c) => `${c.name} (${c.gameIds.length})`).join(', ')}`);
console.log(`catalog artwork: ${games.filter((g) => g.cover_url).length} covers, ${games.filter((g) => g.banner_url).length} banners, ${games.filter((g) => g.logo_url).length} logos`);

console.log(`\nprofile: ${JSON.stringify(await get('users', 'select=username'))}`);