import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.env.APPDATA, 'copez-launcher', 'data');
const ART_DIR = path.join(process.env.APPDATA, 'copez-launcher', 'artwork');
const GAME_IDS = new Set(
  (JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'games_5a1f77ee-cb3d-45b3-84e8-bd9e9e929ec1.json'), 'utf8')).games || []).map(g => g.id)
);

const files = fs.readdirSync(ART_DIR).filter(f => fs.statSync(path.join(ART_DIR, f)).isFile());

const keep = [];
for (const name of files) {
  let kind = null;
  let gameId = null;
  const m = name.match(/^(.+?)-(cover|banner|logo)(?:-\d+)?\.(png|jpe?g)$/i);
  if (m) {
    kind = m[2].toLowerCase();
    gameId = m[1];
  }
  if (kind && GAME_IDS.has(gameId)) {
    keep.push({ name, kind, gameId });
  }
}

const byKind = keep.reduce((acc, k) => { acc[k.kind] = (acc[k.kind] || 0) + 1; return acc; }, {});
console.log(`matched files: ${keep.length}`);
console.log(`  covers: ${byKind.cover || 0}`);
console.log(`  banners: ${byKind.banner || 0}`);
console.log(`  logos:   ${byKind.logo || 0}`);
console.log(`  skipped orphans: ${files.length - keep.length}`);

const bytes = keep.reduce((sum, k) => sum + fs.statSync(path.join(ART_DIR, k.name)).size, 0);
console.log(`\nraw total: ${(bytes / 1024 / 1024).toFixed(1)} MB`);

fs.writeFileSync(path.resolve('r2-upload-plan.json'), JSON.stringify(keep, null, 2));
console.log('Wrote r2-upload-plan.json');