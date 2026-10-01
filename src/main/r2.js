import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { basename } from 'path'

/**
 * Shared catalog artwork on Cloudflare R2.
 *
 * One canonical image per game for every player, keyed by game id:
 *   covers/{gameId}.jpg
 *   banners/{gameId}.jpg
 *   logos/{gameId}.png
 *
 * Covers and banners are opaque, so they are re-encoded as JPEG. Logos keep
 * PNG because they rely on transparency.
 */
const TARGETS = {
  cover: { prefix: 'covers', width: 600, height: 900, fit: 'cover', format: 'jpeg', quality: 82 },
  banner: { prefix: 'banners', width: 920, height: 430, fit: 'cover', format: 'jpeg', quality: 82 },
  logo: { prefix: 'logos', width: 1280, height: 720, fit: 'inside', format: 'png' }
}

function getClient(settings) {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = settings || {}
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey }
  })
}

export function isR2Configured(settings) {
  return Boolean(
    settings?.r2AccountId &&
    settings?.r2AccessKeyId &&
    settings?.r2SecretAccessKey &&
    settings?.r2Bucket &&
    settings?.r2PublicUrl
  )
}

async function compress(localPath, target) {
  let pipeline = sharp(localPath, { failOn: 'none' }).rotate()
  pipeline =
    target.fit === 'cover'
      ? pipeline.resize(target.width, target.height, { fit: 'cover', position: 'attention' })
      : pipeline.resize(target.width, target.height, { fit: 'inside', withoutEnlargement: true })

  const body =
    target.format === 'jpeg'
      ? await pipeline.jpeg({ quality: target.quality, mozjpeg: true }).toBuffer()
      : await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()

  const ext = target.format === 'jpeg' ? 'jpg' : 'png'
  return { body, ext, contentType: target.format === 'jpeg' ? 'image/jpeg' : 'image/png' }
}

/**
 * Upload one artwork file and return its public URL.
 * Returns null when R2 is not configured or the local file cannot be read.
 */
export async function uploadArtwork(settings, gameId, kind, localPath) {
  const client = getClient(settings)
  const target = TARGETS[kind]
  if (!client || !target || !localPath || !gameId) return null

  const { body, ext, contentType } = await compress(localPath, target)
  const key = `${target.prefix}/${gameId}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: settings.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )

  return `${settings.r2PublicUrl.replace(/\/$/, '')}/${key}`
}

export async function deleteArtwork(settings, gameId, kind) {
  const client = getClient(settings)
  const target = TARGETS[kind]
  if (!client || !target || !gameId) return false
  const key = `${target.prefix}/${gameId}.jpg`
  await client.send(new DeleteObjectCommand({ Bucket: settings.r2Bucket, Key: key }))
  return true
}

/**
 * Build the public URL for an already-uploaded object without touching the
 * network. Used by the renderer to construct display URLs from game ids.
 */
export function artworkUrl(settings, gameId, kind) {
  const target = TARGETS[kind]
  if (!settings?.r2PublicUrl || !target || !gameId) return null
  const ext = target.format === 'jpeg' ? 'jpg' : 'png'
  return `${settings.r2PublicUrl.replace(/\/$/, '')}/${target.prefix}/${gameId}.${ext}`
}

/**
 * Option C publish policy: fill only the gaps.
 *
 * The `existing` map holds the URLs already recorded in the shared catalog.
 * Returns the columns this upload is allowed to set: null for a column means
 * "already claimed by someone else, leave it alone".
 */
export function claimSlots(existing, offered) {
  const patch = {}
  const skipped = []
  for (const kind of ['cover', 'banner', 'logo']) {
    const url = offered[kind]
    if (!url) continue
    if (existing[kind]) {
      skipped.push(kind)
      continue
    }
    patch[kind] = url
  }
  return { patch, skipped }
}

export function kindFromSuffix(fileName) {
  const m = basename(fileName || '').match(/-(cover|banner|logo)(?:-\d+)?\.(png|jpe?g)$/i)
  return m ? m[1].toLowerCase() : null
}