// IGDB (v4) API client — runs entirely in the Electron main process.
// The Twitch App Access Token is fetched here so Client ID / Client Secret
// never reach the renderer.

const IGDB_AUTH_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_API_URL = 'https://api.igdb.com/v4/games'
const IGDB_IMAGE_URL = 'https://images.igdb.com/igdb/image/upload'

const IMAGE_SIZE_BANNER = 't_1080p'
const IMAGE_SIZE_COVER = 't_cover_big'

let tokenCache = {
  accessToken: null,
  clientId: '',
  clientSecret: '',
  expiresAt: 0
}

function hasCredentials(clientId, clientSecret) {
  return Boolean(clientId && clientSecret)
}

function escapeApiCal(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function imageUrl(imageId, size = IMAGE_SIZE_BANNER) {
  if (!imageId) return null
  return `${IGDB_IMAGE_URL}/${size}/${imageId}.jpg`
}

function timestampToDate(unixSeconds) {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

async function getAccessToken(clientId, clientSecret) {
  if (
    tokenCache.accessToken &&
    tokenCache.clientId === clientId &&
    tokenCache.clientSecret === clientSecret &&
    Date.now() < tokenCache.expiresAt
  ) {
    return tokenCache.accessToken
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  })

  const response = await fetch(`${IGDB_AUTH_URL}?${params.toString()}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    throw new Error(`IGDB auth failed: HTTP ${response.status}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error('IGDB auth failed: no access token returned')
  }

  tokenCache = {
    accessToken: data.access_token,
    clientId,
    clientSecret,
    expiresAt: Date.now() + (data.expires_in || 5184000) * 1000 - 60000
  }

  return tokenCache.accessToken
}

async function igdbRequest(body, clientId, clientSecret, retryOnAuth = true) {
  const accessToken = await getAccessToken(clientId, clientSecret)

  const response = await fetch(IGDB_API_URL, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain'
    },
    body,
    signal: AbortSignal.timeout(15000)
  })

  if (response.status === 401 && retryOnAuth) {
    tokenCache = { accessToken: null, clientId: '', clientSecret: '', expiresAt: 0 }
    return igdbRequest(body, clientId, clientSecret, false)
  }

  if (!response.ok) {
    throw new Error(`IGDB API error: HTTP ${response.status}`)
  }

  return response.json()
}

function mapGame(raw, nameFallback) {
  const genres = (raw.genres || []).map((g) => g.name).filter(Boolean)
  const companies = raw.involved_companies || []
  const allNames = [...new Set(companies.map((c) => c.company?.name).filter(Boolean))]
  const developers = [
    ...new Set(companies.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean))
  ]
  const publishers = [
    ...new Set(companies.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean))
  ]

  return {
    igdbId: raw.id,
    rawgId: raw.id,
    name: raw.name || nameFallback || 'Unknown Game',
    description: raw.summary || '',
    genres,
    developers: developers.length ? developers : allNames,
    publishers: publishers.length ? publishers : allNames,
    released: timestampToDate(raw.first_release_date),
    background_image: imageUrl(raw.cover?.image_id, IMAGE_SIZE_COVER),
    banner_image: imageUrl(raw.artworks?.[0]?.image_id, IMAGE_SIZE_BANNER),
    rating: raw.rating || 0,
    platforms: (raw.platforms || []).map((p) => p.name).filter(Boolean)
  }
}

export function fallbackData(gameName) {
  return {
    igdbId: null,
    rawgId: null,
    name: gameName || 'Unknown Game',
    description: '',
    genres: [],
    developers: [],
    publishers: [],
    released: null,
    background_image: null,
    banner_image: null,
    rating: 0,
    platforms: []
  }
}

export async function searchGamesForAutocomplete(query, clientId, clientSecret) {
  if (!hasCredentials(clientId, clientSecret) || !query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  try {
    const body = `search "${escapeApiCal(query.trim())}"; fields name, first_release_date, cover.image_id, genres.name, rating; limit 5;`
    const data = await igdbRequest(body, clientId, clientSecret)

    const results = (data || []).map((raw) => ({
      id: raw.id,
      name: raw.name,
      background_image: imageUrl(raw.cover?.image_id, IMAGE_SIZE_COVER),
      released: timestampToDate(raw.first_release_date),
      genres: (raw.genres || []).map((g) => g.name).filter(Boolean),
      rating: raw.rating || 0
    }))

    return { success: true, results }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function getGameDetails(igdbId, clientId, clientSecret) {
  if (!hasCredentials(clientId, clientSecret) || !igdbId) {
    return { success: false, error: 'IGDB not configured' }
  }

  try {
    const body = [
      'fields name, first_release_date, summary, rating, genres.name, platforms.name,',
      ' involved_companies.developer, involved_companies.publisher,',
      ' involved_companies.company.name, cover.image_id, artworks.image_id;',
      ` where id = ${Number(igdbId)};`
    ].join('')

    const data = await igdbRequest(body, clientId, clientSecret)
    const game = Array.isArray(data) && data.length > 0 ? data[0] : null
    if (!game) return { success: false, error: 'Game not found' }

    return { success: true, data: mapGame(game) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Bridge used by window.api.fetchGameData(gameName).
// Never rejects: always returns a clean shape so the UI can render
// just the title when IGDB is missing credentials, errors, or finds nothing.
export async function fetchGameData(gameName, clientId, clientSecret) {
  const name = (gameName || '').trim()
  if (!name) {
    return { success: true, found: false, data: fallbackData(), error: 'No game name provided' }
  }
  if (!hasCredentials(clientId, clientSecret)) {
    return { success: true, found: false, data: fallbackData(name), error: 'IGDB not configured' }
  }

  try {
    const searchBody = `search "${escapeApiCal(name)}"; fields name, first_release_date, cover.image_id, genres.name; limit 5;`
    const searchData = await igdbRequest(searchBody, clientId, clientSecret)
    const best = Array.isArray(searchData) && searchData.length > 0 ? searchData[0] : null

    if (!best || !best.id) {
      return { success: true, found: false, data: fallbackData(name) }
    }

    const details = await getGameDetails(best.id, clientId, clientSecret)
    if (details.success) {
      return { success: true, found: true, data: details.data }
    }

    return {
      success: true,
      found: true,
      data: {
        ...fallbackData(name),
        igdbId: best.id,
        rawgId: best.id,
        name: best.name || name,
        background_image: imageUrl(best.cover?.image_id, IMAGE_SIZE_COVER),
        released: timestampToDate(best.first_release_date),
        genres: (best.genres || []).map((g) => g.name).filter(Boolean)
      }
    }
  } catch (error) {
    return { success: true, found: false, data: fallbackData(name), error: error.message }
  }
}

export async function testIgdb(clientId, clientSecret) {
  if (!hasCredentials(clientId, clientSecret)) {
    return { status: 'missing', success: false, latency: 0, message: 'No IGDB credentials configured' }
  }

  const start = Date.now()
  try {
    await igdbRequest('search "portal"; fields name; limit 1;', clientId, clientSecret)
    return { status: 'ok', success: true, latency: Date.now() - start, message: 'Working' }
  } catch (error) {
    return { status: 'fail', success: false, latency: Date.now() - start, message: error.message }
  }
}
