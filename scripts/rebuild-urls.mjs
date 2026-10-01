import fs from 'fs';
import path from 'path';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'copez-launcher', 'settings.json'), 'utf8'));
const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket } = cfg;
const PUBLIC = cfg.r2PublicUrl.replace(/\/$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey }
});

const KINDS = { covers: 'cover', banners: 'banner', logos: 'logo' };
const all = {};
let totalBytes = 0, totalCount = 0;

for (const [prefix, kind] of Object.entries(KINDS)) {
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: r2Bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token
    }));
    for (const o of res.Contents || []) {
      const gameId = o.Key.split('/')[1].replace(/\.(jpg|png)$/i, '');
      all[`${gameId}:${kind}`] = `${PUBLIC}/${o.Key}`;
      totalBytes += o.Size;
      totalCount++;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

const counts = {};
for (const k of Object.keys(all)) {
  const kind = k.split(':')[1];
  counts[kind] = (counts[kind] || 0) + 1;
}

console.log(`objects in bucket: ${totalCount}`);
console.log(`  covers: ${counts.cover || 0}`);
console.log(`  banners: ${counts.banner || 0}`);
console.log(`  logos:   ${counts.logo || 0}`);
console.log(`total: ${(totalBytes / 1048576).toFixed(1)} MB (was 1411.8 MB raw -> ${(1411.8 / (totalBytes / 1048576)).toFixed(1)}x smaller)`);

fs.writeFileSync(path.resolve('r2-urls.json'), JSON.stringify(all, null, 2));
console.log('\nWrote r2-urls.json');

// verify one object is actually reachable through the SDK
const firstKey = Object.values(all)[0];
if (firstKey) {
  const key = firstKey.replace(`${PUBLIC}/`, '');
  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
    console.log(`HEAD via SDK ok: ${key}`);
  } catch (e) {
    console.log(`HEAD via SDK failed: ${e.message}`);
  }
}