const SGDB_BASE = 'https://www.steamgriddb.com/api/v2'

export async function testSteamGridDB(token) {
  if (!token) {
    return { status: 'missing', success: false, latency: 0, message: 'No token configured' }
  }

  const start = Date.now()
  try {
    const url = `${SGDB_BASE}/search/autocomplete/test`
    const res = await fetch(url, {
      headers: buildHeaders(token),
      signal: AbortSignal.timeout(10000)
    })
    const latency = Date.now() - start
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { status: 'fail', success: false, latency, message: `HTTP ${res.status} ${res.statusText}`.trim() }
    }
    return { status: 'ok', success: true, latency, message: 'Working' }
  } catch (error) {
    return { status: 'fail', success: false, latency: Date.now() - start, message: error.message }
  }
}

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'COPEZ-Launcher/1.0'
  }
}

async function sgdbGet(path, token) {
  const url = `${SGDB_BASE}${path}`
  const res = await fetch(url, { headers: buildHeaders(token) })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[SteamGridDB] ${path} failed: ${res.status} ${res.statusText} — ${body}`)
    return { success: false, error: `SteamGridDB ${res.status}: ${res.statusText}`, data: null }
  }

  const json = await res.json()
  return { success: true, error: null, data: json.data || null }
}

export async function searchGameId(gameName, token) {
  if (!token) {
    return { success: false, error: 'SteamGridDB token not configured', data: null }
  }

  try {
    const path = `/search/autocomplete/${encodeURIComponent(gameName)}`
    const res = await sgdbGet(path, token)

    if (!res.success) {
      return { success: false, error: res.error, data: null }
    }

    if (!res.data || res.data.length === 0) {
      console.warn(`[SteamGridDB] No results found for "${gameName}"`)
      return { success: false, error: `No SteamGridDB results for "${gameName}"`, data: null }
    }

    const gameId = res.data[0].id
    const name = res.data[0].name

    if (!gameId) {
      return { success: false, error: 'SteamGridDB returned empty game ID', data: null }
    }

    return { success: true, error: null, data: { id: gameId, name } }
  } catch (error) {
    console.error('[SteamGridDB] searchGameId exception:', error)
    return { success: false, error: error.message, data: null }
  }
}

export async function getGrids(gameId, token) {
  if (!token || !gameId) {
    return { success: false, error: 'Missing SteamGridDB token or game ID', data: [] }
  }

  try {
    const res = await sgdbGet(`/grids/game/${gameId}`, token)

    if (!res.success) {
      return { success: false, error: res.error, data: [] }
    }

    if (!res.data || res.data.length === 0) {
      return { success: false, error: 'No grids found', data: [] }
    }

    return {
      success: true,
      error: null,
      data: res.data.map((item) => ({
        url: item.thumbs?.original || item.url,
        width: item.width,
        height: item.height
      }))
    }
  } catch (error) {
    console.error('[SteamGridDB] getGrids exception:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function getCovers(gameId, token) {
  if (!token || !gameId) {
    return { success: false, error: 'Missing SteamGridDB token or game ID', data: [] }
  }

  try {
    const res = await sgdbGet(`/grids/game/${gameId}`, token)

    if (!res.success) {
      return { success: false, error: res.error, data: [] }
    }

    if (!res.data || res.data.length === 0) {
      return { success: false, error: 'No covers found', data: [] }
    }

    return {
      success: true,
      error: null,
      data: res.data.map((item) => ({
        url: item.thumbs?.original || item.url,
        width: item.width,
        height: item.height
      }))
    }
  } catch (error) {
    console.error('[SteamGridDB] getCovers exception:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function getHeroes(gameId, token) {
  if (!token || !gameId) {
    return { success: false, error: 'Missing SteamGridDB token or game ID', data: [] }
  }

  try {
    const res = await sgdbGet(`/heroes/game/${gameId}`, token)

    if (!res.success) {
      return { success: false, error: res.error, data: [] }
    }

    if (!res.data || res.data.length === 0) {
      return { success: false, error: 'No heroes found', data: [] }
    }

    return {
      success: true,
      error: null,
      data: res.data.map((item) => ({
        url: item.thumbs?.original || item.url,
        width: item.width,
        height: item.height
      }))
    }
  } catch (error) {
    console.error('[SteamGridDB] getHeroes exception:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function getLogos(gameId, token) {
  if (!token || !gameId) {
    return { success: false, error: 'Missing SteamGridDB token or game ID', data: [] }
  }

  try {
    const res = await sgdbGet(`/logos/game/${gameId}`, token)

    if (!res.success) {
      return { success: false, error: res.error, data: [] }
    }

    if (!res.data || res.data.length === 0) {
      return { success: false, error: 'No logos found', data: [] }
    }

    return {
      success: true,
      error: null,
      data: res.data.map((item) => ({
        url: item.thumbs?.original || item.url,
        width: item.width,
        height: item.height
      }))
    }
  } catch (error) {
    console.error('[SteamGridDB] getLogos exception:', error)
    return { success: false, error: error.message, data: [] }
  }
}
