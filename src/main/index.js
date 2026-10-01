import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, globalShortcut } from 'electron'
import { join, extname } from 'path'
import { existsSync, readFileSync, copyFileSync, mkdirSync, readdirSync } from 'fs'
import { pathToFileURL } from 'url'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import {
  initStorage,
  getGames,
  saveGames,
  getCollections,
  saveCollections,
  updateGame,
  deleteGame,
  saveRatings,
  getTiers,
  saveTiers
} from './storage.js'
import { getSettings, saveSettings, copyWallpaper, listWallpapers, deleteWallpaper } from './settings.js'
import { launchGame, stopTracking, getRunningGames, formatPlaytime, setOnGameStop, startGameWatcher, setGameWebContents } from './game-launcher.js'
import { getArtworkUrl, resolveArtworkBatch } from './artwork.js'
import { isR2Configured, uploadArtwork, artworkUrl } from './r2.js'
import { isConnected as isDiscordConnected } from './discord-rpc.js'
import { captureScreenshot, getScreenshotPaths, deleteScreenshot, openScreenshotFolder } from './screenshots.js'
import { fetchGameMetadata } from './api/fetch-metadata.js'
import { searchStoreGames, getAppDetails, fetchGameData, testSteamStore } from './api/steam-store.js'
import { getOwnedGames, getPlayerAchievements, testSteamApi } from './api/steam-api.js'
import { testSteamGridDB } from './api/steamgriddb.js'
import { backupGameSave } from './backup.js'
import { startHardwarePolling, stopHardwarePolling, setDashboardActive, terminateWorker } from './hardware.js'

let mainWindow = null
let tray = null

function maybeAutoFetch(gameId, gameTitle) {
  const settings = getSettings()
  if (!settings.autoFetchArtwork) return
  fetchGameMetadata(gameId, gameTitle)
    .then((result) => {
      if (result.success && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game:auto-fetched', { gameId, result })
      }
    })
    .catch((err) => console.error(`Auto-fetch failed for ${gameTitle}:`, err.message))
}

function getIconPath() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.ico')
  }
  return join(__dirname, '../../resources/icon.ico')
}

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', payload)
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ status: 'update-available', info })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus({ status: 'update-not-available', info })
  })

  autoUpdater.on('error', (err) => {
    sendUpdateStatus({ status: 'error', message: err?.message || String(err) })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      status: 'download-progress',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ status: 'update-downloaded', info })
  })

  setTimeout(() => {
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err) => console.error('[AutoUpdater] Check failed:', err?.message || err))
  }, 3000)
}

function createTray() {
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show COPEZ',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        tray?.destroy()
        app.quit()
      }
    }
  ])

  tray.setToolTip('COPEZ Launcher')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false)
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.copez.launcher')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.handle('storage:get-games', () => {
      return getGames()
    })

    ipcMain.handle('storage:save-games', (_, data) => {
      return saveGames(data)
    })

    ipcMain.handle('storage:get-collections', () => {
      return getCollections()
    })

    ipcMain.handle('storage:init', (_, userId) => {
      return initStorage(userId)
    })

    ipcMain.handle('storage:save-collections', (_, data) => {
      return saveCollections(data)
    })

    ipcMain.handle('storage:update-game', (_, gameId, updates) => {
      return updateGame(gameId, updates)
    })

    ipcMain.handle('storage:delete-game', (_, gameId) => {
      return deleteGame(gameId)
    })

    ipcMain.handle('storage:save-ratings', (_, gameId, ratings) => {
      return saveRatings(gameId, ratings)
    })

    ipcMain.handle('storage:get-tiers', () => {
      return getTiers()
    })

    ipcMain.handle('update:check', async () => {
      if (!app.isPackaged) {
        return { success: false, error: 'Updates are only available in packaged builds' }
      }
      try {
        const result = await autoUpdater.checkForUpdates()
        return { success: true, result }
      } catch (err) {
        return { success: false, error: err?.message || String(err) }
      }
    })

    ipcMain.handle('update:download', async () => {
      try {
        await autoUpdater.downloadUpdate()
        return { success: true }
      } catch (err) {
        return { success: false, error: err?.message || String(err) }
      }
    })

    ipcMain.handle('update:quit-and-install', () => {
      autoUpdater.quitAndInstall()
      return { success: true }
    })

    ipcMain.handle('app:get-version', () => {
      return app.getVersion()
    })

    ipcMain.handle('storage:save-tiers', (_, data) => {
      return saveTiers(data)
    })

    ipcMain.handle('storage:import-preview', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }
      try {
        const raw = readFileSync(result.filePaths[0], 'utf-8')
        const imported = JSON.parse(raw)
        const importGames = Array.isArray(imported) ? imported : imported.games || imported.data || []
        if (!Array.isArray(importGames) || importGames.length === 0) {
          return { canceled: true, error: 'No games found in file' }
        }
        const existing = getGames().games
        const toUpdate = []
        const toAdd = []
        for (const ig of importGames) {
          const title = (ig.title || ig.name || '').trim()
          if (!title) continue
          const existingGame = existing.find(
            (g) => g.id === ig.id || g.title.toLowerCase() === title.toLowerCase()
          )
          if (existingGame) {
            toUpdate.push({
              existingId: existingGame.id,
              title,
              playtime: ig.playtime || 0,
              sessions: ig.sessions || 0,
              lastPlayed: ig.lastPlayed || null,
              ratings: ig.ratings || {},
              averageRating: ig.averageRating || 0,
              genres: ig.genres || [],
              developer: ig.developer || null,
              publisher: ig.publisher || null,
              releaseDate: ig.releaseDate || null,
              platforms: ig.platforms || [],
              description: ig.description || null
            })
          } else {
            toAdd.push(ig)
          }
        }
        return {
          canceled: false,
          toUpdate,
          toAdd,
          totalImported: importGames.length
        }
      } catch (err) {
        return { canceled: true, error: `Failed to parse file: ${err.message}` }
      }
    })

    ipcMain.handle('storage:import-confirm', (_, { toUpdate, toAdd }) => {
      const data = getGames()
      let updateCount = 0
      let addCount = 0

      if (toUpdate && toUpdate.length > 0) {
        for (const m of toUpdate) {
          const game = data.games.find((g) => g.id === m.existingId)
          if (!game) continue
          game.playtime = m.playtime || 0
          game.sessions = m.sessions || 0
          if (m.lastPlayed) game.lastPlayed = m.lastPlayed
          if (m.ratings && Object.keys(m.ratings).length > 0) game.ratings = m.ratings
          if (m.averageRating) game.averageRating = m.averageRating
          if (m.genres?.length) game.genres = m.genres
          if (m.developer) game.developer = m.developer
          if (m.publisher) game.publisher = m.publisher
          if (m.releaseDate) game.releaseDate = m.releaseDate
          if (m.platforms?.length) game.platforms = m.platforms
          if (m.description) game.description = m.description
          updateCount++
        }
      }

      if (toAdd && toAdd.length > 0) {
        for (const ig of toAdd) {
          const id = ig.id || `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
          const newGame = {
            id,
            title: (ig.title || ig.name || 'Untitled').trim(),
            exePath: ig.exePath || '',
            coverImage: ig.coverImage || null,
            bannerImage: ig.bannerImage || null,
            logoImage: ig.logoImage || null,
            logoOffsetX: ig.logoOffsetX || 0,
            logoOffsetY: ig.logoOffsetY || 0,
            logoScale: ig.logoScale || 1,
            playtime: ig.playtime || 0,
            sessions: ig.sessions || 0,
            lastPlayed: ig.lastPlayed || null,
            firstPlayed: ig.firstPlayed || null,
            genres: ig.genres || [],
            developer: ig.developer || null,
            publisher: ig.publisher || null,
            releaseDate: ig.releaseDate || null,
            description: ig.description || null,
            platforms: ig.platforms || [],
            rawgRating: ig.rawgRating || 0,
            ratings: ig.ratings || {},
            averageRating: ig.averageRating || 0,
            isPlatinum: ig.isPlatinum || false,
            dateFinished: ig.dateFinished || ''
          }
          data.games.push(newGame)
          addCount++
        }
      }

      saveGames(data)
      return { updateCount, addCount }
    })

    ipcMain.handle('settings:get', () => {
      return getSettings()
    })

    ipcMain.handle('settings:save', (_, data) => {
      return saveSettings(data)
    })

    ipcMain.handle('settings:test-api', async () => {
      const settings = getSettings()
      const [steamstore, steamgriddb, steam] = await Promise.all([
        testSteamStore(),
        testSteamGridDB(settings.steamgriddbToken || ''),
        testSteamApi(settings.steamApiKey || '')
      ])
      return { steamstore, steamgriddb, steam }
    })

    ipcMain.handle('dialog:select-directory', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('dialog:select-game-file', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Executables', extensions: ['exe', 'lnk'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('dialog:select-wallpaper', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      const copyResult = copyWallpaper(result.filePaths[0])
      if (!copyResult.success) {
        return { canceled: true, error: copyResult.error }
      }
      return { canceled: false, path: copyResult.path }
    })

    ipcMain.handle('dialog:select-artwork-image', async (_, gameId, type) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }
      const sourcePath = result.filePaths[0]
      const settings = getSettings()
      const artworkDir = settings.artworkDir
      if (!existsSync(artworkDir)) {
        mkdirSync(artworkDir, { recursive: true })
      }
      const ext = extname(sourcePath).toLowerCase() || '.jpg'
      const safeId = (gameId || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_')
      const filename = `${safeId}-${type}-${Date.now()}${ext}`
      const destPath = join(artworkDir, filename)
      try {
        copyFileSync(sourcePath, destPath)
        return { canceled: false, path: destPath }
      } catch (err) {
        return { canceled: true, error: err.message }
      }
    })

    ipcMain.handle('dialog:select-executable', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Executables', extensions: ['exe', 'lnk'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('dialog:select-emulator', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Executables', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('dialog:select-rom', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'ROM Files', extensions: ['iso', 'bin', 'cue', 'rom', 'nes', 'sfc', 'smc', 'gba', 'gbc', 'gb', 'n64', 'z64', 'v64', 'nds', 'ciso', 'wbfs', 'rvz', 'wad', 'chd', 'pbp', 'elf', 'img', 'mdf', 'mds'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('dialog:select-save-data-folder', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    })

    ipcMain.handle('settings:get-wallpaper-url', (_, wallpaperPath) => {
      if (!wallpaperPath) return ''
      try {
        return pathToFileURL(wallpaperPath).href
      } catch {
        return ''
      }
    })

    ipcMain.handle('settings:list-wallpapers', () => {
      return listWallpapers()
    })

    ipcMain.handle('settings:delete-wallpaper', (_, wallpaperPath) => {
      const result = deleteWallpaper(wallpaperPath)
      if (result.success && getSettings().wallpaper === result.path) {
        saveSettings({ wallpaper: '' })
      }
      return result
    })

    let activeGameId = null
    let activeGameTitle = ''
    let currentScreenshotHotkey = getSettings().screenshotHotkey || 'F12'

    async function captureActiveGame() {
      console.log('--> Hotkey physically detected by Electron! Beginning capture sequence...')
      console.log(`[Screenshots] activeGameId=${activeGameId} activeGameTitle="${activeGameTitle}"`)
      if (!activeGameId || !activeGameTitle) {
        console.warn('[Screenshots] No active game tracked — aborting capture.')
        return
      }
      try {
        const filePath = await captureScreenshot(activeGameTitle)
        console.log(`[Screenshots] Capture succeeded: ${filePath}`)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshot:taken', {
            gameId: activeGameId,
            gameTitle: activeGameTitle,
            filePath
          })
        }
      } catch (err) {
        console.error('Screenshot capture pipeline failed:', err.stack)
      }
    }

    function registerScreenshotShortcut(hotkey) {
      try {
        globalShortcut.unregister(currentScreenshotHotkey)
      } catch {}
      try {
        const isRegistered = globalShortcut.register(hotkey, captureActiveGame)
        console.log(`Screenshot hotkey registration status: ${isRegistered} (hotkey="${hotkey}")`)
        currentScreenshotHotkey = hotkey
      } catch (err) {
        console.error(`Failed to register hotkey "${hotkey}":`, err.stack)
      }
    }

    function unregisterScreenshotShortcut() {
      try {
        globalShortcut.unregister(currentScreenshotHotkey)
      } catch {}
    }

    ipcMain.handle('game:launch', (_, gameId, args) => {
      const result = launchGame(gameId, mainWindow?.webContents, args)
      if (result.success) {
        activeGameId = gameId
        const gameData = getGames().games.find((g) => g.id === gameId)
        activeGameTitle = gameData?.title || ''
        console.log(`[Screenshots] Game launched — tracking activeGameId="${gameId}" activeGameTitle="${activeGameTitle}", registering hotkey...`)
        registerScreenshotShortcut(currentScreenshotHotkey)
      }
      return result
    })

    ipcMain.handle('game:stop', (_, gameId) => {
      const result = stopTracking(gameId)
      if (activeGameId === gameId) {
        console.log(`[Screenshots] Game stopped — clearing activeGameId, unregistering hotkey.`)
        activeGameId = null
        activeGameTitle = ''
        unregisterScreenshotShortcut()
      }
      return result
    })

    ipcMain.handle('game:get-running', () => {
      return getRunningGames()
    })

    ipcMain.handle('game:format-playtime', (_, seconds) => {
      return formatPlaytime(seconds)
    })

    ipcMain.handle('discord:is-connected', () => {
      return isDiscordConnected()
    })

    ipcMain.handle('screenshot:get-list', (_, gameTitle) => {
      return getScreenshotPaths(gameTitle)
    })

    ipcMain.handle('screenshot:delete', (_, filePath) => {
      return deleteScreenshot(filePath)
    })

    ipcMain.handle('screenshot:open-folder', (_, gameTitle) => {
      openScreenshotFolder(gameTitle)
      return true
    })

    ipcMain.handle('update-screenshot-hotkey', (_, newHotkey) => {
      const oldHotkey = currentScreenshotHotkey
      saveSettings({ screenshotHotkey: newHotkey })
      currentScreenshotHotkey = newHotkey
      if (activeGameId) {
        try {
          globalShortcut.unregister(oldHotkey)
        } catch {}
        try {
          const isRegistered = globalShortcut.register(newHotkey, captureActiveGame)
          console.log(`Screenshot hotkey re-registration status: ${isRegistered} (hotkey="${newHotkey}")`)
          if (!isRegistered) {
            return { success: false, error: `OS refused to register hotkey "${newHotkey}". Another app may own it.` }
          }
        } catch (err) {
          console.error(`Failed to register hotkey "${newHotkey}":`, err.stack)
          return { success: false, error: err.message }
        }
      }
      return { success: true }
    })

    setOnGameStop((gameId) => {
      if (activeGameId === gameId) {
        activeGameId = null
        activeGameTitle = ''
        unregisterScreenshotShortcut()
      }
    })

    ipcMain.handle('steam:sync-library', async () => {
      const settings = getSettings()
      const { steamApiKey, steamId } = settings
      if (!steamApiKey || !steamId) {
        return { success: false, error: 'Steam API Key and Steam ID64 are required. Set them in Settings.' }
      }
      try {
        const games = await getOwnedGames(steamApiKey, steamId)
        return { success: true, games }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    ipcMain.handle('steam:get-achievements', async (_, appId) => {
      const settings = getSettings()
      const { steamApiKey, steamId } = settings
      if (!steamApiKey || !steamId) {
        return { success: false, error: 'Steam API Key and Steam ID64 are required.' }
      }
      try {
        const result = await getPlayerAchievements(steamApiKey, steamId, appId)
        return { success: true, achievements: result }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    ipcMain.handle('artwork:get-url', (_, imagePath) => {
      return getArtworkUrl(imagePath)
    })

    ipcMain.handle('artwork:resolve-batch', (_, entries) => {
      return resolveArtworkBatch(entries)
    })

    ipcMain.handle('artwork:cloud-config', () => {
      const settings = getSettings()
      if (!isR2Configured(settings)) return { configured: false }
      return {
        configured: true,
        bucket: settings.r2Bucket,
        publicUrl: settings.r2PublicUrl.replace(/\/$/, '')
      }
    })

    ipcMain.handle('artwork:cloud-url', (_, gameId, kind) => {
      const settings = getSettings()
      if (!isR2Configured(settings)) return null
      return artworkUrl(settings, gameId, kind)
    })

    ipcMain.handle('artwork:upload', async (_, gameId, kind, localPath) => {
      const settings = getSettings()
      if (!isR2Configured(settings)) return { uploaded: false, reason: 'r2-not-configured' }
      try {
        const url = await uploadArtwork(settings, gameId, kind, localPath)
        if (!url) return { uploaded: false, reason: 'invalid-input' }
        return { uploaded: true, url }
      } catch (err) {
        return { uploaded: false, reason: err.message }
      }
    })

    ipcMain.handle('artwork:upload-batch', async (_, entries) => {
      const settings = getSettings()
      if (!isR2Configured(settings)) {
        return { uploaded: 0, failed: 0, urls: [], reason: 'r2-not-configured' }
      }
      let uploaded = 0
      let failed = 0
      const urls = []
      for (const { gameId, kind, localPath } of entries || []) {
        try {
          const url = await uploadArtwork(settings, gameId, kind, localPath)
          if (url) {
            uploaded++
            urls.push({ gameId, kind, url })
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
      return { uploaded, failed, urls }
    })

    ipcMain.handle('library:scan-artwork', () => {
      const artworkDir = getSettings().artworkDir
      const byId = {}
      const byTitle = {}
      if (!existsSync(artworkDir)) return { byId, byTitle }
      for (const name of readdirSync(artworkDir)) {
        if (!/\.(png|jpe?g|webp|bmp|gif)$/i.test(name)) continue
        const base = name.replace(/\.[^.]+$/, '')
        const full = join(artworkDir, name)
        const m = /^(.+?)-(cover|banner|logo)(?:-\d+)?$/i.exec(base)
        if (m) {
          const key = m[1]
          const type = m[2].toLowerCase()
          if (!byId[key]) byId[key] = {}
          byId[key][type] = full
        } else {
          const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '')
          if (!slug) continue
          if (!byTitle[slug]) byTitle[slug] = {}
          if (!byTitle[slug].cover) byTitle[slug].cover = full
        }
      }
      return { byId, byTitle }
    })

    ipcMain.handle('file:read-base64', (_, filePath) => {
      if (!filePath || typeof filePath !== 'string') return null
      try {
        if (!existsSync(filePath)) return null
        return readFileSync(filePath).toString('base64')
      } catch (err) {
        console.error('[File] read-base64 failed:', err.message)
        return null
      }
    })

    ipcMain.handle('fetch-game-metadata', async (_, gameId, gameTitle) => {
      return await fetchGameMetadata(gameId, gameTitle)
    })

    ipcMain.handle('add-game-from-path', (_, filePath) => {
      return addGameFromPath(filePath)
    })

    ipcMain.handle('add-manual-game', (_, title, extras) => {
      return addManualGame(title, extras)
    })

    ipcMain.handle('link-game-exe', (_, gameId) => {
      return linkGameExe(gameId)
    })

    ipcMain.handle('game:search-autocomplete', async (_, query) => {
      return searchStoreGames(query)
    })

    ipcMain.handle('game:get-details', async (_, appId) => {
      return getAppDetails(appId)
    })

    ipcMain.handle('fetch-game-data', async (_, gameName) => {
      return fetchGameData(gameName)
    })

    ipcMain.handle('window:minimize', () => {
      mainWindow?.minimize()
    })

    ipcMain.handle('window:maximize', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow?.maximize()
      }
    })

    ipcMain.handle('window:close', () => {
      mainWindow?.close()
    })

    ipcMain.handle('window:is-maximized', () => {
      return mainWindow?.isMaximized() ?? false
    })

    ipcMain.handle('hardware:start-polling', () => {
      if (mainWindow) {
        startHardwarePolling(mainWindow)
      }
      return { success: true }
    })

    ipcMain.handle('hardware:stop-polling', () => {
      stopHardwarePolling()
      return { success: true }
    })

    ipcMain.handle('hardware:set-active-tab', (_, tab) => {
      setDashboardActive(tab === 'dashboard')
      return { success: true }
    })

    ipcMain.handle('hardware:get-session-logs', (_, gameId) => {
      const data = getGames()
      const game = data.games.find((g) => g.id === gameId)
      return game?.hardwareLogs || []
    })

    ipcMain.handle('hardware:get-all-session-logs', () => {
      const data = getGames()
      const allLogs = []
      for (const game of data.games) {
        if (Array.isArray(game.hardwareLogs) && game.hardwareLogs.length > 0) {
          for (const log of game.hardwareLogs) {
            allLogs.push({ ...log, gameId: game.id, gameTitle: game.title })
          }
        }
      }
      allLogs.sort((a, b) => new Date(b.date) - new Date(a.date))
      return allLogs
    })

    ipcMain.handle('hardware:toggle-monitoring', (_, isActive) => {
      if (isActive) {
        if (mainWindow) {
          startHardwarePolling(mainWindow)
        }
        console.log('[Hardware] Monitoring enabled')
      } else {
        terminateWorker()
        console.log('[Hardware] Monitoring disabled — worker terminated')
      }
      return { success: true }
    })

    ipcMain.handle('system:get-specs', () => {
      const cpu = os.cpus()[0]
      return {
        cpuModel: cpu?.model ? cpu.model.trim() : 'Unknown',
        totalRam: os.totalmem(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch()
      }
    })

    createWindow()
    createTray()
    setupAutoUpdater()
    setGameWebContents(mainWindow?.webContents)
    startGameWatcher(() => mainWindow?.webContents)

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else if (mainWindow) {
        mainWindow.show()
      }
    })
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    terminateWorker()
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

function addManualGame(title, extras = {}) {
  if (!title || !title.trim()) {
    return { success: false, error: 'Game title is required' }
  }

  const trimmed = title.trim()

  const data = getGames()
  const exists = data.games.some(
    (g) => g.title.toLowerCase() === trimmed.toLowerCase() && g.exePath
  )
  if (exists) {
    return { success: false, error: 'A linked game with this title already exists' }
  }

  const id = `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const newGame = {
    id,
    title: trimmed,
    exePath: (extras.launchType || 'executable') === 'executable' ? (extras.launchTarget || '') : '',
    launchType: extras.launchType || 'executable',
    launchTarget: extras.launchTarget || '',
    emulatorPath: extras.emulatorPath || '',
    romPath: extras.romPath || '',
    console: extras.console || '',
    saveDataPath: extras.saveDataPath || '',
    coverImage: extras.background_image || null,
    bannerImage: null,
    logoImage: null,
    logoOffsetX: 0,
    logoOffsetY: 0,
    logoScale: 1,
    playtime: 0,
    sessions: 0,
    lastPlayed: null,
    firstPlayed: null,
    genres: extras.genres || [],
    developer: extras.developer || null,
    publisher: extras.publisher || null,
    releaseDate: extras.releaseDate || null,
    description: extras.description || null,
    platforms: extras.platforms || [],
    rawgRating: extras.rawgRating || 0,
    ratings: {},
    averageRating: 0,
    rawgId: extras.rawgId || null,
    isPlatinum: false,
    dateFinished: '',
    historicalPlaytime: {}
  }

  data.games.push(newGame)
  saveGames(data)

  if (!extras.skipAutoFetch) {
    maybeAutoFetch(id, trimmed)
  }

  return { success: true, game: newGame }
}

async function linkGameExe(gameId) {
  const data = getGames()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { success: false, error: 'Game not found' }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe', 'lnk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: 'Cancelled' }
  }

  const filePath = result.filePaths[0]
  const updates = { exePath: filePath }
  if (game.launchType === 'executable') {
    updates.launchTarget = filePath
  }
  updateGame(gameId, updates)

  return { success: true, exePath: filePath }
}

function addGameFromPath(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return { success: false, error: 'File not found' }
  }

  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext !== 'exe' && ext !== 'lnk') {
    return { success: false, error: 'Only .exe and .lnk files are supported' }
  }

  const basename = filePath.replace(/\\/g, '/').split('/').pop() || ''
  const title = basename
    .replace(/\.(exe|lnk)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) {
    return { success: false, error: 'Could not parse game name from path' }
  }

  const data = getGames()
  const exists = data.games.some(
    (g) => g.exePath?.toLowerCase() === filePath.toLowerCase()
  )
  if (exists) {
    return { success: false, error: 'This game is already in your library' }
  }

  const id = `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const newGame = {
    id,
    title,
    exePath: filePath,
    launchType: 'executable',
    launchTarget: filePath,
    emulatorPath: '',
    romPath: '',
    console: '',
    saveDataPath: '',
    coverImage: null,
    bannerImage: null,
    logoImage: null,
    logoOffsetX: 0,
    logoOffsetY: 0,
    logoScale: 1,
    playtime: 0,
    sessions: 0,
    lastPlayed: null,
    firstPlayed: null,
    genres: [],
    developer: null,
    publisher: null,
    releaseDate: null,
    description: null,
    platforms: [],
    rawgRating: 0,
    ratings: {},
    averageRating: 0,
    isPlatinum: false,
    dateFinished: '',
    historicalPlaytime: {}
  }

  data.games.push(newGame)
  saveGames(data)

  maybeAutoFetch(id, title)

  return { success: true, game: newGame }
}
