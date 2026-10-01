import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const storageAPI = {
  init: (userId) => ipcRenderer.invoke('storage:init', userId),
  getGames: () => ipcRenderer.invoke('storage:get-games'),
  saveGames: (data) => ipcRenderer.invoke('storage:save-games', data),
  getCollections: () => ipcRenderer.invoke('storage:get-collections'),
  saveCollections: (data) => ipcRenderer.invoke('storage:save-collections', data),
  updateGame: (gameId, updates) => ipcRenderer.invoke('storage:update-game', gameId, updates),
  deleteGame: (gameId) => ipcRenderer.invoke('storage:delete-game', gameId),
  saveRatings: (gameId, ratings) => ipcRenderer.invoke('storage:save-ratings', gameId, ratings),
  getTiers: () => ipcRenderer.invoke('storage:get-tiers'),
  saveTiers: (data) => ipcRenderer.invoke('storage:save-tiers', data),
  importPreview: () => ipcRenderer.invoke('storage:import-preview'),
  importConfirm: (data) => ipcRenderer.invoke('storage:import-confirm', data)
}

const gameAPI = {
  launch: (gameId, args) => ipcRenderer.invoke('game:launch', gameId, args),
  stop: (gameId) => ipcRenderer.invoke('game:stop', gameId),
  getRunning: () => ipcRenderer.invoke('game:get-running'),
  formatPlaytime: (seconds) => ipcRenderer.invoke('game:format-playtime', seconds),
  addFromPath: (filePath) => ipcRenderer.invoke('add-game-from-path', filePath),
  addManual: (title, extras) => ipcRenderer.invoke('add-manual-game', title, extras),
  linkExe: (gameId) => ipcRenderer.invoke('link-game-exe', gameId),
  searchAutocomplete: (query) => ipcRenderer.invoke('game:search-autocomplete', query),
  getDetails: (gameId) => ipcRenderer.invoke('game:get-details', gameId),
  onStateChange: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('game:state-change', handler)
    return () => ipcRenderer.removeListener('game:state-change', handler)
  },
  onAutoFetched: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('game:auto-fetched', handler)
    return () => ipcRenderer.removeListener('game:auto-fetched', handler)
  }
}

const artworkAPI = {
  getUrl: (imagePath) => ipcRenderer.invoke('artwork:get-url', imagePath),
  resolveBatch: (entries) => ipcRenderer.invoke('artwork:resolve-batch', entries),
  cloudConfig: () => ipcRenderer.invoke('artwork:cloud-config'),
  cloudUrl: (gameId, kind) => ipcRenderer.invoke('artwork:cloud-url', gameId, kind),
  upload: (gameId, kind, localPath) => ipcRenderer.invoke('artwork:upload', gameId, kind, localPath),
  uploadBatch: (entries) => ipcRenderer.invoke('artwork:upload-batch', entries),
  selectLocalImage: (gameId, type) => ipcRenderer.invoke('dialog:select-artwork-image', gameId, type)
}

const fileAPI = {
  readBase64: (filePath) => ipcRenderer.invoke('file:read-base64', filePath)
}

const libraryAPI = {
  scanArtwork: () => ipcRenderer.invoke('library:scan-artwork')
}

const settingsAPI = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  selectGameFile: () => ipcRenderer.invoke('dialog:select-game-file'),
  selectWallpaper: () => ipcRenderer.invoke('dialog:select-wallpaper'),
  selectExecutable: () => ipcRenderer.invoke('dialog:select-executable'),
  selectEmulator: () => ipcRenderer.invoke('dialog:select-emulator'),
  selectRom: () => ipcRenderer.invoke('dialog:select-rom'),
  selectSaveDataFolder: () => ipcRenderer.invoke('dialog:select-save-data-folder'),
  getWallpaperUrl: (wallpaperPath) => ipcRenderer.invoke('settings:get-wallpaper-url', wallpaperPath),
  listWallpapers: () => ipcRenderer.invoke('settings:list-wallpapers'),
  deleteWallpaper: (wallpaperPath) => ipcRenderer.invoke('settings:delete-wallpaper', wallpaperPath),
  testApi: () => ipcRenderer.invoke('settings:test-api')
}

const metadataAPI = {
  fetchGameMetadata: (gameId, gameTitle) =>
    ipcRenderer.invoke('fetch-game-metadata', gameId, gameTitle),
  fetchGameData: (gameName) => ipcRenderer.invoke('fetch-game-data', gameName)
}

const discordAPI = {
  isConnected: () => ipcRenderer.invoke('discord:is-connected')
}

const screenshotAPI = {
  getList: (gameTitle) => ipcRenderer.invoke('screenshot:get-list', gameTitle),
  delete: (filePath) => ipcRenderer.invoke('screenshot:delete', filePath),
  openFolder: (gameTitle) => ipcRenderer.invoke('screenshot:open-folder', gameTitle),
  updateHotkey: (hotkey) => ipcRenderer.invoke('update-screenshot-hotkey', hotkey),
  onCaptured: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('screenshot:taken', handler)
    return () => ipcRenderer.removeListener('screenshot:taken', handler)
  }
}

const steamAPI = {
  syncLibrary: () => ipcRenderer.invoke('steam:sync-library'),
  getAchievements: (appId) => ipcRenderer.invoke('steam:get-achievements', appId)
}

const hardwareAPI = {
  startHardwarePolling: () => ipcRenderer.invoke('hardware:start-polling'),
  stopHardwarePolling: () => ipcRenderer.invoke('hardware:stop-polling'),
  setActiveTab: (tab) => ipcRenderer.invoke('hardware:set-active-tab', tab),
  toggleMonitoring: (isActive) => ipcRenderer.invoke('hardware:toggle-monitoring', isActive),
  getSessionLogs: (gameId) => ipcRenderer.invoke('hardware:get-session-logs', gameId),
  getAllSessionLogs: () => ipcRenderer.invoke('hardware:get-all-session-logs'),
  onHardwareStats: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('hardware-stats', handler)
    return () => {
      ipcRenderer.removeListener('hardware-stats', handler)
    }
  }
}

const windowAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_, isMaximized) => callback(isMaximized)
    ipcRenderer.on('window:maximized-change', handler)
    return () => ipcRenderer.removeListener('window:maximized-change', handler)
  }
}

const updaterAPI = {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
  onStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  }
}

const appAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version')
}

const systemAPI = {
  getSystemSpecs: () => ipcRenderer.invoke('system:get-specs')
}

const api = {
  storage: storageAPI,
  game: gameAPI,
  artwork: artworkAPI,
  file: fileAPI,
  library: libraryAPI,
  settings: settingsAPI,
  metadata: metadataAPI,
  discord: discordAPI,
  screenshot: screenshotAPI,
  steam: steamAPI,
  hardware: hardwareAPI,
  window: windowAPI,
  updater: updaterAPI,
  app: appAPI,
  getSystemSpecs: systemAPI.getSystemSpecs,
  fetchGameData: metadataAPI.fetchGameData
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('contextBridge.exposeInMainWorld failed:', error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
