import { useEffect, useState, useCallback } from 'react'
import { useCloudLibrary } from '../hooks/useCloudLibrary'

/**
 * Shared catalog artwork.
 *
 * Precedence is local-first: a file the player already has on disk always
 * wins, and the shared Cloudflare R2 URL is the fallback so every player sees
 * images for games they have never downloaded artwork for.
 *
 * Force `localFirst={false}` where the shared image should always be preferred.
 */
export function useSharedArtwork() {
  const { cloudGames } = useCloudLibrary()
  const [cloudBase, setCloudBase] = useState(null)

  useEffect(() => {
    let cancelled = false
    window.api?.artwork
      ?.cloudConfig?.()
      .then((config) => {
        if (!cancelled && config?.configured) setCloudBase(config.publicUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const sharedById = useCallback(() => {
    const map = new Map()
    for (const g of cloudGames || []) {
      if (!g?.id) continue
      map.set(g.id, {
        coverUrl: g.coverUrl || null,
        bannerUrl: g.bannerUrl || null,
        logoUrl: g.logoUrl || null
      })
    }
    return map
  }, [cloudGames])

  /** Shared URL for one kind, derived from the game id (no network call). */
  const sharedUrl = useCallback(
    (gameId, kind) => {
      if (!cloudBase || !gameId) return null
      const prefix = kind === 'cover' ? 'covers' : kind === 'banner' ? 'banners' : 'logos'
      const ext = kind === 'logo' ? 'png' : 'jpg'
      return `${cloudBase}/${prefix}/${gameId}.${ext}`
    },
    [cloudBase]
  )

  /**
   * Resolve a displayable URL for one artwork kind.
   * Local path wins when it exists; otherwise fall back to the shared URL.
   */
  const resolve = useCallback(
    async (game, kind) => {
      if (!game) return null
      const localField = kind === 'cover' ? 'coverImage' : kind === 'banner' ? 'bannerImage' : 'logoImage'
      const localPath = game[localField]
      const fromCloudRow = sharedById().get(game.id)?.[`${kind}Url`] || null
      const fallback = fromCloudRow || sharedUrl(game.id, kind)

      if (!localPath) return fallback
      const local = await window.api.artwork.getUrl(localPath)
      return local || fallback
    },
    [sharedById, sharedUrl]
  )

  /** Synchronous cloud-only lookup for render paths that cannot await. */
  const shared = useCallback(
    (game, kind) => {
      if (!game?.id) return null
      return sharedById().get(game.id)?.[`${kind}Url`] || sharedUrl(game.id, kind)
    },
    [sharedById, sharedUrl]
  )

  return { resolve, shared, sharedUrl, cloudBase, isConfigured: Boolean(cloudBase) }
}