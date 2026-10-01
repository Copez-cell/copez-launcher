import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

// ---------- config ----------
const SETTINGS = path.join(process.env.APPDATA, 'copez-launcher', 'settings.json');
const ART_DIR = path.join(process.env.APPDATA, 'copez-launcher', 'artwork');
const cfg = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket } = cfg;

const HOST = `${r2AccountId}.r2.cloudflarestorage.com`;
const REGION = 'auto';
const SERVICE = 's3';
const PUBLIC = cfg.r2PublicUrl.replace(/\/$/, '');

// Compression targets (cover/banner = opaque -> JPEG, logo = transparent -> PNG)
const TARGETS = {
  cover:  { width: 600,  height: 900,  fit: 'cover', format: 'jpeg', quality: 82 },
  banner: { width: 920,  height: 430,  fit: 'cover', format: 'jpeg', quality: 82 },
  logo:   { width: 1280, height: 720,  fit: 'inside', format: 'png', compressionLevel: 9 }
};

// ---------- R2 SigV4 ----------
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = data => crypto.createHash('sha256').update(data).digest('hex');

async function r2Request(method, uriPath, { body, contentType } = {}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body ?? Buffer.alloc(0));

  const canonicalHeaders =
    `host:${HOST}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [method, uriPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kSigning = hmac(hmac(hmac(hmac(`AWS4${r2SecretAccessKey}`, dateStamp), REGION), SERVICE), 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  const res = await fetch(`https://${HOST}${uriPath}`, {
    method,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${r2AccessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Host: HOST,
      ...(contentType ? { 'Content-Type': contentType } : {})
    },
    body
  });
  return res;
}

// ---------- plan ----------
const plan = JSON.parse(fs.readFileSync(path.resolve('r2-upload-plan.json'), 'utf8'));
const only = process.argv[2]; // optional: 'cover' | 'banner' | 'logo'

const jobs = only ? plan.filter(j => j.kind === only) : plan;
console.log(`uploading ${jobs.length} files${only ? ` (${only} only)` : ''}\n`);

// Keep the best (smallest) file per game+kind, preferring higher resolution
const byKey = new Map();
for (const j of jobs) {
  const key = `${j.gameId}:${j.kind}`;
  const size = fs.statSync(path.join(ART_DIR, j.name)).size;
  const prev = byKey.get(key);
  if (!prev) { byKey.set(key, { ...j, size }); continue; }
  // -cover-1790725758990.jpg are duplicate re-downloads; keep the smallest
  if (size < prev.size) byKey.set(key, { ...j, size });
}
const unique = [...byKey.values()];
console.log(`deduplicated to ${unique.length} (${jobs.length - unique.length} redundant re-downloads dropped)\n`);

const CONCURRENCY = 6;
let done = 0, failed = 0, rawBytes = 0, outBytes = 0;
const urls = {};

async function processOne(job) {
  const t = TARGETS[job.kind];
  const src = path.join(ART_DIR, job.name);
  try {
    let pipeline = sharp(src, { failOn: 'none' }).rotate();
    pipeline = t.fit === 'cover'
      ? pipeline.resize(t.width, t.height, { fit: 'cover', position: 'attention' })
      : pipeline.resize(t.width, t.height, { fit: 'inside', withoutEnlargement: true });

    const out = t.format === 'jpeg'
      ? await pipeline.jpeg({ quality: t.quality, mozjpeg: true }).toBuffer()
      : await pipeline.png({ compressionLevel: t.compressionLevel, palette: true }).toBuffer();

    const key = `${job.kind === 'cover' ? 'covers' : job.kind === 'banner' ? 'banners' : 'logos'}/${job.gameId}.${t.format === 'jpeg' ? 'jpg' : 'png'}`;
    const res = await r2Request('PUT', `/${r2Bucket}/${key}`, {
      body: out,
      contentType: t.format === 'jpeg' ? 'image/jpeg' : 'image/png'
    });

    rawBytes += job.size;
    outBytes += out.length;

    if (res.status >= 300) {
      failed++;
      console.log(`  FAIL [${res.status}] ${key}`);
    } else {
      urls[`${job.gameId}:${job.kind}`] = `${PUBLIC}/${key}`;
    }
  } catch (err) {
    failed++;
    console.log(`  ERR ${job.name}: ${err.message}`);
  }

  done++;
  if (done % 50 === 0 || done === unique.length) {
    const pct = ((done / unique.length) * 100).toFixed(0);
    const ratio = outBytes ? (rawBytes / outBytes).toFixed(1) : '-';
    process.stdout.write(`  ${done}/${unique.length} (${pct}%)  ${(outBytes/1048576).toFixed(1)} MB  ${ratio}x smaller\n`);
  }
}

const queue = [...unique];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      await processOne(queue.shift());
    }
  })
);

console.log(`\ndone. uploaded=${done - failed} failed=${failed}`);
console.log(`raw ${(rawBytes/1048576).toFixed(1)} MB -> ${(outBytes/1048576).toFixed(1)} MB`);
fs.writeFileSync(path.resolve('r2-urls.json'), JSON.stringify(urls, null, 2));
console.log('Wrote r2-urls.json');