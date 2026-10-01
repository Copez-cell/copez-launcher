import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Lazy-load a game image with a shared-catalog fallback.
 *
 * `imagePath` is the local file. When it is missing, `fallbackUrl` (the
 * Cloudflare R2 URL from the shared catalog) is used instead, so every player
 * sees artwork even for games they have never downloaded images for.
 */
export function useLazyImage(gameId, imagePath, enabled = true, fallbackUrl = null) {
  const [src, setSrc] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  useEffect(() => {
    if (!isVisible) return
    // A resolved image should not be discarded when props change later.
    if (src) return

    let cancelled = false

    // No local file: the shared catalog image is already a usable URL.
    if (!imagePath) {
      if (fallbackUrl) setSrc(fallbackUrl)
      return () => { cancelled = true }
    }

    window.api.artwork
      .getUrl(imagePath)
      .then((url) => {
        if (cancelled) return
        setSrc(url || fallbackUrl || null)
      })
      .catch(() => {
        if (!cancelled) setSrc(fallbackUrl || null)
      })

    return () => {
      cancelled = true
    }
  }, [isVisible, imagePath, fallbackUrl, src])

  // If the local path is cleared later, drop the stale resolved URL.
  useEffect(() => {
    if (!imagePath && src && src !== fallbackUrl) setSrc(fallbackUrl || null)
  }, [imagePath, fallbackUrl, src])

  return { ref, src }
}

/** Derive the shared R2 URL for a game/kind without an IPC round trip. */
export function sharedArtworkUrl(publicBase, gameId, kind) {
  if (!publicBase || !gameId) return null
  const prefix = kind === 'cover' ? 'covers' : kind === 'banner' ? 'banners' : 'logos'
  const ext = kind === 'logo' ? 'png' : 'jpg'
  return `${publicBase}/${prefix}/${gameId}.${ext}`
}