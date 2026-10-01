const BASE = 'https://api.steampowered.com'

export async function testSteamApi(apiKey) {
  if (!apiKey) {
    return { status: 'missing', success: false, latency: 0, message: 'No API key configured' }
  }

  const start = Date.now()
  try {
    const url = `${BASE}/ISteamWebAPIUtil/GetServerInfo/v0001/?key=${encodeURIComponent(apiKey)}&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const latency = Date.now() - start
    if (!res.ok) {
      return { status: 'fail', success: false, latency, message: `HTTP ${res.status}` }
    }
    const json = await res.json()
    if (json?.servertime) {
      return { status: 'ok', success: true, latency, message: 'Working' }
    }
    return { status: 'fail', success: false, latency, message: 'Unexpected response' }
  } catch (error) {
    return { status: 'fail', success: false, latency: Date.now() - start, message: error.message }
  }
}

export async function getOwnedGames(apiKey, steamId) {
  const url = `${BASE}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`)
  const json = await res.json()
  return json?.response?.games || []
}

export async function getPlayerAchievements(apiKey, steamId, appid) {
  const url = `${BASE}/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`)
  const json = await res.json()
  const stats = json?.playerstats
  if (!stats?.success) return null
  const achievements = stats.achievements || []
  return {
    appId: appid,
    gameName: stats.gameName,
    total: achievements.length,
    achieved: achievements.filter((a) => a.achieved === 1).length,
    achievements: achievements.map((a) => ({
      name: a.apiname,
      displayName: a.name,
      description: a.description,
      achieved: a.achieved === 1,
      unlockTime: a.unlocktime || 0
    }))
  }
}
