const BASE = 'https://bgexeijtkaotgvqxcrbk.supabase.co';
const KEY = process.env.ANON_KEY;

async function rpc(name, body) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return `${name.padEnd(24)} [${res.status}] ${text}`;
}

const bad = { p_password: 'definitely-wrong-password', p_current: 'x', p_new: 'x', p_game_id: 'game-nope', p_new_title: 'x' };

console.log(await rpc('creator_is_configured', {}));
console.log(await rpc('creator_verify_password', { p_password: bad.p_password }));
console.log(await rpc('creator_verify_password', { p_password: '' }));
console.log(await rpc('creator_set_password', { p_current: 'x', p_new: 'ab' }));
console.log(await rpc('creator_rename_game', { p_game_id: bad.p_game_id, p_new_title: 'x', p_password: bad.p_password }));
console.log(await rpc('creator_delete_game', { p_game_id: bad.p_game_id, p_password: bad.p_password }));
console.log(await rpc('creator_purge_artwork', { p_password: bad.p_password }));
console.log(await rpc('cleanup_orphan_games', {}));