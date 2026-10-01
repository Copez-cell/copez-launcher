import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.APPDATA, 'copez-launcher', 'data');
const OLD_UID = '5a1f77ee-cb3d-45b3-84e8-bd9e9e929ec1';

function readUserFile(name, uid) {
  const p = path.join(DATA_DIR, `${name}_${uid}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const gamesDoc = readUserFile('games', OLD_UID);
const collectionsDoc = readUserFile('collections', OLD_UID);
const tiersDoc = readUserFile('tiers', OLD_UID);

const games = gamesDoc.games || [];
const collections = collectionsDoc.collections || [];

console.log(`local games:      ${games.length}`);
console.log(`local collections:${collections.length}`);
console.log(`local tiers:      ${(tiersDoc.tiers || []).length} (assignments: ${Object.keys(tiersDoc.assignments || {}).length})`);

// Which local fields must be dropped before the snapshot is pushed?
// Mirrors librarySync.js stripRuntimeFields + urlFields nulling.
const DROP = new Set(['hardwareLogs']);

const cloudGames = games.map(g => {
  const copy = { ...g };
  for (const k of Object.keys(copy)) {
    if (DROP.has(k)) delete copy[k];
  }
  // Artwork stays local; cloud columns are never populated from local paths.
  copy.coverUrl = null;
  copy.bannerUrl = null;
  copy.logoUrl = null;
  return copy;
});

const payload = {
  user_games: games.map(g => ({
    user_id: process.env.TARGET_USER_ID,
    game_id: g.id,
    total_hours: g.playtime || 0,
    is_platinum: g.isPlatinum || false,
    average_rating: typeof g.averageRating === 'number' && g.averageRating !== 0 ? g.averageRating : null,
    historical_playtime: g.historicalPlaytime || {},
    first_played: g.firstPlayed || null,
    last_played: g.lastPlayed || null,
    date_finished: g.dateFinished || null,
  })),
  catalog: [...new Set(games.map(g => g.id))].map(id => ({
    id,
    title: (games.find(g => g.id === id) || {}).title || id,
    cover_url: null,
    banner_url: null,
    is_deleted: false
  })),
  library: {
    user_id: process.env.TARGET_USER_ID,
    games: cloudGames,
    collections: collections.map(c => ({ id: c.id, name: c.name, gameIds: c.gameIds || [] })),
    updated_at: new Date().toISOString()
  }
};

const out = path.resolve('import-payload.json');
fs.writeFileSync(out, JSON.stringify(payload, null, 2));

console.log(`\ncatalog rows:     ${payload.catalog.length}`);
console.log(`user_games rows:  ${payload.user_games.length}`);
console.log(`with playtime:    ${payload.user_games.filter(r => r.total_hours > 0).length}`);
console.log(`\nWrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
fs.writeFileSync(path.resolve('import-tiers.json'), JSON.stringify(tiersDoc, null, 2));
console.log('Wrote import-tiers.json (reference only - tiers are not synced to cloud)');