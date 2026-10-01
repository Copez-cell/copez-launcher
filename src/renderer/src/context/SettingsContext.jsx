import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const SettingsContext = createContext(null)

const DEFAULT_VALUES = {
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
  artworkDir: '',
  wallpaper: '',
  blur: 0,
  brightness: 100,
  screenshotHotkey: 'F12',
  enablePerformanceMonitoring: false,
  showRanking: false,
  isDevModeEnabled: false
}

function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_VALUES)
  const [loaded, setLoaded] = useState(false)
  const [wallpaperUrl, setWallpaperUrl] = useState('')

  useEffect(() => {
    async function load() {
      const data = await window.api.settings.get()
      setSettings(data)
      setLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!loaded) return
    applyTheme(settings)
    resolveWallpaper(settings.wallpaper)
  }, [settings, loaded])

  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(settings)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  async function resolveWallpaper(path) {
    if (!path) {
      setWallpaperUrl('')
      return
    }
    const url = await window.api.settings.getWallpaperUrl(path)
    setWallpaperUrl(url)
  }

  const updateSetting = useCallback(async (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      window.api.settings.save({ [key]: value })
      return next
    })
  }, [])

  const updateSettings = useCallback(async (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      window.api.settings.save(partial)
      return next
    })
  }, [])

  const selectDirectory = useCallback(async () => {
    return await window.api.settings.selectDirectory()
  }, [])

  return (
    <SettingsContext.Provider
      value={{ settings, loaded, wallpaperUrl, updateSetting, updateSettings, selectDirectory }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

function applyTheme(settings) {
  const root = document.documentElement
  root.style.setProperty('--accent', settings.accentColor)
  root.style.setProperty('--font-size-base', `${settings.fontSize}px`)
  document.body.style.fontSize = `${settings.fontSize}px`

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return `${r}, ${g}, ${b}`
  }

  const accentRgb = hexToRgb(settings.accentColor)
  root.style.setProperty('--accent-rgb', accentRgb)

  const effectiveTheme = settings.theme === 'system' ? getSystemTheme() : settings.theme

  if (effectiveTheme === 'light') {
    root.style.setProperty('--bg-root', '#f0f2f5')
    root.style.setProperty('--bg-root-rgb', '240, 242, 245')
    root.style.setProperty('--bg-surface', '#ffffff')
    root.style.setProperty('--bg-surface-rgb', '255, 255, 255')
    root.style.setProperty('--bg-surface-raised', '#e8eaed')
    root.style.setProperty('--bg-surface-hover', '#d8dade')
    root.style.setProperty('--bg-overlay', '#ffffff')
    root.style.setProperty('--border', '#d1d5db')
    root.style.setProperty('--border-subtle', '#e5e7eb')
    root.style.setProperty('--text-primary', '#1a1a1f')
    root.style.setProperty('--text-secondary', '#6b7280')
    root.style.setProperty('--text-muted', '#9ca3af')
    root.style.setProperty('--scrollbar-thumb', '#c7c7cc')
    root.style.setProperty('--accent-bg', `rgba(${accentRgb}, 0.08)`)
    root.style.setProperty('--accent-text', settings.accentColor)
  } else {
    root.style.setProperty('--bg-root', '#0d0d0d')
    root.style.setProperty('--bg-root-rgb', '13, 13, 13')
    root.style.setProperty('--bg-surface', '#141416')
    root.style.setProperty('--bg-surface-rgb', '20, 20, 22')
    root.style.setProperty('--bg-surface-raised', '#1c1c1e')
    root.style.setProperty('--bg-surface-hover', '#2a2a2e')
    root.style.setProperty('--bg-overlay', '#111113')
    root.style.setProperty('--border', '#1e1e22')
    root.style.setProperty('--border-subtle', '#2a2a2e')
    root.style.setProperty('--text-primary', '#e0e0e0')
    root.style.setProperty('--text-secondary', '#8e8e93')
    root.style.setProperty('--text-muted', '#555558')
    root.style.setProperty('--scrollbar-thumb', '#2a2a2e')
    root.style.setProperty('--accent-bg', `rgba(${accentRgb}, 0.12)`)
    root.style.setProperty('--accent-text', settings.accentColor)
  }
}
