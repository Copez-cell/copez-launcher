import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { shell } from 'electron'
import si from 'systeminformation'
import { updateGame, getGames, appendHardwareLog } from './storage.js'
import { setActivity, clearActivity } from './discord-rpc.js'
import { backupGameSave } from './backup.js'
import { startSessionCollection, stopSessionCollection } from './hardware.js'

const trackedGames = new Map()
let onGameStopCallback = null
let currentWebContents = null

export function setGameWebContents(wc) {
  currentWebContents = wc
}

function addHistoricalPlaytime(current, elapsed) {
  const year = String(new Date().getFullYear())
  const hist =
    current.historicalPlaytime && typeof current.historicalPlaytime === 'object'
      ? { ...current.historicalPlaytime }
      : {}
  hist[year] = (hist[year] || 0) + elapsed
  return hist
}

export function setOnGameStop(callback) {
  onGameStopCallback = callback
}

const HANDOFF_GRACE_MS = 6000
const HANDOFF_MISS_THRESHOLD = 3
const DETECT_POLL_MS = 15000
const SUPPRESS_STOP_MS = 15000

let detectTimer = null
const recentlyStopped = new Map()

function markRecentlyStopped(gameId) {
  recentlyStopped.set(gameId, Date.now())
}

function isSuppressed(gameId) {
  const at = recentlyStopped.get(gameId)
  return at != null && Date.now() - at < SUPPRESS_STOP_MS
}

async function killProcessesUnderDir(exeDir) {
  try {
    const prefix = `${exeDir.toLowerCase()}\\`
    const { list } = await si.processes()
    const pids = list
      .filter((p) => p.path && p.path.toLowerCase().startsWith(prefix))
      .map((p) => p.pid)
    for (const pid of pids) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    }
    return pids.length > 0
  } catch (err) {
    console.error('[GameLauncher] kill scan failed:', err.message)
    return false
  }
}

export function startGameWatcher(getWebContents) {
  if (detectTimer) return
  detectTimer = setInterval(async () => {
    try {
      const { list } = await si.processes()
      const games = getGames().games
      const wc = typeof getWebContents === 'function' ? getWebContents() : currentWebContents
      for (const game of games) {
        if (!game.exePath) continue
        const prefix = `${dirname(game.exePath).toLowerCase()}\\`
        const alive = list.some((p) => p.path && p.path.toLowerCase().startsWith(prefix))
        const tracked = trackedGames.get(game.id)
        if (alive && !tracked && !isSuppressed(game.id)) {
          const detectedIso = new Date().toISOString()
          trackedGames.set(game.id, { startTime: Date.now(), detectedOnly: true })
          updateGame(game.id, {
            sessions: game.sessions + 1,
            lastPlayed: detectedIso,
            ...(game.firstPlayed ? {} : { firstPlayed: detectedIso })
          })
          setActivity(game.title)
          console.log(`[GameLauncher] Detected externally launched "${game.title}"`)
          if (wc && !wc.isDestroyed()) {
            wc.send('game:state-change', { gameId: game.id, running: true })
          }
        } else if (!alive && tracked?.detectedOnly) {
          console.log(`[GameLauncher] External game closed: "${game.title}"`)
          finalizeGame(game.id, wc, tracked.startTime)
        }
      }
      for (const [id, tracked] of trackedGames) {
        if (!tracked.handoffExeDir) continue
        const alive = list.some((p) => p.path && p.path.toLowerCase().startsWith(`${tracked.handoffExeDir.toLowerCase()}\\`))
        if (alive) {
          tracked.handoffMisses = 0
        } else {
          tracked.handoffMisses++
          if (tracked.handoffMisses >= HANDOFF_MISS_THRESHOLD) {
            console.log(`[GameLauncher] Handoff game closed: "${id}"`)
            finalizeGame(id, tracked.handoffWebContents || wc, tracked.startTime)
          }
        }
      }
      if (recentlyStopped.size > 0) {
        for (const [id, at] of recentlyStopped) {
          if (Date.now() - at > SUPPRESS_STOP_MS * 2) recentlyStopped.delete(id)
        }
      }
    } catch (err) {
      console.error('[GameLauncher] watcher tick failed:', err.message)
    }
  }, DETECT_POLL_MS)
}

function finalizeGame(gameId, webContents, startTime) {
  const tracked = trackedGames.get(gameId)
  if (!tracked) return
  tracked.handoffExeDir = undefined
  tracked.handoffMisses = 0
  const elapsed = Math.floor((Date.now() - startTime) / 1000)
  const current = getGames().games.find((g) => g.id === gameId)
  if (current) {
    updateGame(gameId, {
      playtime: current.playtime + elapsed,
      historicalPlaytime: addHistoricalPlaytime(current, elapsed)
    })
    if (current.saveDataPath) {
      backupGameSave(current.title, current.saveDataPath).then((result) => {
        if (result.success) {
          console.log(`[GameLauncher] Backup saved for "${current.title}": ${result.path}`)
        } else {
          console.warn(`[GameLauncher] Backup skipped for "${current.title}": ${result.error}`)
        }
      })
    }
  }
  const sessionLog = stopSessionCollection()
  if (sessionLog && current) {
    appendHardwareLog(gameId, sessionLog)
    console.log(`[GameLauncher] Session telemetry saved for "${current.title}": ${sessionLog.readingsCount} readings over ${sessionLog.duration}s`)
  }
  trackedGames.delete(gameId)
  clearActivity()
  if (onGameStopCallback) onGameStopCallback(gameId)
  const wc = webContents || currentWebContents
  if (wc && !wc.isDestroyed()) {
    wc.send('game:state-change', { gameId, running: false })
  }
}

function startHandoffPolling(gameId, exePath, webContents, tracked) {
  if (tracked.handoffExeDir) return
  tracked.handoffExeDir = dirname(exePath)
  tracked.handoffMisses = 0
  tracked.handoffWebContents = webContents
}

function resolveCwd(exePath) {
  const dir = dirname(exePath)
  if (!dir || dir === '.' || dir === '/') return undefined
  return resolve(dir)
}

function isShellTarget(target) {
  const ext = target?.split('.').pop()?.toLowerCase()
  return ext === 'lnk' || ext === 'bat' || ext === 'cmd' || ext === 'url'
}

function buildSpawnOptions(game, extraArgs) {
  const cwd = resolveCwd(game.exePath)

  const args = []
  if (extraArgs && Array.isArray(extraArgs)) {
    for (const arg of extraArgs) {
      if (typeof arg === 'string' && arg.trim()) {
        args.push(arg.trim())
      }
    }
  }

  const options = {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  }

  if (cwd) {
    options.cwd = cwd
  }

  if (game.useShell || isShellTarget(game.exePath)) {
    options.shell = true
  }

  return { args, options }
}

export function launchGame(gameId, webContents, extraArgs) {
  const data = getGames()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { success: false, error: 'Game not found' }

  const launchType = game.launchType || 'executable'
  const launchTarget = game.launchTarget || game.exePath || ''

  if (launchType === 'emulated') {
    const emulatorPath = game.emulatorPath || ''
    const romPath = game.romPath || ''
    if (!emulatorPath) {
      return { success: false, error: 'No emulator path configured. Edit the game to set an emulator executable.', unlinked: true }
    }
    if (!romPath) {
      return { success: false, error: 'No ROM path configured. Edit the game to set a ROM file.', unlinked: true }
    }
    if (!existsSync(emulatorPath)) {
      return { success: false, error: 'Emulator executable not found at the configured path' }
    }
    if (!existsSync(romPath)) {
      return { success: false, error: 'ROM file not found at the configured path' }
    }
  } else if (!launchTarget) {
    return {
      success: false,
      error: 'This game has no launch target configured. Edit the game to set a platform or link an executable.',
      unlinked: true
    }
  }

  if (trackedGames.has(gameId)) {
    return { success: false, error: 'Game is already running' }
  }

  try {
    const nowIso = new Date().toISOString()
    updateGame(gameId, {
      sessions: game.sessions + 1,
      lastPlayed: nowIso,
      ...(game.firstPlayed ? {} : { firstPlayed: nowIso })
    })

    const rpcDetails = game.progression?.coOpGroup || undefined
    setActivity(game.title, rpcDetails)

    if (launchType === 'steam') {
      shell.openExternal(`steam://rungameid/${launchTarget}`)
      return { success: true }
    }

    if (launchType === 'epic') {
      shell.openExternal(`com.epicgames.launcher://apps/${launchTarget}?action=launch&silent=true`)
      return { success: true }
    }

    const startTime = Date.now()
    let spawnTarget, spawnArgs, spawnOptions

    if (launchType === 'emulated') {
      spawnTarget = game.emulatorPath
      spawnArgs = [game.romPath]
      const cwd = resolveCwd(game.emulatorPath)
      spawnOptions = { detached: true, stdio: 'ignore', env: { ...process.env } }
      if (cwd) spawnOptions.cwd = cwd
      if (isShellTarget(game.emulatorPath)) spawnOptions.shell = true
    } else {
      if (!existsSync(launchTarget)) {
        return { success: false, error: 'Executable not found at the linked path' }
      }
      const built = buildSpawnOptions({ ...game, exePath: launchTarget }, extraArgs)
      spawnTarget = launchTarget
      spawnArgs = built.args
      spawnOptions = built.options
    }

    const child = spawn(spawnTarget, spawnArgs, spawnOptions)

    trackedGames.set(gameId, { startTime, child })
    startSessionCollection()

    child.on('error', (err) => {
      console.error(`Failed to launch ${game.title}:`, err.message)
      trackedGames.delete(gameId)
      stopSessionCollection()
      clearActivity()
      if (onGameStopCallback) onGameStopCallback(gameId)
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('game:state-change', { gameId, running: false, error: err.message })
      }
    })

    child.on('close', () => {
      const tracked = trackedGames.get(gameId)
      if (tracked) {
        const elapsedMs = Date.now() - tracked.startTime
        if (elapsedMs < HANDOFF_GRACE_MS) {
          console.log(`[GameLauncher] "${game.title}" child exited after ${elapsedMs}ms — likely handed off to another process. Keeping it tracked.`)
          startHandoffPolling(gameId, launchTarget, webContents, tracked)
          return
        }
        finalizeGame(gameId, webContents, tracked.startTime)
      }
    })

    child.unref()

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export function stopTracking(gameId) {
  const tracked = trackedGames.get(gameId)
  if (tracked) {
    tracked.handoffExeDir = undefined
    tracked.handoffMisses = 0
    markRecentlyStopped(gameId)
    if (tracked.detectedOnly) {
      const game = getGames().games.find((g) => g.id === gameId)
      if (game?.exePath) {
        killProcessesUnderDir(dirname(game.exePath))
      }
      finalizeGame(gameId, null, tracked.startTime)
      return true
    }
    if (tracked.child && !tracked.child.killed) {
      tracked.child.kill()
    }
    const elapsed = Math.floor((Date.now() - tracked.startTime) / 1000)
    const current = getGames().games.find((g) => g.id === gameId)
    if (current) {
      updateGame(gameId, {
        playtime: current.playtime + elapsed,
        historicalPlaytime: addHistoricalPlaytime(current, elapsed)
      })
    }
    trackedGames.delete(gameId)
    clearActivity()
    return true
  }
  return false
}

export function getRunningGames() {
  const running = []
  for (const [gameId, info] of trackedGames) {
    running.push({
      gameId,
      elapsed: Math.floor((Date.now() - info.startTime) / 1000)
    })
  }
  return running
}

export function formatPlaytime(seconds) {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hrs}h ${mins}m`
}
