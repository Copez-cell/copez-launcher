import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

export async function downloadImage(url, destPath) {
  const dir = join(destPath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    const fileStream = createWriteStream(destPath)
    await pipeline(Readable.fromWeb(response.body), fileStream)
    return { success: true, path: destPath }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export function buildArtworkFilename(gameId, type, extension) {
  const safeName = gameId.replace(/[^a-zA-Z0-9-_]/g, '_')
  return `${safeName}-${type}.${extension}`
}

export function getExtensionFromUrl(url) {
  const pathname = new URL(url).pathname
  const ext = pathname.split('.').pop()?.toLowerCase() || 'jpg'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }
  return 'jpg'
}
