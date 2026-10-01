import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getRatingColor } from '../utils/ratingColor'
import { extractColors } from '../utils/extractColors'
import {
  UNIVERSAL_CRITERIA,
  GENRE_CRITERIA,
  GENRE_OPTIONS,
  getCriteriaForGenre,
  computeAverage
} from '../utils/ratingCriteria'
import TemplateDropdown from './TemplateDropdown'
import { useSettings } from '../context/SettingsContext'
import LeaderboardWidget from './LeaderboardWidget'
import { syncGameToCloud } from '../lib/syncToCloud'
import { deleteGameFromCloud } from '../lib/librarySync'
import { supabase } from '../lib/supabase'
import { resolveCatalogId } from '../lib/gameCatalog'

const SNAP_THRESHOLD = 14
const DEFAULT_LEFT_PX = 36.8
const DEFAULT_BOTTOM_PX = 160
const HISTORICAL_YEARS = Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => 2020 + i)

function normalizeHist(h) {
  const out = {}
  const keys = Object.keys(h || {}).sort()
  for (const k of keys) {
    const v = h[k]
    if (v != null) out[k] = typeof v === 'number' ? v : Number(v)
  }
  return out
}

function ts(v) {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function buildCloudPayload(game) {
  return {
    total_hours: game.playtime || 0,
    is_platinum: game.isPlatinum || false,
    average_rating: typeof game.averageRating === 'number' ? game.averageRating : null,
    historical_playtime: normalizeHist(game.historicalPlaytime),
    first_played: ts(game.firstPlayed),
    last_played: ts(game.lastPlayed),
    date_finished: ts(game.dateFinished),
  }
}

function payloadSignature(p) {
  const avg = p.average_rating == null ? null : Number(p.average_rating)
  return JSON.stringify([
    p.total_hours || 0,
    !!p.is_platinum,
    avg,
    JSON.stringify(normalizeHist(p.historical_playtime)),
    p.first_played ? ts(p.first_played) : null,
    p.last_played ? ts(p.last_played) : null,
    p.date_finished ? ts(p.date_finished) : null,
  ])
}

function safeFormatDateTime(dateString) {
  if (!dateString || dateString === 'Invalid Date') return ''
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16)
}

function safeFormatDate(dateString) {
  if (!dateString || dateString === 'Invalid Date') return ''
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function RatingSlider({ label, value, onChange, accent }) {
  const percentage = (value / 10) * 100
  const color = getRatingColor(value)

  return (
    <div className="rating-slider-row">
      <label className="rating-slider-label">{label}</label>
      <div className="rating-slider-track-wrap">
        <input
          type="range"
          className="rating-slider-input"
          min="0"
          max="10"
          step="0.1"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #2a2a2e ${percentage}%, #2a2a2e 100%)`
          }}
        />
      </div>
      <span className="rating-slider-value">{value.toFixed(1)}</span>
    </div>
  )
}

function GameDetail({ game, onBack, onRefresh, onLaunchGame, onStopGame, onLinkExe, isRunning, onSyncSteam, steamSyncing }) {
  const { settings } = useSettings()
  const [bannerUrl, setBannerUrl] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [ratings, setRatings] = useState({})
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [ratingSaving, setRatingSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editPath, setEditPath] = useState('')
  const [editLaunchType, setEditLaunchType] = useState('executable')
  const [editLaunchTarget, setEditLaunchTarget] = useState('')
  const [editEmulatorPath, setEditEmulatorPath] = useState('')
  const [editRomPath, setEditRomPath] = useState('')
  const [editConsole, setEditConsole] = useState('')
  const [editSaveDataPath, setEditSaveDataPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [sessionNotes, setSessionNotes] = useState('')
  const [coOpGroup, setCoOpGroup] = useState('')
  const [progressionSaving, setProgressionSaving] = useState(false)
  const [screenshots, setScreenshots] = useState([])
  const [lightboxScreenshot, setLightboxScreenshot] = useState(null)
  const [steamAchievements, setSteamAchievements] = useState(null)
  const [steamAchievLoading, setSteamAchievLoading] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [pageColors, setPageColors] = useState({
    primary: [30, 30, 40],
    secondary: [20, 20, 25],
    vibrant: [100, 100, 110]
  })

  const [artworkEditing, setArtworkEditing] = useState(false)
  const [logoOffsetX, setLogoOffsetX] = useState(0)
  const [logoOffsetY, setLogoOffsetY] = useState(0)
  const [logoScale, setLogoScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [snapX, setSnapX] = useState(false)
  const [snapY, setSnapY] = useState(false)
  const [previewBannerUrl, setPreviewBannerUrl] = useState(null)
  const [previewCoverUrl, setPreviewCoverUrl] = useState(null)
  const [previewLogoUrl, setPreviewLogoUrl] = useState(null)
  const [pendingBannerPath, setPendingBannerPath] = useState(null)
  const [pendingCoverPath, setPendingCoverPath] = useState(null)
  const [pendingLogoPath, setPendingLogoPath] = useState(null)
  const [editIsPlatinum, setEditIsPlatinum] = useState(false)
  const [editPlaytime, setEditPlaytime] = useState('')
  const [editSessions, setEditSessions] = useState('')
  const [editLastPlayed, setEditLastPlayed] = useState('')
  const [editFirstPlayed, setEditFirstPlayed] = useState('')
  const [editHistorical, setEditHistorical] = useState({})
  const [editDateFinished, setEditDateFinished] = useState('')
  const [savingArtwork, setSavingArtwork] = useState(false)
  const [syncState, setSyncState] = useState('idle')
  const [cloudStatus, setCloudStatus] = useState('checking')
  const [cloudDismissed, setCloudDismissed] = useState(false)

  const cloudCheckRef = useRef(0)

  const scrollRef = useRef(null)
  const ratingRef = useRef(null)
  const settingsRef = useRef(null)
  const heroRef = useRef(null)
  const logoRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startBottom: 0, logoW: 0, logoH: 0, heroW: 0, heroH: 0 })

  const [accentReady, setAccentReady] = useState(false)

  const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`

  useEffect(() => {
    setSettingsOpen(false)
    setRatingOpen(false)
    setFetchResult(null)
    setScrollY(0)
    setArtworkEditing(false)
    setPreviewBannerUrl(null)
    setPreviewCoverUrl(null)
    setPreviewLogoUrl(null)
    setPendingBannerPath(null)
    setPendingCoverPath(null)
    setPendingLogoPath(null)
    setSnapX(false)
    setSnapY(false)
    if (scrollRef.current) scrollRef.current.scrollTop = 0

    if (game) {
      const existing = game.ratings || {}
      setRatings(existing)
      setSelectedTemplate(existing.selectedTemplate || '')
      const prog = game.progression || {}
      setSessionNotes(prog.sessionNotes || '')
      setCoOpGroup(prog.coOpGroup || '')
      setLogoOffsetX(game.logoOffsetX || 0)
      setLogoOffsetY(game.logoOffsetY || 0)
      setLogoScale(game.logoScale || 1)
    } else {
      setRatings({})
      setSelectedTemplate('')
      setSessionNotes('')
      setCoOpGroup('')
      setLogoOffsetX(0)
      setLogoOffsetY(0)
      setLogoScale(1)
    }
    setSaveMessage('')
  }, [game])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      setScrollY(el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!bannerUrl) {
      setAccentReady(false)
      return
    }
    extractColors(bannerUrl).then((colors) => {
      setPageColors(colors)
      setAccentReady(true)
    })
  }, [bannerUrl])

  useEffect(() => {
    if (!accentReady) return
    const root = document.documentElement
    root.style.setProperty('--page-accent', rgb(pageColors.vibrant))
    root.style.setProperty('--page-accent-rgb', `${pageColors.vibrant.join(', ')}`)
    root.style.setProperty('--page-primary', rgb(pageColors.primary))
    root.style.setProperty('--page-primary-rgb', `${pageColors.primary.join(', ')}`)
    root.style.setProperty('--page-secondary', rgb(pageColors.secondary))
    root.style.setProperty('--page-secondary-rgb', `${pageColors.secondary.join(', ')}`)
    return () => {
      root.style.removeProperty('--page-accent')
      root.style.removeProperty('--page-accent-rgb')
      root.style.removeProperty('--page-primary')
      root.style.removeProperty('--page-primary-rgb')
      root.style.removeProperty('--page-secondary')
      root.style.removeProperty('--page-secondary-rgb')
    }
  }, [accentReady, pageColors])

  useEffect(() => {
    if (!artworkEditing || !isDragging) return

    function onMouseMove(e) {
      const d = dragRef.current
      if (!d.active) return

      const deltaX = e.clientX - d.startX
      const deltaY = e.clientY - d.startY

      let newLeft = d.startLeft + deltaX
      let newBottom = d.startBottom - deltaY

      const clampedLeft = Math.max(0, Math.min(d.heroW - d.logoW, newLeft))
      const clampedBottom = Math.max(0, Math.min(d.heroH - d.logoH, newBottom))

      const logoCenterX = clampedLeft + d.logoW / 2
      const heroCenterX = d.heroW / 2
      const logoCenterY = clampedBottom + d.logoH / 2
      const heroCenterY = d.heroH / 2

      let snappedX = false
      let snappedY = false

      if (Math.abs(logoCenterX - heroCenterX) < SNAP_THRESHOLD) {
        newLeft = heroCenterX - d.logoW / 2
        snappedX = true
      }

      if (Math.abs(logoCenterY - heroCenterY) < SNAP_THRESHOLD) {
        newBottom = heroCenterY - d.logoH / 2
        snappedY = true
      }

      setLogoOffsetX(newLeft - DEFAULT_LEFT_PX)
      setLogoOffsetY(newBottom - DEFAULT_BOTTOM_PX)
      setSnapX(snappedX)
      setSnapY(snappedY)
    }

    function onMouseUp() {
      dragRef.current.active = false
      setIsDragging(false)
      setSnapX(false)
      setSnapY(false)
      document.body.style.cursor = ''
      document.body.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [artworkEditing, isDragging])

  useEffect(() => {
    if (!game) {
      setScreenshots([])
      return
    }
    window.api.screenshot.getList(game.title).then(setScreenshots)
  }, [game])

  useEffect(() => {
    if (!game) return
    const cleanup = window.api.screenshot.onCaptured((data) => {
      if (data.gameTitle === game.title) {
        window.api.screenshot.getList(game.title).then(setScreenshots)
      }
    })
    return cleanup
  }, [game])

  useEffect(() => {
    if (!game || !game.steamAppId) {
      setSteamAchievements(null)
      return
    }
    setSteamAchievLoading(true)
    window.api.steam.getAchievements(game.steamAppId)
      .then((result) => {
        if (result.success) {
          setSteamAchievements(result.achievements)
        } else {
          setSteamAchievements(null)
        }
      })
      .catch(() => setSteamAchievements(null))
      .finally(() => setSteamAchievLoading(false))
  }, [game])

  const average = useMemo(() => {
    return computeAverage(ratings, selectedTemplate)
  }, [ratings, selectedTemplate])

  const loadArtwork = useCallback(async () => {
    // Local files win; otherwise fall back to the shared Cloudflare R2 image
    // so the hero renders for players who never downloaded artwork.
    const bannerFallback = game?.bannerUrl || null
    if (game?.bannerImage) {
      const url = await window.api.artwork.getUrl(game.bannerImage)
      setBannerUrl(url || bannerFallback)
    } else {
      setBannerUrl(bannerFallback)
    }

    const logoFallback = game?.logoUrl || null
    if (game?.logoImage) {
      const url = await window.api.artwork.getUrl(game.logoImage)
      setLogoUrl(url || logoFallback)
    } else {
      setLogoUrl(logoFallback)
    }
  }, [game])

  useEffect(() => { loadArtwork() }, [loadArtwork])

  const runCloudCheck = useCallback(async (g, seq) => {
    const current = seq ?? ++cloudCheckRef.current
    try {
      const { data } = await supabase.auth.getSession()
      const session = data?.session ?? null
      if (!session) {
        if (cloudCheckRef.current === current) setCloudStatus('error')
        return
      }
      const gameId = await resolveCatalogId(g)
      const { data: row } = await supabase
        .from('user_games')
        .select('total_hours, is_platinum, average_rating, historical_playtime, first_played, last_played, date_finished')
        .eq('user_id', session.user.id)
        .eq('game_id', gameId)
        .maybeSingle()
      if (cloudCheckRef.current !== current) return
      if (!row) {
        setCloudStatus('missing')
        return
      }
      const localSig = payloadSignature(buildCloudPayload(g))
      const cloudSig = payloadSignature(row)
      setCloudStatus(cloudSig === localSig ? 'synced' : 'unsynced')
    } catch {
      if (cloudCheckRef.current === current) setCloudStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!game) return
    const seq = ++cloudCheckRef.current
    setCloudStatus('checking')
    setCloudDismissed(false)
    runCloudCheck(game, seq)
  }, [game, runCloudCheck])

  function toggleRating() {
    const next = !ratingOpen
    setRatingOpen(next)
    if (next) {
      setTimeout(() => {
        ratingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  function populateEditFields() {
    setEditTitle(game.title)
    setEditPath(game.exePath || '')
    setEditLaunchType(game.launchType || 'executable')
    setEditLaunchTarget(game.launchTarget || game.exePath || '')
    setEditEmulatorPath(game.emulatorPath || '')
    setEditRomPath(game.romPath || '')
    setEditConsole(game.console || '')
    setEditSaveDataPath(game.saveDataPath || '')
    setEditIsPlatinum(game.isPlatinum || false)
    setEditPlaytime(game.playtime != null ? String(Math.round((game.playtime / 3600) * 10) / 10) : '')
    setEditSessions(game.sessions != null ? String(game.sessions) : '')
    setEditLastPlayed(safeFormatDateTime(game.lastPlayed))
    setEditFirstPlayed(safeFormatDateTime(game.firstPlayed))
    setEditDateFinished(safeFormatDate(game.dateFinished))
    setEditHistorical(() => {
      const raw = game.historicalPlaytime || {}
      const converted = {}
      for (const [yr, sec] of Object.entries(raw)) {
        converted[yr] = typeof sec === 'number' ? String(Math.round((sec / 3600) * 10) / 10) : ''
      }
      return converted
    })
    setFetchResult(null)
  }

  function handleSettingsToggle() {
    const next = !settingsOpen
    if (next) {
      try {
        populateEditFields()
      } catch (err) {
        console.error('Failed to open edit modal:', err)
      }
    }
    setSettingsOpen(next)
    if (next) {
      setTimeout(() => {
        settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  async function saveEdits() {
    if (!editTitle.trim()) return
    setSaving(true)
    const updates = {
      title: editTitle.trim(),
      launchType: editLaunchType,
      launchTarget: editLaunchType === 'emulated' ? '' : editLaunchTarget,
      emulatorPath: editEmulatorPath.trim(),
      romPath: editRomPath.trim(),
      console: editConsole,
      saveDataPath: editSaveDataPath.trim(),
      isPlatinum: editIsPlatinum,
      dateFinished: safeFormatDate(editDateFinished)
    }
    if (editPlaytime !== '') {
      const hours = parseFloat(editPlaytime)
      if (!isNaN(hours)) updates.playtime = Math.round(hours * 3600)
    }
    if (settings.isDevModeEnabled) {
      if (editSessions !== '') {
        const s = parseInt(editSessions, 10)
        if (!isNaN(s)) updates.sessions = s
      }
      if (editLastPlayed) {
        const d = new Date(editLastPlayed)
        if (!isNaN(d.getTime())) updates.lastPlayed = d.toISOString()
      }
      if (editFirstPlayed) {
        const d = new Date(editFirstPlayed)
        if (!isNaN(d.getTime())) updates.firstPlayed = d.toISOString()
      }
      const cleanHistorical = {}
      for (const [yr, val] of Object.entries(editHistorical)) {
        const num = parseFloat(val)
        if (!isNaN(num) && num >= 0) cleanHistorical[yr] = Math.round(num * 3600)
      }
      if (Object.keys(cleanHistorical).length > 0) updates.historicalPlaytime = cleanHistorical
    }
    if (editLaunchType === 'executable') {
      updates.exePath = editLaunchTarget
    }
    await window.api.storage.updateGame(game.id, updates)
    setSaving(false)
    setSettingsOpen(false)
    if (onRefresh) onRefresh()
  }

  async function handleSyncToCloud() {
    if (!game || syncState === 'syncing') return
    setSyncState('syncing')
    try {
      await syncGameToCloud(game)
      setSyncState('synced')
      const seq = ++cloudCheckRef.current
      setCloudStatus('checking')
      runCloudCheck(game, seq)
    } catch {
      setSyncState('error')
      setCloudStatus('error')
    }
    setTimeout(() => setSyncState('idle'), 2500)
  }

  async function browseExe() {
    const result = await window.api.settings.selectGameFile()
    if (!result.canceled && result.path) {
      setEditLaunchTarget(result.path)
      setEditPath(result.path)
    }
  }

  async function handleFetchMetadata() {
    if (!game || fetching) return
    setFetching(true)
    setFetchResult(null)
    const result = await window.api.metadata.fetchGameMetadata(game.id, game.title)
    setFetchResult(result)
    setFetching(false)
    await loadArtwork()
    if (onRefresh) onRefresh()
  }

  async function handleDeleteGame() {
    if (!game) return
    const confirmed = window.confirm(`Delete "${game.title}" from your library?`)
    if (!confirmed) return
    setDeleting(true)
    await window.api.storage.deleteGame(game.id)
    deleteGameFromCloud(game.id)
    setDeleting(false)
    setSettingsOpen(false)
    if (onRefresh) onRefresh()
    onBack()
  }

  function handleSliderChange(key, value) {
    setRatings((prev) => ({ ...prev, [key]: value }))
  }

  function handleTemplateChange(genre) {
    const prevGenre = selectedTemplate
    const prevKeys = getCriteriaForGenre(prevGenre).map((c) => c.key)
    const newKeys = getCriteriaForGenre(genre).map((c) => c.key)
    setRatings((r) => {
      const next = { ...r }
      prevKeys.forEach((k) => {
        if (!newKeys.includes(k)) delete next[k]
      })
      return next
    })
    setSelectedTemplate(genre)
  }

  async function handleSaveRatings() {
    if (!game) return
    setRatingSaving(true)
    const activeKeys = getCriteriaForGenre(selectedTemplate).map((c) => c.key)
    const cleanRatings = { selectedTemplate }
    activeKeys.forEach((k) => {
      if (ratings[k] !== undefined) cleanRatings[k] = ratings[k]
    })
    await window.api.storage.saveRatings(game.id, cleanRatings)
    setRatingSaving(false)
    setSaveMessage('Ratings saved')
    if (onRefresh) onRefresh()
    setTimeout(() => setSaveMessage(''), 2000)
  }

  async function handleClearRatings() {
    if (!game) return
    setRatingSaving(true)
    setRatings({})
    setSelectedTemplate('')
    await window.api.storage.saveRatings(game.id, {})
    setRatingSaving(false)
    setSaveMessage('Ratings cleared')
    if (onRefresh) onRefresh()
    setTimeout(() => setSaveMessage(''), 2000)
  }

  async function handleSaveProgression() {
    if (!game) return
    setProgressionSaving(true)
    await window.api.storage.updateGame(game.id, {
      progression: { sessionNotes, coOpGroup }
    })
    setProgressionSaving(false)
    if (onRefresh) onRefresh()
  }

  async function handleDeleteScreenshot(url) {
    const screenshot = screenshots.find((s) => s.url === url)
    if (!screenshot) return
    await window.api.screenshot.delete(screenshot.path)
    setScreenshots((prev) => prev.filter((s) => s.url !== url))
    if (lightboxScreenshot?.url === url) setLightboxScreenshot(null)
  }

  function handleOpenScreenshotFolder() {
    if (!game) return
    window.api.screenshot.openFolder(game.title)
  }

  function enterArtworkEdit() {
    setLogoOffsetX(game?.logoOffsetX || 0)
    setLogoOffsetY(game?.logoOffsetY || 0)
    setLogoScale(game?.logoScale || 1)
    setPreviewBannerUrl(null)
    setPreviewCoverUrl(null)
    setPreviewLogoUrl(null)
    setPendingBannerPath(null)
    setPendingCoverPath(null)
    setPendingLogoPath(null)
    setArtworkEditing(true)
  }

  function cancelArtworkEdit() {
    setArtworkEditing(false)
    setLogoOffsetX(game?.logoOffsetX || 0)
    setLogoOffsetY(game?.logoOffsetY || 0)
    setLogoScale(game?.logoScale || 1)
    setPreviewBannerUrl(null)
    setPreviewCoverUrl(null)
    setPreviewLogoUrl(null)
    setPendingBannerPath(null)
    setPendingCoverPath(null)
    setPendingLogoPath(null)
    setSnapX(false)
    setSnapY(false)
  }

  function handleLogoMouseDown(e) {
    if (!artworkEditing) return
    e.preventDefault()
    e.stopPropagation()

    const heroRect = heroRef.current?.getBoundingClientRect()
    const logoRect = logoRef.current?.getBoundingClientRect()
    if (!heroRect || !logoRect) return

    const currentLeft = logoOffsetX + DEFAULT_LEFT_PX
    const currentBottom = logoOffsetY + DEFAULT_BOTTOM_PX

    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: currentLeft,
      startBottom: currentBottom,
      logoW: logoRect.width,
      logoH: logoRect.height,
      heroW: heroRect.width,
      heroH: heroRect.height
    }

    setIsDragging(true)
    document.body.style.cursor = 'grabbing'
    document.body.userSelect = 'none'
  }

  async function handleReplaceBanner() {
    if (!game) return
    const result = await window.api.artwork.selectLocalImage(game.id, 'banner')
    if (result.canceled || !result.path) return
    setPendingBannerPath(result.path)
    const url = await window.api.artwork.getUrl(result.path)
    setPreviewBannerUrl(url)
  }

  async function handleReplaceCover() {
    if (!game) return
    const result = await window.api.artwork.selectLocalImage(game.id, 'cover')
    if (result.canceled || !result.path) return
    setPendingCoverPath(result.path)
    const url = await window.api.artwork.getUrl(result.path)
    setPreviewCoverUrl(url)
  }

  async function handleReplaceLogo() {
    if (!game) return
    const result = await window.api.artwork.selectLocalImage(game.id, 'logo')
    if (result.canceled || !result.path) return
    setPendingLogoPath(result.path)
    const url = await window.api.artwork.getUrl(result.path)
    setPreviewLogoUrl(url)
  }

  async function handleSaveArtwork() {
    if (!game) return
    setSavingArtwork(true)
    const updates = {
      logoOffsetX,
      logoOffsetY,
      logoScale
    }
    if (pendingBannerPath) updates.bannerImage = pendingBannerPath
    if (pendingCoverPath) updates.coverImage = pendingCoverPath
    if (pendingLogoPath) updates.logoImage = pendingLogoPath
    await window.api.storage.updateGame(game.id, updates)
    setSavingArtwork(false)
    setArtworkEditing(false)
    setPendingBannerPath(null)
    setPendingCoverPath(null)
    setPendingLogoPath(null)
    setPreviewBannerUrl(null)
    setPreviewCoverUrl(null)
    setPreviewLogoUrl(null)
    if (onRefresh) onRefresh()
  }

  if (!game) {
    return (
      <div className="detail-empty">
        <p>Select a game to view details.</p>
      </div>
    )
  }

  const ratingColor = getRatingColor(average)
  const parallaxOffset = artworkEditing ? 0 : scrollY * 0.35
  const heroH = heroRef.current?.offsetHeight || 544
  const bannerFadeEnd = Math.min(91.4, Math.max(6, ((heroH * 1.05 - parallaxOffset) / (heroH * 1.15)) * 100))
  const bannerFadeStart = Math.max(0, bannerFadeEnd - 40)
  const accent = pageColors.vibrant
  const pagePrimary = pageColors.primary



  const currentLeft = logoOffsetX + DEFAULT_LEFT_PX
  const currentBottom = logoOffsetY + DEFAULT_BOTTOM_PX

  const displayBannerUrl = previewBannerUrl || bannerUrl
  const displayLogoUrl = previewLogoUrl || logoUrl

  return (
    <div
      className={`game-detail ${accentReady ? 'accent-ready' : ''}`}
      style={{
        '--page-accent': rgb(accent),
        '--page-accent-rgb': `${accent.join(', ')}`,
        '--page-primary': rgb(pagePrimary),
        '--page-primary-rgb': `${pagePrimary.join(', ')}`,
        '--banner-fade-start': `${bannerFadeStart}%`,
        '--banner-fade-end': `${bannerFadeEnd}%`,
      }}
    >
      <div className="detail-scroll" ref={scrollRef}>
        <button className="detail-back-btn detail-back-float" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span>Back</span>
        </button>

        <button
          className={`detail-fetch-float ${fetching ? 'fetching' : ''}`}
          onClick={handleFetchMetadata}
          disabled={fetching}
          title={fetching ? 'Fetching metadata...' : 'Fetch artwork & info'}
        >
          {fetching ? (
            <span className="detail-fetch-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>

        <div className={`detail-hero ${artworkEditing ? 'detail-hero--editing' : ''}`} ref={heroRef}>
          {artworkEditing && (
            <>
              <div className={`snap-guide-v ${snapX ? 'visible' : ''}`} />
              <div className={`snap-guide-h ${snapY ? 'visible' : ''}`} />
            </>
          )}

          {displayBannerUrl ? (
            <div
              className="detail-hero-banner"
              style={{ transform: `translate3d(0, ${parallaxOffset}px, 0)` }}
            >
              <img src={displayBannerUrl} alt="" draggable={false} />
            </div>
          ) : (
            <div className="detail-hero-banner detail-hero-fallback" />
          )}

          <div className="detail-hero-overlay" />
          <div className="detail-hero-fade" />

          {displayLogoUrl ? (
            <div
              ref={logoRef}
              className={`detail-hero-logo ${artworkEditing ? 'detail-hero-logo--editable' : ''} ${isDragging ? 'detail-hero-logo--dragging' : ''}`}
              style={{
                left: `${currentLeft}px`,
                bottom: `${currentBottom}px`,
                transform: `translate3d(0, ${artworkEditing ? 0 : parallaxOffset * 0.6}px, 0) scale(${logoScale})`,
                width: 'min(22rem, 40vw)',
                maxWidth: 'none',
                transformOrigin: 'left bottom'
              }}
              onMouseDown={handleLogoMouseDown}
            >
              <img src={displayLogoUrl} alt="" draggable={false} />
              {artworkEditing && <div className="detail-hero-logo-handle" />}
            </div>
          ) : (
            <div
              className="detail-hero-title-overlay"
              style={{ transform: `translate3d(0, ${parallaxOffset * 0.5}px, 0)` }}
            >
              <h1>{game.title}</h1>
            </div>
          )}

          {artworkEditing && !displayLogoUrl && (
            <div className="artwork-edit-no-logo-hint">
              No logo available. Fetch metadata first or replace banner/cover.
            </div>
          )}
        </div>

        {artworkEditing && (
          <div className="artwork-edit-panel">
            <div className="artwork-edit-panel-tabs">
              <span className="artwork-edit-tab active">Edit Artwork</span>
              <button className="artwork-edit-tab-btn" onClick={handleReplaceBanner}>
                &#8613; Banner
              </button>
              <button className="artwork-edit-tab-btn" onClick={handleReplaceCover}>
                &#8613; Cover
              </button>
              <button className="artwork-edit-tab-btn" onClick={handleReplaceLogo}>
                &#9998; Change Logo
              </button>
              {previewCoverUrl && (
                <div className="artwork-edit-cover-preview">
                  <img src={previewCoverUrl} alt="" />
                </div>
              )}
            </div>
            <div className="artwork-edit-panel-controls">
              <div className="artwork-edit-scale-group">
                <label className="artwork-edit-scale-label">Logo Scale</label>
                <input
                  type="range"
                  className="artwork-edit-scale-slider"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={logoScale}
                  onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                />
                <span className="artwork-edit-scale-value">{Math.round(logoScale * 100)}%</span>
              </div>
              <div className="artwork-edit-panel-actions">
                <button
                  className="artwork-edit-cancel-btn"
                  onClick={cancelArtworkEdit}
                >
                  Cancel
                </button>
                <button
                  className="artwork-edit-save-btn"
                  onClick={handleSaveArtwork}
                  disabled={savingArtwork}
                >
                  {savingArtwork ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="detail-glass">
          <div className="detail-glass-content">
            <div className="detail-header">
              <div className="detail-info">
                <h1 className="detail-title">{game.title}</h1>

                {game.exePath || game.launchTarget ? (
                  isRunning ? (
                    <button
                      className="detail-play-btn running"
                      onClick={() => onStopGame(game.id)}
                    >
                      &#9632; Stop
                    </button>
                  ) : (
                    <button
                      className="detail-play-btn"
                      onClick={() => onLaunchGame(game.id)}
                    >
                      &#9654; Play
                    </button>
                  )
                ) : (
                  <button
                    className="detail-install-btn"
                    onClick={() => onLinkExe(game)}
                  >
                    &#8615; Install
                  </button>
                )}

                <div className="detail-genres">
                  {game.genres?.length > 0 && (
                    <>
                      {game.genres.map((genre) => (
                        <span key={genre} className="detail-genre-tag">{genre}</span>
                      ))}
                    </>
                  )}
                </div>
                {game.platforms?.length > 0 && (
                  <div className="detail-platforms">
                    {game.platforms.map((p) => (
                      <span key={p} className="detail-platform-tag">{p}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="detail-actions">
                {average > 0 && (
                  <div className="detail-rating-ring" style={{ '--ring-color': ratingColor }}>
                    <svg viewBox="0 0 36 36">
                      <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={ratingColor} />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
                        </linearGradient>
                      </defs>
                      <circle className="detail-ring-bg" cx="18" cy="18" r="15.5" />
                      <circle
                        className="detail-ring-fg"
                        cx="18"
                        cy="18"
                        r="15.5"
                        stroke="url(#ringGrad)"
                        style={{ strokeDasharray: `${(average / 10) * 97.39} 97.39` }}
                      />
                    </svg>
                    <span className="detail-rating-num">
                      {average.toFixed(1)}
                      <em className="detail-rating-denom">/10</em>
                    </span>
                  </div>
                )}
                <div className="detail-actions-buttons">
                  {!artworkEditing && (
                    <>
                      <button className="detail-rate-btn" onClick={toggleRating}>
                        &#9733;
                      </button>
                      <button
                        className={`detail-cloud-btn ${syncState === 'synced' ? 'synced' : ''} ${syncState === 'error' ? 'error' : ''}`}
                        onClick={handleSyncToCloud}
                        disabled={syncState === 'syncing'}
                        title={
                          syncState === 'syncing'
                            ? 'Syncing to cloud...'
                            : syncState === 'synced'
                              ? 'Synced to cloud'
                              : syncState === 'error'
                                ? 'Sync failed'
                                : 'Upload to cloud'
                        }
                      >
                        {syncState === 'synced' ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                            <path d="M12 12v9" />
                            <path d="m16 16-4-4-4 4" />
                          </svg>
                        )}
                      </button>
                      <button className="detail-settings-btn" onClick={handleSettingsToggle}>
                        &#9881;
                      </button>
                    </>
                  )}
                  {!artworkEditing ? (
                    <button
                      className="detail-artwork-edit-btn"
                      onClick={enterArtworkEdit}
                      title="Edit Artwork"
                    >
                      &#9998;
                    </button>
                  ) : (
                    <button
                      className="detail-artwork-edit-btn active"
                      onClick={cancelArtworkEdit}
                      title="Exit Edit Artwork"
                    >
                      &#10005;
                    </button>
                  )}
                  <button
                    className="detail-cloud-btn steam"
                    onClick={onSyncSteam}
                    disabled={steamSyncing || !settings.steamApiKey || !settings.steamId}
                    title={
                      !settings.steamApiKey || !settings.steamId
                        ? 'Set Steam API Key and Steam ID in Settings first'
                        : steamSyncing
                          ? 'Syncing Steam library...'
                          : 'Sync playtime from your Steam library'
                    }
                  >
                    {steamSyncing ? (
                      <span className="inline-block w-4 h-4 border-2 border-[#66c0f4] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="detail-stats-bar">
              <div className="detail-stats-bar-inner">
                {game.isPlatinum && (
                  <div className="detail-platinum-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                    100% Completed
                  </div>
                )}
                {(() => {
                  const safeDate = safeFormatDateTime(game.lastPlayed)
                  return safeDate ? (
                    <div className="detail-stats-bar-item">
                      <span className="detail-stats-bar-ico">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </span>
                      <span className="detail-stats-bar-label">Last Played</span>
                      <span className="detail-stats-bar-value">
                        {new Date(safeDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  ) : null
                })()}
                {game.playtime > 0 && (
                  <div className="detail-stats-bar-item">
                    <span className="detail-stats-bar-ico">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                    <span className="detail-stats-bar-label">Play Time</span>
                    <span className="detail-stats-bar-value">
                      {Math.floor(game.playtime / 3600)}h {Math.floor((game.playtime % 3600) / 60)}m
                    </span>
                  </div>
                )}
                {game.sessions > 0 && (
                  <div className="detail-stats-bar-item">
                    <span className="detail-stats-bar-ico">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                    </span>
                    <span className="detail-stats-bar-label">Sessions</span>
                    <span className="detail-stats-bar-value">{game.sessions}</span>
                  </div>
                )}
                {game.exePath || game.launchTarget ? (
                  <div className="detail-stats-bar-item">
                    <span className="detail-stats-bar-ico">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </span>
                    <span className="detail-stats-bar-label">Status</span>
                    <span className="detail-stats-bar-value detail-stats-bar-ready">Ready</span>
                  </div>
                ) : (
                  <div className="detail-stats-bar-item">
                    <span className="detail-stats-bar-ico">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8v4l2 2" />
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    </span>
                    <span className="detail-stats-bar-label">Status</span>
                    <span className="detail-stats-bar-value detail-stats-bar-unready">Not Installed</span>
                  </div>
                )}
              </div>
            </div>

            {!cloudDismissed && (cloudStatus === 'missing' || cloudStatus === 'unsynced' || cloudStatus === 'error') && (
              <div className={`detail-cloud-banner ${cloudStatus}`}>
                <div className="detail-cloud-banner-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                    <path d="M12 12v9" />
                    <path d="m16 16-4-4-4 4" />
                  </svg>
                </div>
                <div className="detail-cloud-banner-text">
                  {cloudStatus === 'missing' && (
                    <span className="detail-cloud-banner-title">Not on the cloud yet</span>
                  )}
                  {cloudStatus === 'unsynced' && (
                    <span className="detail-cloud-banner-title">Changes not synced to the cloud</span>
                  )}
                  {cloudStatus === 'error' && (
                    <span className="detail-cloud-banner-title">Couldn&rsquo;t check cloud status</span>
                  )}
                  <span className="detail-cloud-banner-sub">
                    {cloudStatus === 'missing'
                      ? 'This game hasn\u2019t been uploaded to the community. Sync it so your stats, rating and progress appear on your profile.'
                      : cloudStatus === 'unsynced'
                        ? 'Your latest local changes haven\u2019t been uploaded. Sync to keep your community stats up to date.'
                        : 'We couldn\u2019t reach the cloud right now. Try syncing again.'}
                  </span>
                </div>
                <button
                  className="detail-cloud-banner-sync"
                  onClick={handleSyncToCloud}
                  disabled={syncState === 'syncing'}
                >
                  {syncState === 'syncing' ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  className="detail-cloud-banner-close"
                  onClick={() => setCloudDismissed(true)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            <div className="detail-facts-card">
              <h3 className="detail-section-title">Game Facts</h3>
              <div className="detail-facts-list">
                {game.developer && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Developer</span>
                    <span className="detail-fact-value">{game.developer}</span>
                  </div>
                )}
                {game.publisher && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Publisher</span>
                    <span className="detail-fact-value">{game.publisher}</span>
                  </div>
                )}
                {game.releaseDate && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Released</span>
                    <span className="detail-fact-value">{game.releaseDate}</span>
                  </div>
                )}
                {game.launchType && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Storefront</span>
                    <span className="detail-fact-value">
                      {game.launchType === 'executable' ? 'Executable' : game.launchType === 'emulated' ? `Emulator${game.console ? ` · ${game.console}` : ''}` : game.launchType === 'steam' ? 'Steam' : game.launchType === 'epic' ? 'Epic Games' : game.launchType}
                    </span>
                  </div>
                )}
                {game.steamAppId && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Steam App ID</span>
                    <span className="detail-fact-value">{game.steamAppId}</span>
                  </div>
                )}
                {game.dateFinished && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Date Finished</span>
                    <span className="detail-fact-value">
                      {new Date(game.dateFinished).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                )}
                {game.saveDataPath && (
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Save Data</span>
                    <span className="detail-fact-value detail-fact-value--path" title={game.saveDataPath}>{game.saveDataPath}</span>
                  </div>
                )}
                {game.genres?.length > 0 && (
                  <div className="detail-fact-row detail-fact-row--block">
                    <span className="detail-fact-label">Genres</span>
                    <span className="detail-fact-value detail-fact-tags">
                      {game.genres.map((g) => <span key={g} className="detail-fact-tag">{g}</span>)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <LeaderboardWidget title={game.title} />

            <div className="detail-body">
              <div className="detail-main">

            {settingsOpen && (
              <div className="detail-settings-panel" ref={settingsRef}>
                <div className="detail-settings-header">
                  <h3 className="detail-section-title">Game Settings</h3>
                  <button className="detail-settings-close" onClick={() => setSettingsOpen(false)}>&#10005;</button>
                </div>

                <div className="detail-settings-group">
                  <h4 className="detail-settings-group-title">Edit Info</h4>
                  <div className="detail-settings-row">
                    <label className="detail-settings-label">Title</label>
                    <input
                      className="detail-settings-input"
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="detail-settings-row">
                    <label className="detail-settings-label">Platform</label>
                    <div className="detail-settings-platform-row">
                      <select
                        className="detail-settings-select"
                        value={editLaunchType}
                        onChange={(e) => {
                          const val = e.target.value
                          setEditLaunchType(val)
                          if (val === 'executable') {
                            setEditLaunchTarget(editPath || '')
                          } else if (val === 'emulated') {
                            setEditLaunchTarget('')
                          } else {
                            setEditLaunchTarget('')
                          }
                        }}
                      >
                        <option value="executable">Executable</option>
                        <option value="steam">Steam</option>
                        <option value="epic">Epic Games</option>
                        <option value="emulated">Emulator</option>
                      </select>
                    </div>
                  </div>
                  {editLaunchType === 'emulated' ? (
                    <>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">Console / System</label>
                        <select
                          className="detail-settings-select"
                          value={editConsole}
                          onChange={(e) => setEditConsole(e.target.value)}
                        >
                          <option value="">Select console...</option>
                          {['PS1','PS2','PS3','PSP','PS Vita','Nintendo 64','GameCube','Wii','Wii U','Switch','NES','SNES','GBA','Game Boy','Game Boy Color','DS','3DS','Genesis','Dreamcast','Saturn','Xbox','Xbox 360','Arcade','Other'].map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">Emulator</label>
                        <div className="detail-settings-path-row">
                          <input
                            className="detail-settings-path"
                            type="text"
                            value={editEmulatorPath}
                            onChange={(e) => setEditEmulatorPath(e.target.value)}
                            placeholder="No emulator linked"
                          />
                          <button className="detail-settings-browse" onClick={async () => {
                            const result = await window.api.settings.selectEmulator()
                            if (!result.canceled && result.path) setEditEmulatorPath(result.path)
                          }}>Browse</button>
                        </div>
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">ROM File</label>
                        <div className="detail-settings-path-row">
                          <input
                            className="detail-settings-path"
                            type="text"
                            value={editRomPath}
                            onChange={(e) => setEditRomPath(e.target.value)}
                            placeholder="No ROM linked"
                          />
                          <button className="detail-settings-browse" onClick={async () => {
                            const result = await window.api.settings.selectRom()
                            if (!result.canceled && result.path) setEditRomPath(result.path)
                          }}>Browse</button>
                        </div>
                      </div>
                    </>
                  ) : editLaunchType === 'executable' ? (
                    <div className="detail-settings-row">
                      <label className="detail-settings-label">Executable</label>
                      <div className="detail-settings-path-row">
                        <input
                          className="detail-settings-path"
                          type="text"
                          value={editLaunchTarget}
                          onChange={(e) => setEditLaunchTarget(e.target.value)}
                          placeholder="No executable linked"
                        />
                        <button className="detail-settings-browse" onClick={browseExe}>Browse</button>
                      </div>
                    </div>
                  ) : (
                    <div className="detail-settings-row">
                      <label className="detail-settings-label">
                        {editLaunchType === 'steam' ? 'Steam App ID' : 'Epic Catalog Namespace'}
                      </label>
                      <input
                        className="detail-settings-input"
                        type="text"
                        value={editLaunchTarget}
                        onChange={(e) => setEditLaunchTarget(e.target.value)}
                        placeholder={
                          editLaunchType === 'steam'
                            ? 'e.g. 730 (Counter-Strike 2)'
                            : 'e.g. Fortnite:DefaultGame'
                        }
                      />
                    </div>
                  )}
                  <div className="detail-settings-row">
                    <label className="detail-settings-label">Save Data Folder</label>
                    <div className="detail-settings-path-row">
                      <input
                        className="detail-settings-path"
                        type="text"
                        value={editSaveDataPath}
                        onChange={(e) => setEditSaveDataPath(e.target.value)}
                        placeholder="Auto-backup folder on game close (supports %APPDATA%, etc.)"
                      />
                      <button className="detail-settings-browse" onClick={async () => {
                        const result = await window.api.settings.selectSaveDataFolder()
                        if (!result.canceled && result.path) setEditSaveDataPath(result.path)
                      }}>Browse</button>
                    </div>
                  </div>
                  <div className="detail-settings-row">
                    <label className="detail-settings-label">Platinum</label>
                    <label className="detail-settings-toggle">
                      <input
                        type="checkbox"
                        checked={editIsPlatinum}
                        onChange={(e) => setEditIsPlatinum(e.target.checked)}
                      />
                      <span className="detail-settings-toggle-slider" />
                      <span className="detail-settings-toggle-label">100% Completed</span>
                    </label>
                  </div>
                  <div className="detail-settings-row">
                    <label className="detail-settings-label">Date Finished</label>
                    <input
                      type="date"
                      className="detail-settings-input"
                      style={{ colorScheme: 'dark' }}
                      value={editDateFinished}
                      onChange={(e) => setEditDateFinished(e.target.value)}
                    />
                  </div>
                  {settings.isDevModeEnabled && (
                    <div className="detail-dev-section">
                      <div className="detail-dev-banner">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Developer Mode &mdash; editing raw database values
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">Total Hours</label>
                        <input
                          className="detail-settings-input"
                          type="number"
                          step="0.1"
                          min="0"
                          value={editPlaytime}
                          onChange={(e) => setEditPlaytime(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">Sessions</label>
                        <input
                          className="detail-settings-input"
                          type="number"
                          step="1"
                          min="0"
                          value={editSessions}
                          onChange={(e) => setEditSessions(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">First Played</label>
                        <input
                          className="detail-settings-input"
                          type="datetime-local"
                          value={editFirstPlayed}
                          onChange={(e) => setEditFirstPlayed(e.target.value)}
                        />
                      </div>
                      <div className="detail-settings-row">
                        <label className="detail-settings-label">Last Played</label>
                        <input
                          className="detail-settings-input"
                          type="datetime-local"
                          value={editLastPlayed}
                          onChange={(e) => setEditLastPlayed(e.target.value)}
                        />
                      </div>
                      <div className="detail-dev-historical">
                        <div className="detail-dev-historical-header">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          Historical Backfill (Manual Data)
                        </div>
                        <p className="detail-dev-historical-hint">
                          Manually enter hours played in previous years to populate your REWIND dashboard.
                        </p>
                        <div className="detail-dev-historical-grid">
                          {HISTORICAL_YEARS.map((yr) => (
                            <div key={yr} className="detail-dev-historical-row">
                              <label className="detail-dev-historical-label">Hours in {yr}</label>
                              <input
                                className="detail-dev-historical-input"
                                type="number"
                                step="0.1"
                                min="0"
                                value={editHistorical[yr] || ''}
                                onChange={(e) => setEditHistorical((prev) => ({ ...prev, [yr]: e.target.value }))}
                                placeholder="0h"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    className="detail-settings-save glow-btn"
                    onClick={saveEdits}
                    disabled={saving || !editTitle.trim()}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                <div className="detail-settings-divider" />

                <div className="detail-settings-group">
                  <h4 className="detail-settings-group-title">Metadata</h4>
                  <button
                    className={`detail-settings-fetch glow-btn ${fetching ? 'fetching' : ''}`}
                    onClick={handleFetchMetadata}
                    disabled={fetching}
                  >
                    {fetching ? (
                      <>
                        <span className="detail-fetch-spinner" />
                        Fetching...
                      </>
                    ) : (
                      'Fetch Artwork & Info'
                    )}
                  </button>
                  {fetchResult && (
                    <div className={`detail-settings-result ${fetchResult.success ? 'success' : 'error'}`}>
                      {fetchResult.success ? (
                        <span>Metadata and artwork fetched successfully</span>
                      ) : (
                        <span>Fetch completed with issues</span>
                      )}
                      {fetchResult.errors?.length > 0 && (
                        <ul className="detail-fetch-errors">
                          {fetchResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div className="detail-settings-divider" />

                <div className="detail-settings-group">
                  <h4 className="detail-settings-group-title">Danger Zone</h4>
                  <button
                    className="detail-settings-delete"
                    onClick={handleDeleteGame}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : 'Delete Game'}
                  </button>
                </div>
              </div>
            )}

            {game.description && (
              <div className="detail-description">
                <h3 className="detail-section-title">About</h3>
                <p className="detail-description-text">{game.description}</p>
              </div>
            )}

            {ratingOpen && (
              <div className="detail-rating-section" ref={ratingRef}>
                <div className="detail-rating-header">
                  <h3 className="detail-section-title">Rating</h3>
                  <TemplateDropdown
                    value={selectedTemplate}
                    options={GENRE_OPTIONS}
                    onChange={handleTemplateChange}
                    placeholder="Select Template..."
                  />
                </div>

                {selectedTemplate ? (
                  <div className="rate-page-sliders">
                    <div className="rate-slider-section">
                      <h3 className="rate-slider-section-title">Universal</h3>
                      {UNIVERSAL_CRITERIA.map((cat) => (
                        <RatingSlider
                          key={cat.key}
                          label={cat.label}
                          value={ratings[cat.key] ?? 5.0}
                          onChange={(val) => handleSliderChange(cat.key, val)}
                          accent={accent}
                        />
                      ))}
                    </div>

                    <div className="rate-slider-section">
                      <h3 className="rate-slider-section-title">{selectedTemplate}</h3>
                      {GENRE_CRITERIA[selectedTemplate]?.map((cat) => (
                        <RatingSlider
                          key={cat.key}
                          label={cat.label}
                          value={ratings[cat.key] ?? 5.0}
                          onChange={(val) => handleSliderChange(cat.key, val)}
                          accent={accent}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="rating-genre-hint">Select a template above to configure rating criteria.</p>
                )}

                <div className="rate-page-footer">
                  <button
                    className="rate-save-btn glow-btn"
                    onClick={handleSaveRatings}
                    disabled={ratingSaving || !selectedTemplate}
                  >
                    {ratingSaving ? 'Saving...' : 'Save Ratings'}
                  </button>
                  <button
                    className="rate-clear-btn"
                    onClick={handleClearRatings}
                    disabled={ratingSaving}
                  >
                    Clear Ratings
                  </button>
                  {saveMessage && <span className="rate-save-msg">{saveMessage}</span>}
                </div>
              </div>
            )}

            <div className="detail-progression-section">
              <h3 className="detail-section-title">Co-Op &amp; Campaign Progression</h3>
              <div className="progression-fields">
                <label className="progression-label">
                  <span className="progression-label-text">Session Notes</span>
                  <textarea
                    className="progression-textarea"
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Bosses defeated, areas unlocked, current objective..."
                    rows={3}
                  />
                </label>
                <label className="progression-label">
                  <span className="progression-label-text">Co-Op Group</span>
                  <input
                    className="progression-input"
                    value={coOpGroup}
                    onChange={(e) => setCoOpGroup(e.target.value)}
                    placeholder="Player tags or names (comma-separated)"
                  />
                </label>
              </div>
              <div className="progression-footer">
                <button
                  className="progression-save-btn glow-btn"
                  onClick={handleSaveProgression}
                  disabled={progressionSaving}
                >
                  {progressionSaving ? 'Saving...' : 'Save Progression'}
                </button>
              </div>
            </div>

            <div className="detail-screenshots-section">
              <div className="detail-screenshots-header">
                <h3 className="detail-section-title">Screenshots</h3>
                <div className="detail-screenshots-actions">
                  <button
                    className="detail-screenshots-folder-btn"
                    onClick={handleOpenScreenshotFolder}
                  >
                    Open Folder
                  </button>
                  <span className="detail-screenshots-hint">Press F12 to capture</span>
                </div>
              </div>
              {screenshots.length > 0 ? (
                <div className="detail-screenshots-carousel">
                  {screenshots.map((s) => (
                    <div key={s.url} className="detail-screenshot-card">
                      <img
                        className="detail-screenshot-img"
                        src={s.url}
                        alt={`Screenshot ${s.filename}`}
                        onClick={() => setLightboxScreenshot(s)}
                      />
                      <button
                        className="detail-screenshot-delete"
                        onClick={() => handleDeleteScreenshot(s.url)}
                        title="Delete screenshot"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="detail-screenshots-empty">
                  No screenshots yet. Launch the game and press F12 to capture.
                </p>
              )}
            </div>

            {game.steamAppId && (
              <div className="detail-achievements-section">
                <h3 className="detail-section-title">Steam Achievements</h3>
                {steamAchievLoading ? (
                  <p className="detail-achievements-empty">Loading achievements...</p>
                ) : steamAchievements && steamAchievements.length > 0 ? (
                  <>
                    <div className="detail-achievements-summary">
                      <span className="detail-achievements-count">
                        {steamAchievements.filter(a => a.achieved).length} / {steamAchievements.length}
                      </span>
                      <div className="detail-achievements-bar-track">
                        <div
                          className="detail-achievements-bar-fill"
                          style={{ width: `${(steamAchievements.filter(a => a.achieved).length / steamAchievements.length) * 100}%` }}
                        />
                      </div>
                      <span className="detail-achievements-pct">
                        {Math.round((steamAchievements.filter(a => a.achieved).length / steamAchievements.length) * 100)}%
                      </span>
                    </div>
                    <div className="detail-achievements-list">
                      {steamAchievements.map((a) => (
                        <div key={a.apiname} className={`detail-achievement-item ${a.achieved ? 'achieved' : ''}`}>
                          <div className="detail-achievement-icon">
                            {a.achieved ? (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--accent, #06d6a0)">
                                <path d="M8 0l2.5 5.5L16 6.5l-4 4 1 5.5L8 12.5 3 16l1-5.5-4-4 5.5-1z" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-muted, #666)" opacity="0.4">
                                <path d="M8 0l2.5 5.5L16 6.5l-4 4 1 5.5L8 12.5 3 16l1-5.5-4-4 5.5-1z" />
                              </svg>
                            )}
                          </div>
                          <div className="detail-achievement-text">
                            <span className="detail-achievement-name">{a.displayName}</span>
                            {a.description && (
                              <span className="detail-achievement-desc">{a.description}</span>
                            )}
                          </div>
                          {a.achieved && a.unlocktime > 0 && (
                            <span className="detail-achievement-date">
                              {new Date(a.unlocktime * 1000).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="detail-achievements-empty">No achievements available for this game.</p>
                )}
              </div>
            )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {lightboxScreenshot && (
        <div className="screenshot-lightbox" onClick={() => setLightboxScreenshot(null)}>
          <button
            className="screenshot-lightbox-close"
            onClick={() => setLightboxScreenshot(null)}
          >
            ×
          </button>
          <button
            className="screenshot-lightbox-delete"
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteScreenshot(lightboxScreenshot.url)
            }}
          >
            Delete
          </button>
          <img
            className="screenshot-lightbox-img"
            src={lightboxScreenshot.url}
            alt="Screenshot full view"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default GameDetail
