import { supabase } from './supabase'

let pushInFlight = false
const ARTWORK_TYPES = [
  ['coverImage', 'coverUrl'],
  ['bannerImage', 'bannerUrl'],
  ['logoImage', 'logoUrl']
]

function stripRuntimeFields(game) {
  const copy = { ...game }
  delete copy.hardwareLogs
  return copy
}

/**
 * Upload any local artwork that the shared catalog is still missing, then
 * record the resulting URLs on the shared `games` rows.
 *
 * Option C: fill only gaps. A game whose cover is already set keeps the
 * existing image; other players never clobber art someone else contributed.
 */
export async function publishArtworkToCloud({ force = false } = {}) {
  const stats = { uploaded: 0, filled: 0, skipped: 0, missing: 0, failed: 0 }
  try {
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return { ...stats, reason: 'no-session' }

    const config = await window.api.artwork.cloudConfig()
    if (!config?.configured) return { ...stats, reason: 'r2-not-configured' }

    const { data: rows, error } = await supabase
      .from('games')
      .select('id, title, cover_url, banner_url, logo_url')
      .eq('is_deleted', false)
    if (error) return { ...stats, reason: error.message }

    const byId = new Map((rows || []).map((g) => [g.id, g]))

    const [{ games: localGames }, artwork] = await Promise.all([
      window.api.storage.getGames(),
      window.api.library.scanArtwork()
    ])

    const pending = []
    const offered = new Map()

    for (const game of localGames || []) {
      const row = byId.get(game.id)
      if (!row) continue
      const art = artwork.byId?.[game.id] || {}
      const claims = {}

      for (const [kind, localField, cloudField] of [
        ['cover', 'coverImage', 'cover_url'],
        ['banner', 'bannerImage', 'banner_url'],
        ['logo', 'logoImage', 'logo_url']
      ]) {
        const existing = row[cloudField]
        const localPath = art[kind] || game[localField] || null
        if (!localPath) { stats.missing++; continue }
        // Option C: never overwrite art another player already published.
        if (existing && !force) { stats.skipped++; continue }
        if (!pending.some((e) => e.gameId === game.id && e.kind === kind)) {
          pending.push({ gameId: game.id, kind, localPath })
        }
        claims[kind] = true
      }
      if (Object.keys(claims).length) offered.set(game.id, claims)
    }

    if (pending.length === 0) return { ...stats }

    // Upload to R2, then write URLs back to the shared catalog.
    const byKind = {}
    for (const entry of pending) (byKind[entry.kind] ||= []).push(entry)

    const urlByGame = new Map()
    for (const [kind, entries] of Object.entries(byKind)) {
      const result = await window.api.artwork.uploadBatch(entries)
      stats.uploaded += result.uploaded
      stats.failed += result.failed
      if (result.urls) {
        for (const { gameId, url } of result.urls) {
          if (!urlByGame.has(gameId)) urlByGame.set(gameId, {})
          urlByGame.get(gameId)[kind] = url
        }
      }
    }

    for (const [gameId, kinds] of urlByGame) {
      const row = byId.get(gameId)
      const patch = {}
      if (kinds.cover && (force || !row.cover_url)) patch.cover_url = kinds.cover
      if (kinds.banner && (force || !row.banner_url)) patch.banner_url = kinds.banner
      if (kinds.logo && (force || !row.logo_url)) patch.logo_url = kinds.logo
      if (Object.keys(patch).length === 0) { stats.skipped++; continue }

      const { error: upErr } = await supabase
        .from('games')
        .update(patch)
        .eq('id', gameId)
      if (upErr) { stats.failed++; continue }
      stats.filled += Object.keys(patch).length
    }

    if (stats.uploaded || stats.filled) {
      console.log(
        `[Artwork] published ${stats.filled} slot(s) from ${stats.uploaded} upload(s); ` +
        `${stats.skipped} already claimed`
      )
    }
    return stats
  } catch (err) {
    console.error('[Artwork] publishArtworkToCloud error:', err.message)
    return { ...stats, reason: err.message }
  }
}

export async function pushLibraryToCloud() {
  if (pushInFlight) return { pushed: false, reason: 'busy' }
  pushInFlight = true
  try {
    const { data } = await supabase.auth.getSession()
    const session = data?.session ?? null
    if (!session) return { pushed: false, reason: 'no-session' }

    const [gameData, colData] = await Promise.all([
      window.api.storage.getGames(),
      window.api.storage.getCollections()
    ])

    const localGames = gameData?.games || []

    const syncedGames = []
    for (const game of localGames) {
      const record = stripRuntimeFields(game)
// Artwork is a shared catalog resource (see artworkPublish.js), so the
    // per-user snapshot carries no image URLs or local paths. The shared
    // catalog's cover_url/banner_url/logo_url is the single source of truth.
    for (const field of ['coverImage', 'bannerImage', 'logoImage']) {
      delete record[field]
    }
    for (const [, urlField] of ARTWORK_TYPES) {
      record[urlField] = null
    }
      syncedGames.push(record)
    }

    if (syncedGames.length === 0) {
      console.warn('[LibrarySync] Skipping push: local library is empty (would wipe cloud copy)')
      return { pushed: false, reason: 'empty-library' }
    }

    const payload = {
      user_id: session.user.id,
      games: syncedGames,
      collections: colData?.collections || [],
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase.from('user_libraries').upsert(payload, {
      onConflict: 'user_id'
    })

    if (error) {
      console.error('[LibrarySync] Upsert failed:', error.message)
      return { pushed: false, reason: error.message }
    }

    return { pushed: true, gameCount: syncedGames.length }
  } catch (err) {
    console.error('[LibrarySync] pushLibraryToCloud error:', err.message)
    return { pushed: false, reason: err.message }
  } finally {
    pushInFlight = false
  }
}

function fillGaps(target, source) {
  for (const key of Object.keys(source || {})) {
    const v = target[key]
    if (v === undefined || v === null || v === '') target[key] = source[key]
  }
  return target
}

export async function pullLibraryFromCloud() {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data?.session ?? null
    if (!session) return { restored: false, reason: 'no-session' }

    const { data: row, error } = await supabase
      .from('user_libraries')
      .select('games, collections')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      if (error.code === 'PGRST116') return { restored: false, reason: 'no-snapshot' }
      console.error('[LibrarySync] Pull failed:', error.message)
      return { restored: false, reason: error.message }
    }

    const cloudGames = Array.isArray(row?.games) ? row.games : []
    const cloudCollections = Array.isArray(row?.collections) ? row.collections : []

    if (cloudGames.length === 0) return { restored: false, reason: 'empty-snapshot' }

    const [localGameData, localColData] = await Promise.all([
      window.api.storage.getGames(),
      window.api.storage.getCollections()
    ])
    const localGames = localGameData?.games || []
    const localCollections = localColData?.collections || []

    const entries = []
    for (const g of cloudGames) {
      for (const [field, urlField] of ARTWORK_TYPES) {
        entries.push({ localPath: g[field], fallbackUrl: g[urlField] })
      }
    }
    const resolved = await window.api.artwork.resolveBatch(entries)

    const cloudById = new Map()
    let i = 0
    for (const g of cloudGames) {
      const copy = { ...g }
      for (const [field] of ARTWORK_TYPES) {
        copy[field] = resolved[i] || null
        i++
      }
      // Cloud artwork URLs are no longer used (local-only artwork).
      for (const [, urlField] of ARTWORK_TYPES) {
        copy[urlField] = null
      }
      cloudById.set(copy.id, copy)
    }

    const mergedById = new Map()
    for (const g of localGames) {
      mergedById.set(g.id, fillGaps({ ...g }, cloudById.get(g.id)))
    }
    for (const [id, cloud] of cloudById) {
      if (!mergedById.has(id)) mergedById.set(id, cloud)
    }
    const mergedGames = Array.from(mergedById.values())

    const mergedCols = new Map()
    for (const c of localCollections) mergedCols.set(c.id || c.name || JSON.stringify(c), c)
    for (const c of cloudCollections) {
      const key = c.id || c.name || JSON.stringify(c)
      if (!mergedCols.has(key)) mergedCols.set(key, c)
    }
    const mergedCollections = Array.from(mergedCols.values())

    const changed =
      mergedGames.length !== localGames.length ||
      mergedGames.length !== cloudGames.length ||
      mergedCollections.length !== localCollections.length

    if (changed) {
      await window.api.storage.saveGames({ games: mergedGames })
      await window.api.storage.saveCollections({ collections: mergedCollections })
    }

    return { restored: changed, gameCount: mergedGames.length }
  } catch (err) {
    console.error('[LibrarySync] pullLibraryFromCloud error:', err.message)
    return { restored: false, reason: err.message }
  }
}

export async function cleanupOrphanGames() {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return 0
    const { data: count } = await supabase.rpc('cleanup_orphan_games')
    if (typeof count === 'number' && count > 0) {
      console.log(`[LibrarySync] Cleaned ${count} orphaned catalog game(s)`)
    }
    return count || 0
  } catch (err) {
    console.error('[LibrarySync] cleanupOrphanGames error:', err.message)
    return 0
  }
}

export async function deleteGameFromCloud(gameId) {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data?.session ?? null
    if (!session) return

    await supabase
      .from('user_games')
      .delete()
      .eq('user_id', session.user.id)
      .eq('game_id', gameId)

    // The DB trigger already purges orphans when the last reference is
    // deleted; this sweep also cleans up legacy orphans left from before.
    cleanupOrphanGames()
  } catch (err) {
    console.error('[LibrarySync] deleteGameFromCloud error:', err.message)
  }
}

export async function recoverLibraryFromCloud() {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data?.session ?? null
    if (!session) return { recovered: 0, error: 'Not signed in' }

    const { data: rows, error } = await supabase
      .from('user_games')
      .select(
        'game_id, total_hours, is_platinum, average_rating, historical_playtime, first_played, last_played, date_finished, games(id, title, cover_url, banner_url, logo_url)'
      )
      .eq('user_id', session.user.id)
      .filter('games.is_deleted', 'eq', false)

    if (error) return { recovered: 0, error: error.message }

    const artwork = await window.api.library.scanArtwork()

    const games = []
    let skipped = 0
    for (const ug of rows || []) {
      const title = ug.games?.title
      if (!title) {
        skipped++
        continue
      }
      const id = ug.game_id
      const art = artwork.byId?.[id] || {}
      if (!art.cover && !art.banner && !art.logo) {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '')
        const titleArt = artwork.byTitle?.[slug]
        if (titleArt) Object.assign(art, titleArt)
      }
      const sharedCover = ug.games?.cover_url || null
      const sharedBanner = ug.games?.banner_url || null
      const sharedLogo = ug.games?.logo_url || null

      games.push({
        id,
        title,
        genres: [],
        rawgId: null,
        console: '',
        exePath: '',
        logoUrl: ug.games?.logo_url || null,
        ratings: {},
        romPath: '',
        coverUrl: sharedCover,
        playtime: ug.total_hours || 0,
        sessions: 0,
        bannerUrl: sharedBanner,
        developer: null,
        // Local path when present, otherwise the shared R2 URL: the resolver treats
        // an http(s) value as already-usable.
        logoImage: art.logo || sharedLogo,
        logoScale: 1,
        platforms: [],
        publisher: null,
        coverImage: art.cover || sharedCover,
        isPlatinum: ug.is_platinum || false,
        lastPlayed: ug.last_played || null,
        launchType: 'executable',
        rawgRating: 0,
        bannerImage: art.banner || sharedBanner,
        description: null,
        firstPlayed: ug.first_played || null,
        logoOffsetX: 0,
        logoOffsetY: 0,
        releaseDate: null,
        dateFinished: ug.date_finished || '',
        emulatorPath: '',
        launchTarget: '',
        saveDataPath: '',
        averageRating: ug.average_rating || 0,
        historicalPlaytime: ug.historical_playtime || {}
      })
    }

    if (games.length > 0) {
      await window.api.storage.saveGames({ games })
    }
    return { recovered: games.length, skipped }
  } catch (err) {
    console.error('[LibrarySync] recoverLibraryFromCloud error:', err.message)
    return { recovered: 0, error: err.message }
  }
}
