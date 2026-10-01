import { existsSync } from 'fs'
import { pathToFileURL } from 'url'

export function getArtworkUrl(imagePath) {
  if (!imagePath) return null

  if (/^https?:\/\//i.test(imagePath)) return imagePath

  if (!existsSync(imagePath)) return null

  return pathToFileURL(imagePath).href
}

export function resolveArtworkBatch(entries) {
  return (entries || []).map(({ localPath, fallbackUrl }) => {
    if (!localPath) return fallbackUrl || null
    if (/^https?:\/\//i.test(localPath)) return localPath
    if (existsSync(localPath)) return localPath
    return fallbackUrl || null
  })
}

export function getArtworkUrls(game) {
  return {
    coverUrl: getArtworkUrl(game.coverImage),
    bannerUrl: getArtworkUrl(game.bannerImage)
  }
}
