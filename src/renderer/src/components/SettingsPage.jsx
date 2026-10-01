import { useState, useRef, useEffect, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'
import { supabase, getReadyPromise } from '../lib/supabase'
import {
  creatorIsConfigured,
  creatorSetPassword,
  creatorVerify,
  creatorListGames,
  creatorRenameGame,
  creatorDeleteGame,
  creatorPurgeArtwork
} from '../lib/creatorMode'
import ColorWheel from './ColorWheel'

const API_TEST_ITEMS = [
  { key: 'steamstore', label: 'Steam Storefront', desc: 'Game search, metadata & artwork (no key)' },
  { key: 'steamgriddb', label: 'SteamGridDB', desc: 'Covers, banners & logos' },
  { key: 'steam', label: 'Steam Web API', desc: 'Steam playtime sync' },
  { key: 'cloud', label: 'Cloud (Supabase)', desc: 'Community & online features' }
]

const ACCENT_PRESETS = [
  '#06d6a0',
  '#ffffff',
  '#000000',
  '#ff8c42',
  '#ef476f',
  '#06d6a0',
  '#118ab2',
  '#8e8eff',
  '#9b5de5'
]

const MODIFIER_MAP = {
  Control: 'CommandOrControl',
  Meta: 'CommandOrControl',
  Shift: 'Shift',
  Alt: 'Alt'
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt'])

function mapKey(e) {
  if (e.code === 'Space') return 'Space'
  if (e.code === 'BracketLeft') return '['
  if (e.code === 'BracketRight') return ']'
  if (e.code === 'Backslash') return '\\'
  if (e.code === 'Semicolon') return ';'
  if (e.code === 'Quote') return "'"
  if (e.code === 'Comma') return ','
  if (e.code === 'Period') return '.'
  if (e.code === 'Slash') return '/'
  if (e.code === 'Backquote') return '`'
  if (e.code === 'Minus') return '-'
  if (e.code === 'Equal') return '='
  if (e.code === 'IntlBackslash') return '\\'
  if (e.code === 'IntlRo') return '\\'
  if (e.code === 'Delete') return 'Delete'
  if (e.code === 'Insert') return 'Insert'
  if (e.code === 'Home') return 'Home'
  if (e.code === 'End') return 'End'
  if (e.code === 'PageUp') return 'PageUp'
  if (e.code === 'PageDown') return 'PageDown'
  if (e.code === 'Tab') return 'Tab'
  if (e.code === 'Enter') return 'Enter'
  if (e.code === 'Backspace') return 'Backspace'
  if (e.code.startsWith('Arrow')) return e.code
  if (e.code.startsWith('F') && e.code.length > 1) {
    const num = parseInt(e.code.slice(1), 10)
    if (num >= 1 && num <= 24) return e.code
  }
  if (e.code.startsWith('Key') && e.code.length === 4) return e.code[3].toUpperCase()
  if (e.code.startsWith('Digit') && e.code.length === 5) return e.code[5]
  if (e.code === 'Numpad0') return 'num0'
  if (e.code === 'Numpad1') return 'num1'
  if (e.code === 'Numpad2') return 'num2'
  if (e.code === 'Numpad3') return 'num3'
  if (e.code === 'Numpad4') return 'num4'
  if (e.code === 'Numpad5') return 'num5'
  if (e.code === 'Numpad6') return 'num6'
  if (e.code === 'Numpad7') return 'num7'
  if (e.code === 'Numpad8') return 'num8'
  if (e.code === 'Numpad9') return 'num9'
  if (e.code === 'NumpadAdd') return 'numadd'
  if (e.code === 'NumpadSubtract') return 'numsub'
  if (e.code === 'NumpadMultiply') return 'nummult'
  if (e.code === 'NumpadDivide') return 'numdiv'
  if (e.code === 'NumpadDecimal') return 'numdec'
  if (e.code === 'NumpadEnter') return 'Enter'
  if (e.key.length === 1) return e.key.toUpperCase()
  return e.key
}

function buildModifiers(e) {
  const mods = []
  if (e.ctrlKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('CommandOrControl')
  return [...new Set(mods)]
}

function HotkeyInput({ value, onChange }) {
  const [isRecording, setIsRecording] = useState(false)
  const [liveMods, setLiveMods] = useState([])
  const containerRef = useRef(null)

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setLiveMods([])
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (!isRecording) return
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      stopRecording()
      return
    }

    setLiveMods(buildModifiers(e))
  }, [isRecording, stopRecording])

  const handleKeyUp = useCallback((e) => {
    if (!isRecording) return
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') return

    const mods = buildModifiers(e)
    if (MODIFIER_KEYS.has(e.key)) {
      setLiveMods(mods)
      return
    }

    const key = mapKey(e)
    const combo = [...mods, key].join('+')
    setIsRecording(false)
    setLiveMods([])
    onChange(combo)
  }, [isRecording, onChange])

  useEffect(() => {
    if (!isRecording) return
    const el = containerRef.current
    if (!el) return

    el.focus({ preventScroll: true })

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [isRecording, handleKeyDown, handleKeyUp])

  const displaySegments = isRecording
    ? liveMods.length > 0
      ? [...liveMods, '...']
      : ['Press keys...']
    : value
      ? value.split('+')
      : ['None']

  return (
    <div className="hotkey-input-wrapper">
      <div
        ref={containerRef}
        className={`hotkey-input ${isRecording ? 'hotkey-input--recording' : ''}`}
        tabIndex={0}
        onClick={() => {
          if (!isRecording) setIsRecording(true)
        }}
        role="button"
        aria-label="Record hotkey"
      >
        {isRecording && <span className="hotkey-recording-dot" />}
        <div className="hotkey-badges">
          {displaySegments.map((seg, i) => (
            <span
              key={`${seg}-${i}`}
              className={`hotkey-badge ${
                isRecording && seg === '...' ? 'hotkey-badge--pending' : ''
              }`}
            >
              {seg}
            </span>
          ))}
        </div>
        {!isRecording && (
          <span className="hotkey-record-btn" title="Record new binding">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </span>
        )}
      </div>
      {!isRecording && value && value !== 'F12' && (
        <button
          className="hotkey-input-reset"
          onClick={() => onChange('F12')}
          title="Reset to default (F12)"
        >
          Reset
        </button>
      )}
    </div>
  )
}

function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

function SettingsPage({ onImportComplete, onRecoverLibrary }) {
  const { settings, updateSetting, wallpaperUrl } = useSettings()
  const [tab, setTab] = useState('appearance')
  const [hexInput, setHexInput] = useState(settings.accentColor)
  const [hexError, setHexError] = useState(false)
  const [wallpaperError, setWallpaperError] = useState('')
  const [savedWallpapers, setSavedWallpapers] = useState([])
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle', message: '' })
  const [updateChecking, setUpdateChecking] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [isOpenColorPicker, setIsOpenColorPicker] = useState(false)
  const [livePreview, setLivePreview] = useState(null)
  const [apiResults, setApiResults] = useState(null)
  const [apiTesting, setApiTesting] = useState(false)
  const colorPickerRef = useRef(null)
  const popoverRef = useRef(null)

  async function testCloud() {
    const start = performance.now()
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
      return { status: 'missing', success: false, latency: 0, message: 'Supabase not configured' }
    }
    try {
      await getReadyPromise()
      const { error } = await supabase.from('games').select('id').limit(1)
      const latency = Math.round(performance.now() - start)
      if (error) return { status: 'fail', success: false, latency, message: error.message }
      return { status: 'ok', success: true, latency, message: 'Working' }
    } catch (error) {
      return { status: 'fail', success: false, latency: Math.round(performance.now() - start), message: error.message }
    }
  }

  async function runApiTests() {
    setApiTesting(true)
    try {
      const [mainRes, cloud] = await Promise.all([
        window.api.settings.testApi(),
        testCloud()
      ])
      setApiResults({ ...mainRes, cloud })
    } catch (error) {
      setApiResults({ cloud: { success: false, latency: 0, message: error.message } })
    }
    setApiTesting(false)
  }

  useEffect(() => {
    if (!isOpenColorPicker) return

    function handleClickOutside(e) {      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        colorPickerRef.current && !colorPickerRef.current.contains(e.target)
      ) {
        setIsOpenColorPicker(false)
        setLivePreview(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [isOpenColorPicker])

  useEffect(() => {
    if (window.api.app?.getVersion) {
      window.api.app.getVersion().then((v) => setAppVersion(v || ''))
    }
  }, [])

  useEffect(() => {
    if (window.api.settings?.listWallpapers) {
      refreshWallpapers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return window.api.updater.onStatus((s) => {
      if (s.status === 'checking') {
        setUpdateStatus({ state: 'checking', message: 'Checking for updates...' })
      } else if (s.status === 'update-not-available') {
        setUpdateStatus({ state: 'ok', message: "You're up to date" })
        setUpdateChecking(false)
      } else if (s.status === 'update-available') {
        setUpdateStatus({ state: 'ok', message: 'Update found — downloading...' })
        setUpdateChecking(false)
      } else if (s.status === 'update-downloaded') {
        setUpdateStatus({ state: 'ok', message: 'Update ready — restart to install' })
        setUpdateChecking(false)
      } else if (s.status === 'error') {
        setUpdateStatus({ state: 'error', message: s.message || 'Update check failed' })
        setUpdateChecking(false)
      }
    })
  }, [])

  async function checkForUpdates() {
    setUpdateChecking(true)
    setUpdateStatus({ state: 'checking', message: 'Checking for updates...' })
    const res = await window.api.updater.check()
    if (res && !res.success) {
      setUpdateStatus({ state: 'error', message: res.error })
      setUpdateChecking(false)
    }
  }

  function handleThemeChange(theme) {
    updateSetting('theme', theme)
  }

  function handleHexSubmit() {
    const val = hexInput.trim()
    if (isValidHex(val)) {
      updateSetting('accentColor', val.toLowerCase())
      setHexError(false)
    } else {
      setHexError(true)
    }
  }

  function handleHexKeyDown(e) {
    if (e.key === 'Enter') handleHexSubmit()
  }

  function handlePresetClick(color) {
    updateSetting('accentColor', color)
    setHexInput(color)
    setHexError(false)
  }

  function handleResetAccent() {
    updateSetting('accentColor', '#06d6a0')
    setHexInput('#06d6a0')
    setHexError(false)
    setIsOpenColorPicker(false)
    setLivePreview(null)
  }

  function handleColorWheelChange(hex) {
    setHexInput(hex)
    setHexError(false)
    setLivePreview(hex)
    updateSetting('accentColor', hex)
  }

  function handleColorPickerToggle() {
    if (isOpenColorPicker) {
      setLivePreview(null)
    }
    setIsOpenColorPicker(!isOpenColorPicker)
  }

  async function handleUploadWallpaper() {
    setWallpaperError('')
    const result = await window.api.settings.selectWallpaper()
    if (result.canceled) return
    if (result.error) {
      setWallpaperError(result.error)
      return
    }
    if (result.path) {
      updateSetting('wallpaper', result.path)
      refreshWallpapers()
    }
  }

  async function refreshWallpapers() {
    const list = await window.api.settings.listWallpapers()
    const withUrl = await Promise.all(
      (list || []).map(async (w) => ({
        ...w,
        url: await window.api.settings.getWallpaperUrl(w.path),
      }))
    )
    setSavedWallpapers(withUrl)
  }

  async function handleDeleteWallpaper(path) {
    await window.api.settings.deleteWallpaper(path)
    if (settings.wallpaper === path) {
      updateSetting('wallpaper', '')
    }
    refreshWallpapers()
  }

  function handleRemoveWallpaper() {
    updateSetting('wallpaper', '')
    updateSetting('blur', 0)
    updateSetting('brightness', 100)
    setWallpaperError('')
  }

  return (
    <div className="settings-page">

      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === 'appearance' ? 'active' : ''}`}
          onClick={() => setTab('appearance')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="0.5" />
            <circle cx="17.5" cy="10.5" r="0.5" />
            <circle cx="8.5" cy="7.5" r="0.5" />
            <circle cx="6.5" cy="12.5" r="0.5" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
          Theme &amp; Appearance
        </button>
        <button
          className={`settings-tab ${tab === 'storage' ? 'active' : ''}`}
          onClick={() => setTab('storage')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
          </svg>
          Storage
        </button>
        <button
          className={`settings-tab ${tab === 'system' ? 'active' : ''}`}
          onClick={() => setTab('system')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          System
        </button>
      </div>

      {tab === 'appearance' && (
      <>
      {/* ===== THEME SELECTION ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        <div className="settings-row">
          <label className="settings-label">Mode</label>
          <div className="settings-pill-group">
            {['light', 'dark', 'system'].map((t) => (
              <button
                key={t}
                className={`settings-pill ${settings.theme === t ? 'active' : ''}`}
                onClick={() => handleThemeChange(t)}
              >
                {t === 'light' && <span className="pill-icon">&#9728;</span>}
                {t === 'dark' && <span className="pill-icon">&#9790;</span>}
                {t === 'system' && <span className="pill-icon">&#9881;</span>}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ACCENT COLOR ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Accent Color</h3>
        <div className="settings-row settings-row--stack">
          <label className="settings-label">Color</label>
          <div className="settings-accent-row">
            <div className="settings-hex-input-wrap">
              <span className="settings-hex-hash">#</span>
              <input
                className={`settings-hex-input ${hexError ? 'error' : ''}`}
                type="text"
                maxLength={6}
                value={hexInput.replace('#', '')}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '')
                  const newHex = '#' + v
                  setHexInput(newHex)
                  setHexError(false)
                  if (/^#[0-9a-fA-F]{6}$/.test(newHex)) {
                    updateSetting('accentColor', newHex.toLowerCase())
                  }
                }}
                onBlur={handleHexSubmit}
                onKeyDown={handleHexKeyDown}
                placeholder="06d6a0"
              />
              <button
                ref={colorPickerRef}
                className={`settings-hex-preview ${isOpenColorPicker ? 'active' : ''}`}
                style={{ background: isValidHex(hexInput) ? hexInput : settings.accentColor }}
                onClick={handleColorPickerToggle}
                title="Open Color Wheel"
                type="button"
              />
            </div>
            <button className="settings-reset-btn" onClick={handleResetAccent}>
              Reset
            </button>
          </div>
          {isOpenColorPicker && (
            <div ref={popoverRef} className="color-wheel-popover">
              <div className="color-wheel-popover-arrow" />
              <ColorWheel
                color={livePreview || settings.accentColor}
                onChange={handleColorWheelChange}
              />
            </div>
          )}
        </div>
        <div className="settings-row settings-row--stack">
          <label className="settings-label">Presets</label>
          <div className="settings-color-circles">
            {ACCENT_PRESETS.map((color, i) => (
              <button
                key={`${color}-${i}`}
                className={`settings-color-circle ${settings.accentColor === color ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => handlePresetClick(color)}
              >
                {settings.accentColor === color && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke={color === '#000000' || color === '#118ab2' || color === '#8e8eff' || color === '#9b5de5' ? '#fff' : '#000'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== APPEARANCE ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Appearance</h3>

        <div className="settings-row">
          <label className="settings-label">Card Size</label>
          <div className="settings-pill-group">
            {['small', 'medium', 'large'].map((size) => (
              <button
                key={size}
                className={`settings-pill ${settings.cardSize === size ? 'active' : ''}`}
                onClick={() => updateSetting('cardSize', size)}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Font Size</label>
          <div className="settings-slider-wrap">
            {(() => {
              const minF = 11
              const maxF = 17
              const fontSizeVal = Number(settings.fontSize) || minF
              const pct = ((fontSizeVal - minF) / (maxF - minF)) * 100
              return (
                <input
                  type="range"
                  className="settings-slider"
                  min={minF}
                  max={maxF}
                  step="1"
                  value={fontSizeVal}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value, 10))}
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--bg-surface-raised) ${pct}%, var(--bg-surface-raised) 100%)`
                  }}
                />
              )
            })()}
            <span className="settings-slider-value">
              {Math.round(Number(settings.fontSize) || 11)}px
            </span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Show Ranking Numbers</label>
          <button
            className={`settings-toggle ${settings.showRanking ? 'active' : ''}`}
            onClick={() => updateSetting('showRanking', !settings.showRanking)}
          >
            <span className="settings-toggle-track">
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        </div>
      </div>

      {/* ===== IMAGE CUSTOMIZATION ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Image Customization</h3>

        <div className="settings-row">
          <label className="settings-label">Blur</label>
          <div className="settings-slider-wrap">
            <input
              type="range"
              className="settings-slider"
              min="0"
              max="20"
              step="1"
              value={settings.blur || 0}
              onChange={(e) => updateSetting('blur', parseInt(e.target.value))}
            />
            <span className="settings-slider-value">{settings.blur || 0}%</span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Brightness</label>
          <div className="settings-slider-wrap">
            <input
              type="range"
              className="settings-slider"
              min="20"
              max="150"
              step="5"
              value={settings.brightness || 100}
              onChange={(e) => updateSetting('brightness', parseInt(e.target.value))}
            />
            <span className="settings-slider-value">{settings.brightness || 100}%</span>
          </div>
        </div>
      </div>

      {/* ===== WALLPAPER ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Background Wallpaper</h3>
        <p className="settings-hint">JPG, PNG, WebP, or BMP — max 20 MB</p>
        <div className="settings-wallpaper-single">
          {settings.wallpaper && wallpaperUrl ? (
            <div className="settings-wallpaper-preview-card">
              <div
                className="wallpaper-preview wallpaper-preview-image"
                style={{ backgroundImage: `url(${wallpaperUrl})` }}
              />
              <div className="settings-wallpaper-actions">
                <button className="settings-wallpaper-change-btn" onClick={handleUploadWallpaper}>
                  Change Image
                </button>
                <button className="settings-wallpaper-remove-btn" onClick={handleRemoveWallpaper}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              className="settings-wallpaper-upload-large"
              onClick={handleUploadWallpaper}
            >
              <div className="wallpaper-upload-icon-large">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <span className="wallpaper-upload-text">Upload Image</span>
              <span className="wallpaper-upload-subtext">Click to browse your files</span>
            </button>
          )}
        </div>
        {wallpaperError && (
          <div className="settings-wallpaper-error">{wallpaperError}</div>
        )}

        {savedWallpapers.length > 0 && (
          <>
            <p className="settings-wallpaper-gallery-label">
              Saved wallpapers ({savedWallpapers.length})
            </p>
            <div className="settings-wallpaper-gallery">
              {savedWallpapers.map((w) => (
                <div
                  key={w.path}
                  className={`settings-wallpaper-item ${settings.wallpaper === w.path ? 'active' : ''}`}
                  onClick={() => updateSetting('wallpaper', w.path)}
                  title="Click to apply"
                >
                  <div
                    className="settings-wallpaper-thumb"
                    style={{ backgroundImage: `url(${w.url})` }}
                  />
                  <span className="settings-wallpaper-item-name">{w.name}</span>
                  <button
                    className="settings-wallpaper-item-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWallpaper(w.path)
                    }}
                    title="Delete saved wallpaper"
                  >
                    &#10005;
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ===== ARTWORK FOLDERS ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Artwork Folders</h3>

        <div className="settings-row">
          <label className="settings-label">Covers Folder</label>
          <div className="settings-folder-row">
            <span className="settings-folder-path">
              {settings.coversFolder || 'Not set'}
            </span>
            <button
              className="settings-folder-btn"
              onClick={async () => {
                const result = await window.api.settings.selectDirectory()
                if (!result.canceled && result.path) updateSetting('coversFolder', result.path)
              }}
            >
              Choose Folder
            </button>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Banners Folder</label>
          <div className="settings-folder-row">
            <span className="settings-folder-path">
              {settings.bannersFolder || 'Not set'}
            </span>
            <button
              className="settings-folder-btn"
              onClick={async () => {
                const result = await window.api.settings.selectDirectory()
                if (!result.canceled && result.path) updateSetting('bannersFolder', result.path)
              }}
            >
              Choose Folder
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {tab === 'storage' && (
      <>
      {/* ===== IMPORT DATA ===== */}
      <ImportSection onImportComplete={onImportComplete} />

      <div className="settings-section">
        <h3 className="settings-section-title">Recover Library</h3>
        <p className="settings-import-desc">
          If your local game list was wiped, rebuild it from your cloud stats and local artwork.
          Recovered games will need their launch paths re-linked.
        </p>
        <button
          className="settings-import-btn"
          onClick={() => onRecoverLibrary && onRecoverLibrary()}
        >
          Recover from Cloud
        </button>
      </div>
      </>
      )}

      {tab === 'system' && (
      <>
      {/* ===== API KEYS ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">API Keys</h3>

        <div className="settings-row">
          <label className="settings-label">Steam Storefront</label>
          <p className="settings-hint" style={{ margin: 0 }}>
            Metadata auto-fetch uses the public Steam Storefront API — no key or credentials required.
          </p>
        </div>

        <div className="settings-row">
          <label className="settings-label">SteamGridDB Token</label>
          <input
            type="password"
            className="settings-input"
            placeholder="Enter your SteamGridDB token"
            value={settings.steamgriddbToken}
            onChange={(e) => updateSetting('steamgriddbToken', e.target.value)}
          />
        </div>

        <div className="settings-row">
          <label className="settings-label">Steam Web API Key</label>
          <input
            type="password"
            className="settings-input"
            placeholder="Enter your Steam Web API key"
            value={settings.steamApiKey}
            onChange={(e) => updateSetting('steamApiKey', e.target.value)}
          />
        </div>

        <div className="settings-row">
          <label className="settings-label">Steam ID64</label>
          <input
            type="text"
            className="settings-input"
            placeholder="e.g. 76561198000000000"
            value={settings.steamId}
            onChange={(e) => updateSetting('steamId', e.target.value)}
          />
        </div>

        <div className="settings-row">
          <label className="settings-label">Auto-Fetch Artwork</label>
          <button
            className={`settings-toggle ${settings.autoFetchArtwork ? 'active' : ''}`}
            onClick={() => updateSetting('autoFetchArtwork', !settings.autoFetchArtwork)}
          >
            <span className="settings-toggle-track">
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        </div>
      </div>

      {/* ===== API TESTER ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">API Tester</h3>
        <p className="settings-hint">
          Check whether each API is reachable from your network. Run this after changing keys.
        </p>

        <div className="settings-row">
          <button
            className="settings-import-btn"
            onClick={runApiTests}
            disabled={apiTesting}
          >
            {apiTesting ? (
              <>
                <span className="auth-spinner" />
                Testing...
              </>
            ) : (
              'Test All APIs'
            )}
          </button>
        </div>

        {apiResults && (() => {
          const tested = API_TEST_ITEMS.filter(({ key }) => apiResults[key])
          const working = tested.filter(({ key }) => apiResults[key]?.status === 'ok')
          const missing = tested.filter(({ key }) => apiResults[key]?.status === 'missing')
          const failed = tested.filter(({ key }) => apiResults[key]?.status === 'fail')
          let summaryClass = 'partial'
          let summaryText = `${working.length} of ${tested.length} services working`
          if (tested.length > 0 && working.length === tested.length) {
            summaryClass = 'ok'
            summaryText = 'All services working'
          } else if (failed.length === 0 && missing.length > 0) {
            summaryClass = 'warn'
            summaryText = `${working.length} working · ${missing.length} not configured (add keys above)`
          } else if (failed.length > 0) {
            summaryClass = 'fail'
            summaryText = `${working.length} working · ${failed.length} not working · ${missing.length} not configured`
          }
          return (
            <div className="api-tester-results">
              <div className={`api-tester-summary api-tester-summary--${summaryClass}`}>
                <span className="api-tester-summary-icon" aria-hidden="true">
                  {summaryClass === 'ok' ? '✓' : '!'}
                </span>
                <span>{summaryText}</span>
              </div>
              {tested.map(({ key, label, desc }) => {
                const r = apiResults[key]
                const st = r?.status || 'idle'
                const statusLabel =
                  st === 'ok' ? 'Working' : st === 'missing' ? 'Not configured' : st === 'fail' ? 'Not working' : '—'
                return (
                  <div
                    key={key}
                    className={`api-tester-row api-tester-row--${st}`}
                    title={r?.message || ''}
                  >
                    <span className="api-tester-dot" aria-hidden="true" />
                    <span className="api-tester-name">{label}</span>
                    <span className="api-tester-desc">{desc}</span>
                    <span className="api-tester-status">
                      {statusLabel}
                      {r?.latency > 0 && ` · ${r.latency}ms`}
                    </span>
                    {r && r.status === 'fail' && <span className="api-tester-msg">{r.message}</span>}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* ===== SYSTEM FEATURES ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">System Features</h3>

        <div className="settings-row settings-row--stack">
          <label className="settings-label">Performance Monitoring</label>
          <div className="settings-toggle-row">
            <button
              className={`settings-toggle settings-toggle--glow ${settings.enablePerformanceMonitoring ? 'active' : ''}`}
              onClick={() => {
                const next = !settings.enablePerformanceMonitoring
                updateSetting('enablePerformanceMonitoring', next)
                window.api.hardware.toggleMonitoring(next)
              }}
            >
              <span className="settings-toggle-track">
                <span className="settings-toggle-thumb" />
              </span>
            </button>
          </div>
          <p className="settings-hint settings-hint--indented">
            Enable real-time hardware monitoring. (Note: May impact background CPU usage).
          </p>
        </div>
      </div>

      {/* ===== UPDATES ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Updates</h3>

        <div className="settings-row settings-row--stack">
          <label className="settings-label">
            Current Version
            {appVersion && <span className="settings-value">v{appVersion}</span>}
          </label>
          <button
            className="settings-import-btn"
            onClick={checkForUpdates}
            disabled={updateChecking}
          >
            {updateChecking ? (
              <>
                <span className="auth-spinner" />
                Checking...
              </>
            ) : (
              'Search for Updates'
            )}
          </button>
          {updateStatus.state !== 'idle' && (
            <p className={`settings-hint settings-hint--indented ${updateStatus.state === 'error' ? 'settings-hint--warning' : ''}`}>
              {updateStatus.message}
            </p>
          )}
        </div>
      </div>

      {/* ===== DEVELOPER MODE ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Developer</h3>

        <div className="settings-row settings-row--stack">
          <label className="settings-label">Developer Mode</label>
          <div className="settings-toggle-row">
            <button
              className={`settings-toggle ${settings.isDevModeEnabled ? 'active' : ''}`}
              onClick={() => updateSetting('isDevModeEnabled', !settings.isDevModeEnabled)}
            >
              <span className="settings-toggle-track">
                <span className="settings-toggle-thumb" />
              </span>
            </button>
          </div>
          <p className="settings-hint settings-hint--indented settings-hint--warning">
            Warning: Allows manual editing of raw database statistics. Use with caution.
          </p>
        </div>
      </div>

      {/* ===== CREATOR MODE ===== */}
      <CreatorModeSection />

      {/* ===== SCREENSHOT HOTKEY ===== */}
      <div className="settings-section">
        <h3 className="settings-section-title">Screenshot Hotkey</h3>
        <div className="settings-row">
          <label className="settings-label">Capture Key</label>
          <HotkeyInput
            value={settings.screenshotHotkey}
            onChange={(val) => {
              updateSetting('screenshotHotkey', val)
              window.api.screenshot.updateHotkey(val)
            }}
          />
        </div>
        <p className="settings-hint">
          Press this key while a game is running to take a screenshot. Only active during gameplay.
        </p>
      </div>
      </>
      )}
    </div>
  )
}

function CreatorModeSection() {
  const [configured, setConfigured] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [search, setSearch] = useState('')
  const [games, setGames] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [loadingGames, setLoadingGames] = useState(false)

  useEffect(() => {
    let cancelled = false
    getReadyPromise().then(async () => {
      try {
        const ok = await creatorIsConfigured()
        if (!cancelled) setConfigured(ok)
      } catch {
        if (!cancelled) setConfigured(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 4000)
  }

  async function handleUnlock() {
    if (!password) return
    setBusy(true)
    try {
      if (configured) {
        const ok = await creatorVerify(password)
        if (!ok) {
          flash('error', 'Wrong admin password.')
          setBusy(false)
          return
        }
        setUnlocked(true)
        loadGames()
      } else {
        await creatorSetPassword('', password)
        setConfigured(true)
        setUnlocked(true)
        flash('success', 'Admin password set. Creator Mode enabled.')
        loadGames()
      }
    } catch (err) {
      flash('error', err.message)
    }
    setBusy(false)
  }

  async function handleSetPassword() {
    const next = prompt('Enter a new admin password (min 4 characters):')
    if (!next) return
    setBusy(true)
    try {
      await creatorSetPassword(password, next)
      flash('success', 'Admin password updated.')
    } catch (err) {
      flash('error', err.message)
    }
    setBusy(false)
  }

  async function loadGames() {
    setLoadingGames(true)
    try {
      const rows = await creatorListGames(search)
      setGames(rows)
    } catch (err) {
      flash('error', err.message)
    }
    setLoadingGames(false)
  }

  async function handleRename(gameId) {
    const title = editTitle.trim()
    if (!title || editingId !== gameId) return
    setBusy(true)
    try {
      await creatorRenameGame(gameId, title, password)
      setEditingId(null)
      setEditTitle('')
      flash('success', 'Game renamed for all players.')
      loadGames()
    } catch (err) {
      flash('error', err.message)
    }
    setBusy(false)
  }

  async function handleDelete(gameId, title) {
    if (!window.confirm(`Delete "${title}" from the shared game database?\n\nStats stay preserved, but the game disappears for all players.`)) return
    setBusy(true)
    try {
      await creatorDeleteGame(gameId, password)
      flash('success', `"${title}" deleted for all players.`)
      loadGames()
    } catch (err) {
      flash('error', err.message)
    }
    setBusy(false)
  }

  async function handlePurgeArtwork() {
    if (!window.confirm('Delete ALL previously-uploaded cover/banner/logo files from cloud storage?\n\nYour artwork stays safe on this machine. This frees up Supabase storage. Other players\' community views will no longer show shared art for those games.')) return
    setBusy(true)
    try {
      const count = await creatorPurgeArtwork(password)
      flash('success', `Deleted ${count} cloud artwork file(s). Storage freed.`)
    } catch (err) {
      flash('error', err.message)
    }
    setBusy(false)
  }

  function handleLogout() {
    setUnlocked(false)
    setPassword('')
    setGames([])
    setEditingId(null)
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Creator Mode</h3>

      {!unlocked ? (
        <div className="settings-row settings-row--stack">
          <label className="settings-label">
            {configured === false ? 'Set an admin password to enable Creator Mode' : 'Enter the admin password to unlock'}
          </label>
          <div className="settings-row">
            <input
              type="password"
              className="settings-text-input"
              placeholder={configured === false ? 'New admin password' : 'Admin password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
            />
            <button className="settings-import-btn" onClick={handleUnlock} disabled={busy || !password}>
              {busy ? 'Working...' : configured === false ? 'Enable Creator Mode' : 'Unlock'}
            </button>
          </div>
          <p className="settings-hint settings-hint--indented settings-hint--warning">
            Creator Mode lets you rename or delete games from the shared community database. Changes apply to every player.
          </p>
        </div>
      ) : (
        <>
          {configured && (
            <div className="settings-row">
              <span className="settings-value">Creator Mode is ON</span>
              <button className="settings-cancel-btn" onClick={handleSetPassword} disabled={busy}>
                Change Password
              </button>
              <button className="settings-cancel-btn" onClick={handlePurgeArtwork} disabled={busy}>
                Purge Cloud Artwork
              </button>
              <button className="settings-cancel-btn" onClick={handleLogout}>
                Lock
              </button>
            </div>
          )}

          <div className="settings-row">
            <input
              type="text"
              className="settings-text-input"
              placeholder="Search games in the shared database..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadGames() }}
            />
            <button className="settings-import-btn" onClick={loadGames} disabled={loadingGames}>
              {loadingGames ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="creator-game-list">
            {games.length === 0 ? (
              <p className="settings-hint settings-hint--indented">
                {loadingGames ? 'Loading games...' : 'No games in the shared database match this search.'}
              </p>
            ) : (
              games.map((g) => (
                <div key={g.id} className="creator-game-item">
                  {editingId === g.id ? (
                    <input
                      type="text"
                      className="settings-text-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(g.id) }}
                      autoFocus
                    />
                  ) : (
                    <span className="creator-game-title">{g.title}</span>
                  )}
                  <div className="creator-game-actions">
                    {editingId === g.id ? (
                      <>
                        <button className="settings-import-btn" onClick={() => handleRename(g.id)} disabled={busy || !editTitle.trim()}>
                          Save
                        </button>
                        <button className="settings-cancel-btn" onClick={() => { setEditingId(null); setEditTitle('') }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="settings-cancel-btn"
                          onClick={() => { setEditingId(g.id); setEditTitle(g.title) }}
                        >
                          Rename
                        </button>
                        <button className="settings-cancel-btn settings-cancel-btn--danger" onClick={() => handleDelete(g.id, g.title)} disabled={busy}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {msg.text && (
        <p className={`settings-hint settings-hint--indented ${msg.type === 'error' ? 'settings-hint--warning' : 'settings-hint--ok'}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}

function ImportSection({ onImportComplete }) {
  const [phase, setPhase] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handlePickFile() {
    setError('')
    setPhase('loading')
    const res = await window.api.storage.importPreview()
    if (res.canceled) {
      setPhase('idle')
      if (res.error) setError(res.error)
      return
    }
    setPreview(res)
    setPhase('preview')
  }

  async function handleConfirm() {
    if (!preview) return
    const total = (preview.toUpdate?.length || 0) + (preview.toAdd?.length || 0)
    if (total === 0) return
    setPhase('loading')
    const res = await window.api.storage.importConfirm({
      toUpdate: preview.toUpdate || [],
      toAdd: preview.toAdd || []
    })
    setResult(res)
    setPhase('done')
    if (onImportComplete) onImportComplete()
    setTimeout(() => {
      setPhase('idle')
      setPreview(null)
      setResult(null)
    }, 4000)
  }

  function handleCancel() {
    setPhase('idle')
    setPreview(null)
    setError('')
    setResult(null)
  }

  const totalToProcess = preview ? (preview.toUpdate?.length || 0) + (preview.toAdd?.length || 0) : 0

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Import Data</h3>

      {phase === 'idle' && (
        <div className="settings-import-row">
          <p className="settings-import-desc">
            Import games, play stats, and ratings from a JSON backup file.
          </p>
          <button className="settings-import-btn" onClick={handlePickFile}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.25 8.75v2.625a1.31 1.31 0 0 1-1.313 1.313H3.063A1.31 1.31 0 0 1 1.75 11.375V8.75" />
              <path d="M4.125 5.875L7 9l2.875-3.125" />
              <path d="M7 9V1.75" />
            </svg>
            Choose JSON File
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="settings-import-loading">Processing...</div>
      )}

      {phase === 'preview' && preview && (
        <div className="settings-import-preview">
          <div className="settings-import-summary">
            Found <strong>{preview.totalImported}</strong> games in file.
          </div>

          {preview.toUpdate?.length > 0 && (
            <div className="settings-import-summary settings-import-summary--update">
              <strong>{preview.toUpdate.length}</strong> existing game{preview.toUpdate.length !== 1 ? 's' : ''} will be <strong>updated</strong>.
            </div>
          )}

          {preview.toAdd?.length > 0 && (
            <div className="settings-import-summary settings-import-summary--add">
              <strong>{preview.toAdd.length}</strong> new game{preview.toAdd.length !== 1 ? 's' : ''} will be <strong>added</strong> to your library.
            </div>
          )}

          {preview.toUpdate?.length > 0 && (
            <div className="settings-import-list">
              {preview.toUpdate.map((m) => (
                <div key={m.existingId || m.title} className="settings-import-item settings-import-item--update">
                  <span className="settings-import-item-title">{m.title}</span>
                  <span className="settings-import-item-detail">
                    {m.playtime > 0 && <span>{Math.floor(m.playtime / 3600)}h {Math.floor((m.playtime % 3600) / 60)}m</span>}
                    {m.averageRating > 0 && <span className="settings-import-item-rating">{m.averageRating.toFixed(1)} ★</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {preview.toAdd?.length > 0 && (
            <div className="settings-import-list">
              {preview.toAdd.map((g) => (
                <div key={g.id || g.title} className="settings-import-item settings-import-item--add">
                  <span className="settings-import-item-title">{g.title || g.name || 'Untitled'}</span>
                  <span className="settings-import-item-detail">
                    {g.genres?.length > 0 && <span>{g.genres[0]}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="settings-import-actions">
            <button className="settings-cancel-btn" onClick={handleCancel}>Cancel</button>
            <button
              className="settings-import-btn"
              onClick={handleConfirm}
              disabled={totalToProcess === 0}
            >
              Import {totalToProcess} Game{totalToProcess !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="settings-import-success">
          {result.updateCount > 0 && <span>Updated {result.updateCount} game{result.updateCount !== 1 ? 's' : ''}</span>}
          {result.updateCount > 0 && result.addCount > 0 && <span>, </span>}
          {result.addCount > 0 && <span>Added {result.addCount} game{result.addCount !== 1 ? 's' : ''}</span>}
          {!result.updateCount && !result.addCount && <span>Import complete.</span>}
        </div>
      )}

      {error && (
        <div className="settings-wallpaper-error">{error}</div>
      )}
    </div>
  )
}

export default SettingsPage
