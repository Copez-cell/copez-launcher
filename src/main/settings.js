import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, readdirSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { app } from 'electron'

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')
const WALLPAPERS_DIR = join(app.getPath('userData'), 'wallpapers')

const DEFAULT_SETTINGS = {
  theme: 'dark',
  accentColor: '#06d6a0',
  fontSize: 13,
  cardSize: 'medium',
  coversFolder: '',
  bannersFolder: '',
  rawgApiKey: '',
  steamgriddbToken: '',
  steamApiKey: '',
  steamId: '',
  autoFetchArtwork: false,
  artworkDir: join(app.getPath('userData'), 'artwork'),
  r2AccountId: '',
  r2AccessKeyId: '',
  r2SecretAccessKey: '',
  r2Bucket: '',
  r2PublicUrl: '',
  wallpaper: '',
  blur: 0,
  brightness: 100,
  collectionsExpanded: true,
  screenshotHotkey: 'F12',
  enablePerformanceMonitoring: false,
  isDevModeEnabled: false
}

function ensureDir() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(WALLPAPERS_DIR)) {
    mkdirSync(WALLPAPERS_DIR, { recursive: true })
  }
}

export function getSettings() {
  ensureDir()
  if (!existsSync(SETTINGS_PATH)) {
    writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
    return { ...DEFAULT_SETTINGS }
  }
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(data) {
  ensureDir()
  const current = getSettings()
  const merged = { ...current, ...data }
  writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

export function copyWallpaper(sourcePath) {
  ensureDir()
  const ext = extname(sourcePath).toLowerCase()
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
  if (!allowed.includes(ext)) {
    return { success: false, error: 'Unsupported format. Use JPG, PNG, WebP, or BMP.' }
  }

  let size
  try {
    size = statSync(sourcePath).size
  } catch {
    return { success: false, error: 'Could not read file.' }
  }
  if (size > 20 * 1024 * 1024) {
    return { success: false, error: 'File too large. Maximum size is 20 MB.' }
  }
  if (size === 0) {
    return { success: false, error: 'File is empty.' }
  }

  const filename = `wallpaper-${Date.now()}${ext}`
  const dest = join(WALLPAPERS_DIR, filename)
  copyFileSync(sourcePath, dest)
  return { success: true, path: dest }
}

export function listWallpapers() {
  ensureDir()
  try {
    const files = readdirSync(WALLPAPERS_DIR)
    return files
      .filter((f) => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f))
      .map((name) => {
        const path = join(WALLPAPERS_DIR, name)
        let mtime = 0
        try {
          mtime = statSync(path).mtimeMs
        } catch {
          // ignore unreadable files
        }
        return { name, path, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch {
    return []
  }
}

export function deleteWallpaper(wallpaperPath) {
  try {
    const name = basename(wallpaperPath || '')
    if (!name) return { success: false, error: 'Invalid path' }
    const resolved = join(WALLPAPERS_DIR, name)
    if (!resolved.startsWith(WALLPAPERS_DIR)) {
      return { success: false, error: 'Invalid path' }
    }
    if (!existsSync(resolved)) {
      return { success: false, error: 'Not found' }
    }
    unlinkSync(resolved)
    return { success: true, path: resolved }
  } catch {
    return { success: false, error: 'Could not delete file' }
  }
}
