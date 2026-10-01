import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fetchGameData } from './steam-store.js'
import { searchGameId, getCovers, getHeroes, getLogos } from './steamgriddb.js'
import { downloadImage, buildArtworkFilename, getExtensionFromUrl } from './downloader.js'
import { getSettings } from '../settings.js'
import { updateGame } from '../storage.js'

export async function fetchGameMetadata(gameId, gameTitle) {
  const settings = getSettings()
  const artworkDir = settings.artworkDir

  if (!existsSync(artworkDir)) {
    mkdirSync(artworkDir, { recursive: true })
  }

  const result = {
    success: false,
    metadata: null,
    artwork: { cover: null, banner: null, logo: null },
    errors: []
  }

  const steamResult = await fetchGameData(gameTitle)
  if (steamResult.success && steamResult.found) {
    result.metadata = steamResult.data
  } else if (steamResult.success) {
    result.errors.push(`Steam Storefront: ${steamResult.error || 'No results found'}`)
  } else {
    result.errors.push(`Steam Storefront: ${steamResult.error}`)
  }

  if (settings.steamgriddbToken) {
    const sgdbSearch = await searchGameId(gameTitle, settings.steamgriddbToken)

    if (sgdbSearch.success) {
      const sgdbId = sgdbSearch.data.id

      const coversResult = await getCovers(sgdbId, settings.steamgriddbToken)
      if (coversResult.success && coversResult.data.length > 0) {
        const coverUrl = coversResult.data[0].url
        const coverExt = getExtensionFromUrl(coverUrl)
        const coverFilename = buildArtworkFilename(gameId, 'cover', coverExt)
        const coverPath = join(artworkDir, coverFilename)

        const dlResult = await downloadImage(coverUrl, coverPath)
        if (dlResult.success) {
          result.artwork.cover = coverPath
        } else {
          result.errors.push(`Cover download: ${dlResult.error}`)
        }
      } else {
        result.errors.push(`Covers: ${coversResult.error}`)
      }

      const heroesResult = await getHeroes(sgdbId, settings.steamgriddbToken)
      if (heroesResult.success && heroesResult.data.length > 0) {
        const bannerUrl = heroesResult.data[0].url
        const bannerExt = getExtensionFromUrl(bannerUrl)
        const bannerFilename = buildArtworkFilename(gameId, 'banner', bannerExt)
        const bannerPath = join(artworkDir, bannerFilename)

        const dlResult = await downloadImage(bannerUrl, bannerPath)
        if (dlResult.success) {
          result.artwork.banner = bannerPath
        } else {
          result.errors.push(`Banner download: ${dlResult.error}`)
        }
      } else {
        result.errors.push(`Heroes: ${heroesResult.error}`)
      }

      const logosResult = await getLogos(sgdbId, settings.steamgriddbToken)
      if (logosResult.success && logosResult.data.length > 0) {
        const logoUrl = logosResult.data[0].url
        const logoExt = getExtensionFromUrl(logoUrl)
        const logoFilename = buildArtworkFilename(gameId, 'logo', logoExt)
        const logoPath = join(artworkDir, logoFilename)

        const dlResult = await downloadImage(logoUrl, logoPath)
        if (dlResult.success) {
          result.artwork.logo = logoPath
        } else {
          result.errors.push(`Logo download: ${dlResult.error}`)
        }
      }
    } else {
      result.errors.push(`SteamGridDB search: ${sgdbSearch.error}`)
    }
  } else {
    result.errors.push('SteamGridDB: Token not configured')
  }

  if (!result.artwork.cover && result.metadata?.background_image) {
    const coverExt = getExtensionFromUrl(result.metadata.background_image)
    const coverFilename = buildArtworkFilename(gameId, 'cover', coverExt)
    const coverPath = join(artworkDir, coverFilename)

    const dlResult = await downloadImage(result.metadata.background_image, coverPath)
    if (dlResult.success) {
      result.artwork.cover = coverPath
    } else {
      result.errors.push(`Steam cover download: ${dlResult.error}`)
    }
  }

  if (!result.artwork.banner && result.metadata?.banner_image) {
    const bannerExt = getExtensionFromUrl(result.metadata.banner_image)
    const bannerFilename = buildArtworkFilename(gameId, 'banner', bannerExt)
    const bannerPath = join(artworkDir, bannerFilename)

    const dlResult = await downloadImage(result.metadata.banner_image, bannerPath)
    if (dlResult.success) {
      result.artwork.banner = bannerPath
    } else {
      result.errors.push(`Steam banner download: ${dlResult.error}`)
    }
  }

  const updates = {}

  if (result.metadata) {
    if (result.metadata.genres?.length) updates.genres = result.metadata.genres
    if (result.metadata.developers?.length) updates.developer = result.metadata.developers[0]
    if (result.metadata.publishers?.length) updates.publisher = result.metadata.publishers[0]
    if (result.metadata.released) updates.releaseDate = result.metadata.released
    if (result.metadata.description) updates.description = result.metadata.description
    if (result.metadata.platforms?.length) updates.platforms = result.metadata.platforms
    if (result.metadata.rating) updates.rawgRating = result.metadata.rating
  }

  if (result.artwork.cover) updates.coverImage = result.artwork.cover
  if (result.artwork.banner) updates.bannerImage = result.artwork.banner
  if (result.artwork.logo) updates.logoImage = result.artwork.logo

  if (Object.keys(updates).length > 0) {
    updateGame(gameId, updates)
  }

  result.success = result.metadata !== null || result.artwork.cover !== null

  return result
}
