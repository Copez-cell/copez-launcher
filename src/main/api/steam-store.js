// Steam Storefront API client — runs in the Electron main process.
// No authentication required. Requests are proxied through IPC so the
// renderer never hits Steam's CORS-restricted endpoints directly.

const STORE_SEARCH_URL = 'https://store.steampowered.com/api/storesearch'
const STORE_DETAILS_URL = 'https://store.steampowered.com/api/appdetails'

let steamDownUntil = 0

function steamIsDown() {
  return Date.now() < steamDownUntil
}

function markSteamDown(ms = 60000) {
  steamDownUntil = Date.now() + ms
}

function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#8217;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDate(dateStr) {
  if (!dateStr) return null
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? dateStr : null
}

function mapSteamGame(data) {
  return {
    igdbId: null,
    rawgId: null,
    steamAppId: data.steam_appid || null,
    name: data.name || 'Unknown Game',
    description: stripHtml(data.detailed_description || data.short_description || ''),
    genres: (data.genres || []).map((g) => g.description).filter(Boolean),
    developers: (data.developers || []).slice(0, 1),
    publishers: (data.publishers || []).slice(0, 1),
    released: normalizeDate(data.release_date?.date),
    background_image: data.header_image || null,
    banner_image: data.background || data.background_raw || null,
    rating: data.metacritic?.score || 0,
    platforms: Object.keys(data.platforms || {})
      .filter((k) => data.platforms[k])
      .map((k) => (k === 'mac' ? 'Mac' : k === 'linux' ? 'Linux' : 'Windows'))
  }
}

export function fallbackData(gameName) {
  return {
    igdbId: null,
    rawgId: null,
    steamAppId: null,
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

async function parseSteamJson(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) {
    throw new Error('Steam returned a non-JSON response (likely rate limited)')
  }
  return response.json()
}

export async function searchStoreGames(query) {
  if (!query || query.trim().length < 2) {
    return { success: true, results: [] }
  }
  if (steamIsDown()) {
    return { success: false, error: 'Steam Store temporarily unavailable' }
  }

  try {
    const url = `${STORE_SEARCH_URL}/?term=${encodeURIComponent(query.trim())}&l=english&cc=US`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (response.status === 429) {
      markSteamDown()
      return { success: false, error: 'Steam Store rate limited' }
    }
    if (!response.ok) {
      return { success: false, error: `Steam Store error: HTTP ${response.status}` }
    }

    const data = await parseSteamJson(response)
    const items = (data.items || []).filter((i) => i.type === 'app' || i.type === 'game')

    const results = items.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      background_image: item.small_capsule_image || item.large_capsule_image || null,
      released: normalizeDate(item.release_date || item.steam_release_date),
      genres: [],
      rating: item.metacritic_score || 0
    }))

    return { success: true, results }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function getAppDetails(appId) {
  if (!appId) {
    return { success: false, error: 'No Steam App ID provided' }
  }
  if (steamIsDown()) {
    return { success: false, error: 'Steam Store temporarily unavailable' }
  }

  try {
    const url = `${STORE_DETAILS_URL}/?appids=${encodeURIComponent(appId)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (response.status === 429) {
      markSteamDown()
      return { success: false, error: 'Steam Store rate limited' }
    }
    if (!response.ok) {
      return { success: false, error: `Steam Store error: HTTP ${response.status}` }
    }

    const data = await parseSteamJson(response)
    const entry = data?.[String(appId)]

    if (!entry || !entry.success || !entry.data) {
      return { success: false, error: 'Game not found on Steam' }
    }

    return { success: true, data: mapSteamGame(entry.data) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Bridge used by window.api.fetchGameData(gameName).
// Never rejects: always resolves with a clean object so the UI can fall
// back to showing just the title when nothing is found or Steam errors.
export async function fetchGameData(gameName) {
  const name = (gameName || '').trim()
  if (!name) {
    return { success: true, found: false, data: fallbackData(), error: 'No game name provided' }
  }

  try {
    const search = await searchStoreGames(name)
    if (!search.success || !search.results || search.results.length === 0) {
      return {
        success: true,
        found: false,
        data: fallbackData(name),
        error: search.error || 'No results found on Steam'
      }
    }

    const best = search.results[0]
    const details = await getAppDetails(best.id)

    if (details.success) {
      return { success: true, found: true, data: details.data }
    }

    return {
      success: true,
      found: true,
      data: {
        ...fallbackData(name),
        steamAppId: best.id,
        name: best.name || name,
        background_image: best.background_image || null,
        released: best.released || null
      }
    }
  } catch (error) {
    return { success: true, found: false, data: fallbackData(name), error: error.message }
  }
}

export async function testSteamStore() {
  const start = Date.now()
  try {
    const url = `${STORE_SEARCH_URL}/?term=portal&l=english&cc=US`
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const latency = Date.now() - start

    if (response.status === 429) {
      return { status: 'fail', success: false, latency, message: 'Rate limited' }
    }
    if (!response.ok) {
      return { status: 'fail', success: false, latency, message: `HTTP ${response.status}` }
    }

    await parseSteamJson(response)
    return { status: 'ok', success: true, latency, message: 'Working' }
  } catch (error) {
    return { status: 'fail', success: false, latency: Date.now() - start, message: error.message }
  }
}
