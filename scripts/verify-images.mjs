import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'copez-launcher', 'settings.json'), 'utf8'));
const PUBLIC = cfg.r2PublicUrl.replace(/\/$/, '');
const urls = JSON.parse(fs.readFileSync(path.resolve('r2-urls.json'), 'utf8'));

const base = Object.values(urls)[0];
const res = await fetch(base);
const buf = Buffer.from(await res.arrayBuffer());
const meta = await sharp(buf).metadata();
console.log(`sample cover url: ${base}`);
console.log(`  format=${meta.format} ${meta.width}x${meta.height} bytes=${buf.length}`);

for (const kind of ['cover', 'banner', 'logo']) {
  const entry = Object.entries(urls).find(([k]) => k.endsWith(`:${kind}`));
  if (!entry) { console.log(`${kind}: none`); continue; }
  const r = await fetch(entry[1]);
  const b = Buffer.from(await r.arrayBuffer());
  const m = await sharp(b).metadata();
  console.log(`${kind.padEnd(7)} ${String(m.width).padStart(4)}x${String(m.height).padStart(4)} ${m.format.padEnd(4)} ${(b.length/1024).toFixed(0).padStart(5)} KB  ${r.status}`);
}