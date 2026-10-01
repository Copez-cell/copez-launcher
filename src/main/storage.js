import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const DATA_DIR = join(app.getPath('userData'), 'data')
let currentUserId = null

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function userFilePath(filename) {
  if (!currentUserId) return null
  const parts = filename.split('.')
  return parts.length > 1
    ? `${parts[0]}_${currentUserId}.${parts.slice(1).join('.')}`
    : `${filename}_${currentUserId}`
}

function ensureDir() {
  ensureDataDir()
}

function readJSON(filename) {
  ensureDir()
  let filePath
  if (currentUserId) {
    const userPath = join(DATA_DIR, userFilePath(filename))
    if (existsSync(userPath)) filePath = userPath
  }
  if (!filePath) filePath = join(DATA_DIR, filename)
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Failed to read ${filename}:`, error.message)
    return null
  }
}

function writeJSON(filename, data) {
  ensureDir()
  const filePath = currentUserId
    ? join(DATA_DIR, userFilePath(filename))
    : join(DATA_DIR, filename)
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to write ${filename}:`, error.message)
    return false
  }
}

export function initStorage(userId) {
  currentUserId = userId
  backfillHistoricalPlaytime()
  backfillFirstPlayed()
}

function backfillFirstPlayed() {
  const data = getGames()
  if (!data || !Array.isArray(data.games)) return

  let changed = false
  for (const game of data.games) {
    if (game.firstPlayed) continue
    if (typeof game.playtime !== 'number' || game.playtime <= 0) continue

    let first = null
    if (game.historicalPlaytime && typeof game.historicalPlaytime === 'object') {
      const keys = Object.keys(game.historicalPlaytime)
        .map(Number)
        .filter((y) => !isNaN(y) && game.historicalPlaytime[String(y)] > 0)
        .sort((a, b) => a - b)
      if (keys.length > 0) {
        first = new Date(keys[0], 0, 1).toISOString()
      }
    }
    if (!first && game.lastPlayed) {
      first = game.lastPlayed
    }
    if (first) {
      game.firstPlayed = first
      changed = true
    }
  }

  if (changed) saveGames(data)
}

function backfillHistoricalPlaytime() {
  const data = getGames()
  if (!data || !Array.isArray(data.games)) return

  let changed = false
  for (const game of data.games) {
    if (typeof game.playtime !== 'number' || game.playtime <= 0) continue
    const hist = game.historicalPlaytime
    const hasHist = hist && typeof hist === 'object' && Object.keys(hist).length > 0
    if (hasHist) continue
    if (!game.lastPlayed) continue
    const d = new Date(game.lastPlayed)
    if (isNaN(d.getTime())) continue
    const year = String(d.getFullYear())
    game.historicalPlaytime = { [year]: game.playtime }
    changed = true
  }

  if (changed) saveGames(data)
}

export function getGames() {
  return readJSON('games.json') || { games: [] }
}

export function saveGames(data) {
  return writeJSON('games.json', data)
}

export function getCollections() {
  return readJSON('collections.json') || { collections: [] }
}

export function saveCollections(data) {
  return writeJSON('collections.json', data)
}

export function updateGame(gameId, updates) {
  const data = getGames()
  const index = data.games.findIndex((g) => g.id === gameId)
  if (index === -1) return null
  data.games[index] = { ...data.games[index], ...updates }
  saveGames(data)
  return data.games[index]
}

export function deleteGame(gameId) {
  const data = getGames()
  data.games = data.games.filter((g) => g.id !== gameId)
  saveGames(data)
  return true
}

export function saveRatings(gameId, ratings) {
  const data = getGames()
  const index = data.games.findIndex((g) => g.id === gameId)
  if (index === -1) return null
  data.games[index].ratings = ratings
  const activeRatings = Object.values(ratings).filter((v) => typeof v === 'number')
  data.games[index].averageRating =
    activeRatings.length > 0
      ? Math.round((activeRatings.reduce((a, b) => a + b, 0) / activeRatings.length) * 10) / 10
      : 0
  saveGames(data)
  return data.games[index]
}

export function getTiers() {
  return readJSON('tiers.json') || {
    tiers: [
      { id: 'S', label: 'S', minScore: 9.0, color: '#ff4d4d' },
      { id: 'A', label: 'A', minScore: 8.5, color: '#ff8c42' },
      { id: 'B', label: 'B', minScore: 8.0, color: '#ffd166' },
      { id: 'C', label: 'C', minScore: 7.5, color: '#06d6a0' },
      { id: 'D', label: 'D', minScore: 7.0, color: '#118ab2' },
      { id: 'E', label: 'E', minScore: 5.0, color: '#8e8e93' },
      { id: 'F', label: 'F', minScore: 0.0, color: '#555558' }
    ]
  }
}

export function saveTiers(data) {
  return writeJSON('tiers.json', data)
}

export function appendHardwareLog(gameId, logEntry) {
  const data = getGames()
  const index = data.games.findIndex((g) => g.id === gameId)
  if (index === -1) return null
  if (!Array.isArray(data.games[index].hardwareLogs)) {
    data.games[index].hardwareLogs = []
  }
  data.games[index].hardwareLogs.push(logEntry)
  if (data.games[index].hardwareLogs.length > 20) {
    data.games[index].hardwareLogs = data.games[index].hardwareLogs.slice(-20)
  }
  saveGames(data)
  return data.games[index]
}
