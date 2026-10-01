import fs from 'fs';
import path from 'path';

const urls = JSON.parse(fs.readFileSync(path.resolve('r2-urls.json'), 'utf8'));
const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.APPDATA, 'copez-launcher', 'settings.json'), 'utf8')
);

// Pull titles from the new-project local library so the preview is readable
const dataDir = path.join(process.env.APPDATA, 'copez-launcher', 'data');
let titles = {};
for (const f of fs.readdirSync(dataDir).filter(f => f.startsWith('games_'))) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    for (const g of json.games || []) titles[g.id] = g.title;
  } catch {}
}

const byGame = new Map();
for (const [key, url] of Object.entries(urls)) {
  const [id, kind] = key.split(':');
  if (!byGame.has(id)) byGame.set(id, {});
  byGame.get(id)[kind] = url;
}

const cards = [...byGame.entries()].map(([id, art]) => `
  <div class="card">
    <div class="row">
      ${art.cover ? `<img src="${art.cover}" loading="lazy">` : '<div class="none">no cover</div>'}
    </div>
    <div class="row">
      ${art.banner ? `<img class="banner" src="${art.banner}" loading="lazy">` : '<div class="none">no banner</div>'}
    </div>
    <div class="row logo">
      ${art.logo ? `<img class="logoimg" src="${art.logo}" loading="lazy">` : '<div class="none">no logo</div>'}
    </div>
    <div class="title">${(titles[id] || id).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>
  </div>`).join('\n');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>R2 artwork preview</title>
<style>
  body { background:#111; color:#eee; font:14px system-ui; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .meta { color:#888; margin-bottom:24px; font-size:13px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; padding:12px; }
  .row { display:flex; align-items:center; justify-content:center; min-height:40px; margin-bottom:8px; }
  img { max-width:100%; border-radius:4px; display:block; }
  .banner { width:100%; }
  .logoimg { max-height:70px; width:auto; background:#222; padding:6px; }
  .none { color:#555; font-size:12px; font-style:italic; }
  .title { font-weight:600; margin-top:4px; font-size:13px; }
</style>
</head>
<body>
<h1>Cloudflare R2 artwork preview</h1>
<div class="meta">${byGame.size} games &middot; bucket: ${cfg.r2Bucket} &middot; ${Object.keys(urls).length} images</div>
<div class="grid">
${cards}
</div>
</body>
</html>`;

const out = path.resolve('r2-preview.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${out}`);
console.log(`Games: ${byGame.size}, images: ${Object.keys(urls).length}`);