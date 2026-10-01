const RAWG_BASE = 'https://api.rawg.io/api'

export async function testRawg(apiKey) {
  if (!apiKey) {
    return { status: 'missing', success: false, latency: 0, message: 'No API key configured' }
  }

  const start = Date.now()
  try {
    const url = `${RAWG_BASE}/games?key=${apiKey}&search=test&page_size=1`
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const latency = Date.now() - start
    if (!response.ok) {
      return { status: 'fail', success: false, latency, message: `HTTP ${response.status}` }
    }
    await response.json()
    return { status: 'ok', success: true, latency, message: 'Working' }
  } catch (error) {
    return { status: 'fail', success: false, latency: Date.now() - start, message: error.message }
  }
}

let rawgDownUntil = 0

function rawgIsDown() {
  return Date.now() < rawgDownUntil
}

function markRawgDown() {
  rawgDownUntil = Date.now() + 10 * 60 * 1000
}

export async function searchGamesForAutocomplete(query, apiKey) {
  if (!apiKey || !query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  if (rawgIsDown()) {
    return { success: false, error: 'RAWG temporarily unavailable' }
  }

  try {
    const url = `${RAWG_BASE}/games?key=${apiKey}&search=${encodeURIComponent(query.trim())}&page_size=5`
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) })

    if (!response.ok) {
      if (response.status >= 500) markRawgDown()
      return { success: false, error: `RAWG API error: ${response.status}` }
    }

    const data = await response.json()

    const results = (data.results || []).map((game) => ({
      id: game.id,
      name: game.name,
      background_image: game.background_image || null,
      released: game.released || null,
      genres: (game.genres || []).map((g) => g.name),
      rating: game.rating || 0
    }))

    return { success: true, results }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function getGameDetails(gameId, apiKey) {
  if (!apiKey || !gameId) {
    return { success: false, error: 'RAWG API key not configured' }
  }

  if (rawgIsDown()) {
    return { success: false, error: 'RAWG temporarily unavailable' }
  }

  try {
    const url = `${RAWG_BASE}/games/${gameId}?key=${apiKey}`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (!response.ok) {
      if (response.status >= 500) markRawgDown()
      return { success: false, error: `RAWG API error: ${response.status}` }
    }

    const detail = await response.json()

    return {
      success: true,
      data: {
        rawgId: detail.id,
        name: detail.name,
        description: detail.description_raw || '',
        genres: detail.genres?.map((g) => g.name) || [],
        developers: detail.developers?.map((d) => d.name) || [],
        publishers: detail.publishers?.map((p) => p.name) || [],
        released: detail.released || null,
        background_image: detail.background_image || null,
        rating: detail.rating || 0,
        platforms: detail.platforms?.map((p) => p.platform.name) || []
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function searchGame(gameName, apiKey) {
  if (!apiKey) {
    return { success: false, error: 'RAWG API key not configured' }
  }

  if (rawgIsDown()) {
    return { success: false, error: 'RAWG temporarily unavailable' }
  }

  try {
    const url = `${RAWG_BASE}/games?key=${apiKey}&search=${encodeURIComponent(gameName)}&page_size=5`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (!response.ok) {
      if (response.status >= 500) markRawgDown()
      return { success: false, error: `RAWG API error: ${response.status}` }
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      return { success: false, error: 'No results found' }
    }

    const bestMatch = data.results[0]

    const detailResult = await getGameDetails(bestMatch.id, apiKey)
    if (detailResult.success) {
      return detailResult
    }

    return {
      success: true,
      data: {
        rawgId: bestMatch.id,
        name: bestMatch.name,
        genres: bestMatch.genres?.map((g) => g.name) || [],
        background_image: bestMatch.background_image || null,
        released: bestMatch.released || null
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
