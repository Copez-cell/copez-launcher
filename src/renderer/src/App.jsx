import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import GameGrid from './components/GameGrid'
import GameList from './components/GameList'
import TierList from './components/TierList'
import UpdateBanner from './components/UpdateBanner'
import GameDetail from './components/GameDetail'
import SettingsPage from './components/SettingsPage'
import DropZone from './components/DropZone'
import AddManualModal from './components/AddManualModal'
import GameRoulette from './components/GameRoulette'
import Dashboard from './components/Dashboard'
import RewindDashboard from './components/RewindDashboard'
import SocialView from './components/SocialView'
import ProfilePage from './components/ProfilePage'
import { useSettings } from './context/SettingsContext'
import { supabase, getReadyPromise } from './lib/supabase'
import AuthPage from './components/AuthPage'
import useCloudLibrary from './hooks/useCloudLibrary'
import { syncGameToCloud } from './lib/syncToCloud'
import { ensureUserProfile } from './lib/ensureUserProfile'
import { bulkSyncGamesToCloud } from './lib/bulkSyncToCloud'
import { pushLibraryToCloud, pullLibraryFromCloud, recoverLibraryFromCloud, deleteGameFromCloud, cleanupOrphanGames, publishArtworkToCloud } from './lib/librarySync'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ff6b6b' }}>
          <h3>Something went wrong</h3>
          <p style={{ fontSize: '0.85rem', color: '#8e8e93', marginTop: '0.5rem' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '1rem', padding: '0.5rem 1rem',
              background: 'rgba(255,255,255,0.08)', color: '#e0e0e0',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const SORT_OPTIONS = [
  { value: 'title', label: 'Title' },
  { value: 'rank', label: 'Rank' },
  { value: 'playtime', label: 'Most Played' },
  { value: 'year', label: 'Year of Release' },
  { value: 'recent', label: 'Recently Played' }
]

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function SortDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = options.find((o) => o.value === value)

  return (
    <div className="sort-dropdown" ref={ref}>
      <button className="sort-dropdown-trigger" onClick={() => setOpen((p) => !p)}>
        <span>{current?.label || 'Sort'}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 3.75L5 6.25l2.5-2.5" />
        </svg>
      </button>
      {open && (
        <div className="sort-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`sort-dropdown-item ${opt.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              <span className="sort-dropdown-check">
                {opt.value === value && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                  </svg>
                )}
              </span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const { settings, loaded, wallpaperUrl } = useSettings()
  const [supabaseReady, setSupabaseReady] = useState(false)
  const [session, setSession] = useState(undefined)
  const [games, setGames] = useState([])
  const [collections, setCollections] = useState([])
  const [tierData, setTierData] = useState(null)
  const [activeView, setActiveView] = useState('library')
  const [selectedGame, setSelectedGame] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [statusMessage, setStatusMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [sortBy, setSortBy] = useState('title')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCollectionId, setFilterCollectionId] = useState(null)
  const [runningGames, setRunningGames] = useState(new Set())
  const [rouletteOpen, setRouletteOpen] = useState(false)
  const [steamSyncing, setSteamSyncing] = useState(false)
  const [toast, setToast] = useState(null)
  const [filterReadyToPlay, setFilterReadyToPlay] = useState(false)
  const [filterPlatinum, setFilterPlatinum] = useState(false)
  const [filterConsole, setFilterConsole] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')

  const scrollPositions = useRef({})
  const bulkSyncedRef = useRef(false)
  const detailReturnView = useRef('library')
  const restoreDoneRef = useRef(false)
  const pushTimerRef = useRef(null)

  async function syncLibraryOnLogin(userId) {
    restoreDoneRef.current = false
    try {
      await window.api.storage.init(userId).catch(() => {})
      const pull = await pullLibraryFromCloud()
      if (pull.restored) {
        setToast({ type: 'success', message: `Library restored from cloud (${pull.gameCount} games)` })
        setTimeout(() => setToast(null), 5000)
      } else if (!pull.reason || pull.reason === 'no-snapshot' || pull.reason === 'empty-snapshot') {
        const push = await pushLibraryToCloud().catch(() => null)
        if (push?.pushed) {
          setToast({ type: 'success', message: `Library pushed to cloud (${push.gameCount} games)` })
          setTimeout(() => setToast(null), 5000)
        } else if (push?.reason && push.reason !== 'busy' && push.reason !== 'empty-library') {
          setToast({ type: 'error', message: `Cloud sync failed: ${push.reason}` })
          setTimeout(() => setToast(null), 5000)
        }
      }
    } catch {}
    finally {
      restoreDoneRef.current = true
      cleanupOrphanGames().catch(() => {})
      // Contribute local artwork to the shared catalog (fills gaps only).
      publishArtworkToCloud().catch(() => {})
      loadData()
    }
  }

  async function handleRecoverLibrary() {
    const ok = window.confirm(
      'Rebuild your library from cloud stats and local artwork?\n\nThis replaces your current local game list with the one recovered from the cloud. Use this when a wipe happened.'
    )
    if (!ok) return
    const result = await recoverLibraryFromCloud()
    if (result.error) {
      setToast({ type: 'error', message: `Recovery failed: ${result.error}` })
    } else if (result.recovered > 0) {
      setToast({ type: 'success', message: `Recovered ${result.recovered} games from the cloud` })
      loadData()
    } else {
      setToast({ type: 'error', message: 'Nothing to recover from the cloud.' })
    }
    setTimeout(() => setToast(null), 5000)
  }

  async function maybeBulkSync() {
    if (bulkSyncedRef.current) return
    bulkSyncedRef.current = true
    try {
      const gameData = await window.api.storage.getGames()
      const localGames = gameData.games || []
      if (localGames.length > 0) {
        const { synced } = await bulkSyncGamesToCloud(localGames)
        if (synced > 0) {
          setToast({ type: 'success', message: `Synced ${synced} games to the cloud` })
          setTimeout(() => setToast(null), 5000)
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (activeView === 'dashboard' && !settings.enablePerformanceMonitoring) {
      setActiveView('library')
    }
  }, [settings.enablePerformanceMonitoring, activeView])

  useEffect(() => {
    let listener

    getReadyPromise().then(async () => {
      setSupabaseReady(true)
      const result = await supabase.auth.getSession()
      const sess = result?.data?.session ?? null
      if (sess) {
        await window.api.storage.init(sess.user.id).catch(() => {})
        ensureUserProfile().catch(() => {})
        maybeBulkSync()
        syncLibraryOnLogin(sess.user.id)
      }
      setSession(sess)
    }).catch(() => setSession(null))

    getReadyPromise().then(() => {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          window.api.storage.init(session.user.id).catch(() => {})
          ensureUserProfile().catch(() => {})
          maybeBulkSync()
          syncLibraryOnLogin(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          window.api.storage.init(null).catch(() => {})
          setGames([])
          setCollections([])
          setTierData(null)
        }
        setSession(session)
      })
      listener = sub.data
    })

    return () => listener?.subscription?.unsubscribe()
  }, [])

  const { cloudGames } = useCloudLibrary()
  const cloudRef = useRef(cloudGames)
  cloudRef.current = cloudGames

  useEffect(() => {
    if (loaded && session) loadData()
  }, [loaded, session, cloudGames])

  useEffect(() => {
    const unsub = window.api.game.onStateChange(({ gameId, running, error }) => {
      setRunningGames((prev) => {
        const next = new Set(prev)
        if (running) {
          next.add(gameId)
        } else {
          next.delete(gameId)
        }
        return next
      })
      if (!running) {
        loadData()
        if (error) {
          setStatusMessage(`Failed to launch: ${error}`)
          setTimeout(() => setStatusMessage(''), 6000)
        }
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (loaded) {
      window.api.game.getRunning().then((list) => {
        setRunningGames(new Set(list.map((r) => r.gameId)))
      })
    }
  }, [loaded])

  useEffect(() => {
    const unsub = window.api.game.onAutoFetched(() => {
      loadData()
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!session) return
    if (!restoreDoneRef.current) return
    if (games.length === 0) return
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      pushLibraryToCloud().catch(() => {})
      publishArtworkToCloud().catch(() => {})
    }, 4000)
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [games, collections, session])

  function deduplicateGames(games) {
    const byTitle = new Map()
    const removed = []
    for (const game of games) {
      const key = (game.title || '').trim().toLowerCase()
      if (!key) { byTitle.set(game.id, game); continue }
      const existing = [...byTitle.values()].find(g => (g.title || '').trim().toLowerCase() === key)
      if (!existing) {
        byTitle.set(game.id, game)
      } else {
        const keep = gameWithMoreData(game, existing)
        if (keep === game) {
          const removedId = existing.id
          byTitle.delete(existing.id)
          byTitle.set(game.id, game)
          removed.push(removedId)
        } else {
          removed.push(game.id)
        }
      }
    }
    return { games: Array.from(byTitle.values()), removed }
  }

  function gameWithMoreData(a, b) {
    const scoreA = (a.playtime || 0) + (a.isPlatinum ? 100000 : 0) + (a.ratings && Object.keys(a.ratings).length > 0 ? 50000 : 0) + (a.coverImage ? 10000 : 0) + (a.bannerImage ? 5000 : 0) + (a.lastPlayed ? 100 : 0)
    const scoreB = (b.playtime || 0) + (b.isPlatinum ? 100000 : 0) + (b.ratings && Object.keys(b.ratings).length > 0 ? 50000 : 0) + (b.coverImage ? 10000 : 0) + (b.bannerImage ? 5000 : 0) + (b.lastPlayed ? 100 : 0)
    return scoreA >= scoreB ? a : b
  }

  async function loadData() {
    const gameData = await window.api.storage.getGames()
    const colData = await window.api.storage.getCollections()
    const tierResult = await window.api.storage.getTiers()

    const localGames = gameData.games || []
    const mergedGames = localGames.map(localGame => {
      const cloudMatch = (cloudRef.current || []).find(cloud => cloud.id === localGame.id)
      if (cloudMatch) {
        return {
          ...localGame,
          playtime: localGame.playtime ?? cloudMatch.playtime,
          isPlatinum: localGame.isPlatinum ?? cloudMatch.isPlatinum,
          coverUrl: cloudMatch.coverUrl || localGame.coverUrl,
          bannerUrl: cloudMatch.bannerUrl || localGame.bannerUrl,
          logoUrl: cloudMatch.logoUrl || localGame.logoUrl,
          historicalPlaytime: localGame.historicalPlaytime ?? cloudMatch.historicalPlaytime,
          firstPlayed: localGame.firstPlayed ?? cloudMatch.firstPlayed,
          lastPlayed: localGame.lastPlayed ?? cloudMatch.lastPlayed,
          dateFinished: localGame.dateFinished ?? cloudMatch.dateFinished,
        }
      }
      return localGame
    })

    const deduped = deduplicateGames(mergedGames)
    if (deduped.removed.length > 0) {
      await window.api.storage.saveGames({ games: deduped.games })
      for (const id of deduped.removed) {
        deleteGameFromCloud(id)
      }
    }

    setGames(deduped.games)
    setCollections(colData.collections || [])
    setTierData(tierResult)

    setSelectedGame((prev) => {
      if (!prev) return null
      const updated = deduped.games.find((g) => g.id === prev.id)
      return updated || prev
    })
  }

  async function handleSyncSteam() {
    setSteamSyncing(true)

    const result = await window.api.steam.syncLibrary()
    if (!result.success) {
      setSteamSyncing(false)
      setToast({ type: 'error', message: `Steam sync failed: ${result.error}` })
      setTimeout(() => setToast(null), 5000)
      return
    }

    const steamGames = result.games || []
    if (steamGames.length === 0) {
      setSteamSyncing(false)
      setToast({ type: 'error', message: 'Steam returned no games for this account.' })
      setTimeout(() => setToast(null), 5000)
      return
    }

    const steamByAppId = new Map()
    const steamByTitle = new Map()
    for (const sg of steamGames) {
      steamByAppId.set(sg.appid, sg)
      const norm = normalizeTitle(sg.name)
      if (norm.length >= 3 && !steamByTitle.has(norm)) steamByTitle.set(norm, sg)
    }

    let updatedCount = 0
    const updatedGames = games.map((game) => {
      let steamGame = null

      if (game.launchType === 'steam' && game.launchTarget) {
        const appid = parseInt(game.launchTarget, 10)
        if (!isNaN(appid)) steamGame = steamByAppId.get(appid)
      }

      if (!steamGame) {
        const norm = normalizeTitle(game.title)
        if (norm.length >= 3) steamGame = steamByTitle.get(norm) || null
      }

      if (!steamGame) return game

      const playtimeMinutes = steamGame.playtime_forever || 0
      const playtimeHours = Math.round(playtimeMinutes / 60)
      updatedCount++
      return {
        ...game,
        playtime: Math.round(playtimeHours * 3600),
        steamAppId: String(steamGame.appid)
      }
    })

    if (updatedCount > 0) {
      await window.api.storage.saveGames({ games: updatedGames })
      await loadData()
    }

    setSteamSyncing(false)
    setToast({
      type: updatedCount > 0 ? 'success' : 'error',
      message: updatedCount > 0
        ? `Successfully updated playtime for ${updatedCount} game${updatedCount > 1 ? 's' : ''}!`
        : `No matching games found in your library (${steamGames.length} Steam games checked).`
    })
    setTimeout(() => setToast(null), 5000)
  }

  async function handleLaunchGame(gameId) {
    const game = games.find((g) => g.id === gameId)
    if (game?.launchType === 'steam' || (game?.exePath || '').toLowerCase().includes('steamapps')) {
      setToast({ type: 'info', message: `Launching ${game.title} via Steam…` })
      setTimeout(() => setToast(null), 5000)
    }
    const result = await window.api.game.launch(gameId)
    if (result.success) {
      setRunningGames((prev) => new Set([...prev, gameId]))
      setStatusMessage(`Launched ${game?.title || 'game'}`)
      loadData()
    } else if (result.unlinked) {
      setStatusMessage(result.error)
    } else {
      setStatusMessage(`Failed: ${result.error}`)
    }
    setTimeout(() => setStatusMessage(''), 5000)
  }

  async function handleStopGame(gameId) {
    await window.api.game.stop(gameId)

    setRunningGames((prev) => {
      const next = new Set(prev)
      next.delete(gameId)
      return next
    })

    await loadData()

    const gameData = await window.api.storage.getGames()
    const stoppedGame = gameData.games?.find((g) => g.id === gameId)
    if (stoppedGame) {
      syncGameToCloud(stoppedGame).catch(() => {})
    }
  }

  async function handleCreateCollection(name) {
    const id = `col-${Date.now().toString(36)}`
    const newCol = { id, name: name.trim(), gameIds: [] }
    const updated = [...collections, newCol]
    setCollections(updated)
    await window.api.storage.saveCollections({ collections: updated })
  }

  async function handleDeleteCollection(colId) {
    const updated = collections.filter((c) => c.id !== colId)
    setCollections(updated)
    await window.api.storage.saveCollections({ collections: updated })
  }

  async function handleAddGameToCollection(gameId, colId) {
    const updated = collections.map((c) => {
      if (c.id !== colId) return c
      if (c.gameIds?.includes(gameId)) return c
      return { ...c, gameIds: [...(c.gameIds || []), gameId] }
    })
    setCollections(updated)
    await window.api.storage.saveCollections({ collections: updated })
  }

  async function handleRemoveGameFromCollection(gameId, colId) {
    const updated = collections.map((c) => {
      if (c.id !== colId) return c
      return { ...c, gameIds: (c.gameIds || []).filter((id) => id !== gameId) }
    })
    setCollections(updated)
    await window.api.storage.saveCollections({ collections: updated })
  }

  const filteredGames = useMemo(() => {
    let result = [...games]

    if (activeView === 'consoles') {
      result = result.filter((g) => g.launchType === 'emulated')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((g) => g.title.toLowerCase().includes(q))
    }
    if (filterCollectionId) {
      const col = collections.find((c) => c.id === filterCollectionId)
      if (col?.gameIds?.length) {
        const idSet = new Set(col.gameIds)
        result = result.filter((g) => idSet.has(g.id))
      } else {
        result = []
      }
    }
    if (filterReadyToPlay) {
      result = result.filter((g) => {
        const launchType = g.launchType || 'executable'
        if (launchType === 'emulated') {
          return !!(g.emulatorPath && g.romPath)
        }
        if (launchType === 'executable') {
          return !!g.exePath
        }
        return g.isInstalled === true
      })
    }
    if (filterPlatinum) {
      result = result.filter((g) => g.isPlatinum === true)
    }
    if (activeView === 'consoles' && filterConsole) {
      result = result.filter((g) => g.console === filterConsole)
    }
    switch (sortBy) {
      case 'rank':
        return result.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
      case 'playtime':
        return result.sort((a, b) => (b.playtime || 0) - (a.playtime || 0))
      case 'year':
        return result.sort((a, b) => {
          const ya = a.releaseDate ? new Date(a.releaseDate).getFullYear() : 0
          const yb = b.releaseDate ? new Date(b.releaseDate).getFullYear() : 0
          return yb - ya
        })
      case 'recent':
        return result.sort((a, b) => {
          if (!a.lastPlayed) return 1
          if (!b.lastPlayed) return -1
          return new Date(b.lastPlayed) - new Date(a.lastPlayed)
        })
      case 'title':
      default:
        return result.sort((a, b) => a.title.localeCompare(b.title))
    }
  }, [games, activeView, sortBy, searchQuery, filterCollectionId, collections, filterReadyToPlay, filterPlatinum, filterConsole])

  const showToolbar = activeView === 'library' || activeView === 'consoles' || activeView === 'dashboard' || activeView === 'social'
  const showViewToggle = activeView === 'library' || activeView === 'consoles'

  const consoleGroups = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      if (g.console) {
        map.set(g.console, (map.get(g.console) || 0) + 1)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [games])

  function getViewTitle() {
    switch (activeView) {
      case 'tierlist':
        return 'Tier List'
      case 'detail':
        return 'Game Details'
      case 'settings':
        return 'Settings'
      case 'profile':
        return 'Profile'
      case 'consoles':
        return 'Consoles'
      case 'social':
        return 'Community'
      case 'dashboard':
        return 'Performance'
      default:
        return 'Library'
    }
  }

  function handleSelectGame(game) {
    if (activeView !== 'detail') {
      detailReturnView.current = activeView
    }
    setSelectedGame(game)
    setActiveView('detail')
  }

  async function handleAddGame() {
    const result = await window.api.settings.selectGameFile()
    if (result.canceled || !result.path) return

    const addResult = await window.api.game.addFromPath(result.path)
    if (addResult.success) {
      setStatusMessage(`Added "${addResult.game.title}"`)
      loadData()
    } else {
      setStatusMessage(addResult.error)
    }
    setTimeout(() => setStatusMessage(''), 3000)
  }

  function handleAddManualGame() {
    setModalOpen(true)
  }

  const restoreScrollRef = useCallback((node) => {
    if (!node) return
    const view = node.dataset.scrollKey
    if (view && scrollPositions.current[view] != null) {
      node.scrollTop = scrollPositions.current[view]
    }
  }, [])

  function saveScroll(view, e) {
    scrollPositions.current[view] = e.target.scrollTop
  }

  async function handleManualAdded(game) {
    setStatusMessage(`Added "${game.title}" to your library`)
    loadData()
    setTimeout(() => setStatusMessage(''), 3000)
  }

  async function handleLinkExe(game) {
    const result = await window.api.game.linkExe(game.id)
    if (result.success) {
      setStatusMessage(`Linked "${game.title}" to executable`)
      loadData()
    } else if (result.error !== 'Cancelled') {
      setStatusMessage(result.error)
    }
    setTimeout(() => setStatusMessage(''), 3000)
  }

  if (!loaded) return null

  const cloudConfigured = import.meta.env.VITE_SUPABASE_URL &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

  if (cloudConfigured && (!supabaseReady || session === undefined)) {
    return <div className="loading-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d0d', color: '#06d6a0', fontFamily: 'monospace', fontSize: '1.2rem' }}>Loading COPEZ...</div>
  }

  if (cloudConfigured && !session) {
    return <AuthPage />
  }

  return (
    <div className={`app-root ${wallpaperUrl ? 'has-wallpaper' : ''}`}>
      {wallpaperUrl && (
        <div
          className="wallpaper-overlay"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            filter: `blur(${settings.blur || 0}px) brightness(${(settings.brightness || 100) / 100})`
          }}
        />
      )}
      <Titlebar />
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <DropZone onGameAdded={loadData} />
        <Sidebar
        games={games}
        collections={collections}
        activeView={activeView}
        selectedGameId={selectedGame?.id || null}
        sortBy={sortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterCollectionId={filterCollectionId}
        onFilterCollectionChange={setFilterCollectionId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => {
          const next = !sidebarCollapsed
          setSidebarCollapsed(next)
          localStorage.setItem('sidebarCollapsed', String(next))
        }}
        onViewChange={(view) => {
          setActiveView(view)
          setFilterConsole(null)
          if (view === 'library') {
            setSelectedGame(null)
          }
        }}
        onGameSelect={handleSelectGame}
        onLaunchGame={handleLaunchGame}
        onAddGame={handleAddGame}
        onAddManual={handleAddManualGame}
        onCreateCollection={handleCreateCollection}
        onDeleteCollection={handleDeleteCollection}
        onAddGameToCollection={handleAddGameToCollection}
        onRemoveGameFromCollection={handleRemoveGameFromCollection}
      />

      <main className="main-content">
        {(showToolbar || activeView === 'settings' || activeView === 'profile') && (
          <div className="content-toolbar">
            <div className="toolbar-left">
              <h2 className="content-title">{getViewTitle()}</h2>
              {activeView === 'consoles' && consoleGroups.length > 0 && (
                <div className="toolbar-console-filters">
                  {filterConsole && (
                    <button
                      className="toolbar-console-clear"
                      onClick={() => setFilterConsole(null)}
                    >
                      Clear
                    </button>
                  )}
                  {consoleGroups.map(([name, count]) => (
                    <button
                      key={name}
                      className={`sidebar-console-tag ${filterConsole === name ? 'sidebar-console-tag--active' : ''}`}
                      onClick={() => setFilterConsole(filterConsole === name ? null : name)}
                    >
                      <span className="sidebar-console-tag-name">{name}</span>
                      <span className="sidebar-console-tag-count">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="toolbar-actions">
              {showViewToggle && (
                <>
                  <button
                    className={`ready-to-play-btn ${filterReadyToPlay ? 'active' : ''}`}
                    onClick={() => setFilterReadyToPlay((p) => !p)}
                    title={filterReadyToPlay ? 'Show all games' : 'Show only ready-to-play games'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2.5l9 5.5-9 5.5z" />
                    </svg>
                  </button>
                  <button
                    className={`platinum-filter-btn ${filterPlatinum ? 'active' : ''}`}
                    onClick={() => setFilterPlatinum((p) => !p)}
                    title={filterPlatinum ? 'Show all games' : 'Show only platinumed games'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  </button>
                  <button
                    className="roulette-toolbar-btn"
                    onClick={() => setRouletteOpen(true)}
                    title="Random Game Roulette"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="1" y="1" width="6" height="6" rx="1.2" />
                      <rect x="9" y="1" width="6" height="6" rx="1.2" />
                      <rect x="1" y="9" width="6" height="6" rx="1.2" />
                      <rect x="9" y="9" width="6" height="6" rx="1.2" />
                      <circle cx="4" cy="4" r="1" fill="var(--bg-root, #121214)" />
                      <circle cx="12" cy="4" r="1" fill="var(--bg-root, #121214)" />
                      <circle cx="4" cy="12" r="1" fill="var(--bg-root, #121214)" />
                      <circle cx="12" cy="12" r="1" fill="var(--bg-root, #121214)" />
                      <circle cx="8" cy="8" r="1" fill="var(--bg-root, #121214)" />
                    </svg>
                  </button>
                  <SortDropdown
                    value={sortBy}
                    onChange={setSortBy}
                    options={SORT_OPTIONS}
                  />
                  <div className="view-toggle">
                    <button
                      className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                    >
                      &#9707;
                    </button>
                    <button
                      className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                    >
                      &#9776;
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeView === 'detail' && (
          <div className="content-area content-area-detail">
            <GameDetail
              game={selectedGame}
              onBack={() => {
                const prev = detailReturnView.current || 'library'
                detailReturnView.current = 'library'
                setSelectedGame(null)
                setActiveView(prev)
              }}
              onRefresh={loadData}
              onLaunchGame={handleLaunchGame}
              onStopGame={handleStopGame}
              onLinkExe={handleLinkExe}
              isRunning={selectedGame ? runningGames.has(selectedGame.id) : false}
              onSyncSteam={handleSyncSteam}
              steamSyncing={steamSyncing}
            />
          </div>
        )}

        {activeView === 'tierlist' && (
          <div
            className="content-area"
            ref={restoreScrollRef}
            data-scroll-key="tierlist"
            onScroll={(e) => saveScroll('tierlist', e)}
          >
            <TierList
              games={filteredGames}
              tiers={tierData}
              onTiersSaved={loadData}
            />
          </div>
        )}

        {activeView === 'profile' && (
          <div className="content-area">
            <ProfilePage user={session?.user} games={games} onBack={() => setActiveView('settings')} />
          </div>
        )}

        {activeView === 'settings' && (
          <div className="content-area">
            <SettingsPage
              onImportComplete={loadData}
              onRecoverLibrary={handleRecoverLibrary}
            />
          </div>
        )}

        {activeView === 'rewind' && (
          <div className="content-area">
            <RewindDashboard games={games} />
          </div>
        )}

        {activeView === 'social' && (
          <div className="content-area">
            <SocialView games={games} />
          </div>
        )}

        {activeView === 'dashboard' && settings.enablePerformanceMonitoring && (
          <div className="content-area">
            <ErrorBoundary>
              <Dashboard />
            </ErrorBoundary>
          </div>
        )}

        {(activeView === 'library' || activeView === 'consoles') && (
          <div
            className="content-area"
            ref={restoreScrollRef}
            data-scroll-key="library"
            onScroll={(e) => saveScroll('library', e)}
          >
            {(filterReadyToPlay || filterPlatinum) && filteredGames.length === 0 ? (
              <div className="ready-to-play-empty">
                <div className="ready-to-play-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                    <path d="M19 15l14 9-14 9z" fill="currentColor" opacity="0.3" />
                  </svg>
                </div>
                <p className="ready-to-play-empty-text">
                  {filterPlatinum ? 'No games platinumed.' : 'No games currently installed.'}
                </p>
                <p className="ready-to-play-empty-hint">
                  Turn off the filter to see your full backlog.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <GameGrid
                games={filteredGames}
                onGameSelect={handleSelectGame}
                onLaunchGame={handleLaunchGame}
                onLinkExe={handleLinkExe}
                cardSize={settings.cardSize}
                showRanking={settings.showRanking}
                collections={collections}
                onAddGameToCollection={handleAddGameToCollection}
              />
            ) : (
              <GameList
                games={filteredGames}
                onGameSelect={handleSelectGame}
                onLaunchGame={handleLaunchGame}
                onLinkExe={handleLinkExe}
              />
            )}
          </div>
        )}

        {statusMessage && (
          <div className="status-bar">{statusMessage}</div>
        )}
      </main>
      </div>

      <AddManualModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={handleManualAdded}
      />

      <GameRoulette
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        games={games}
        collections={collections}
        tierData={tierData}
        onLaunchGame={handleLaunchGame}
      />

      <UpdateBanner />

      {toast && (
        <div className={`app-toast ${toast.type}`}>
          {toast.type === 'success' && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7.5l2.5 2.5L11 4" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="6" />
              <path d="M5 5l4 4M9 5l-4 4" />
            </svg>
          )}
          {toast.type === 'info' && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2.5v9l6-4.5z" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button className="app-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default App
