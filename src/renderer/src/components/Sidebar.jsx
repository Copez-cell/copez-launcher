import { useState, useEffect, useRef } from 'react'
import { useSettings } from '../context/SettingsContext'
import ProfileCard from './ProfileCard'

function Sidebar({ games, collections, activeView, selectedGameId, sortBy, searchQuery, onSearchChange, filterCollectionId, onFilterCollectionChange, collapsed, onToggleCollapse, onViewChange, onGameSelect, onLaunchGame, onAddGame, onAddManual, onCreateCollection, onDeleteCollection, onAddGameToCollection, onRemoveGameFromCollection }) {
  const { settings, updateSetting } = useSettings()
  const [expandedCollections, setExpandedCollections] = useState(new Set())
  const [collectionsGroupExpanded, setCollectionsGroupExpanded] = useState(true)
  const [coverUrls, setCoverUrls] = useState({})
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchRef = useRef(null)
  const newColInputRef = useRef(null)
  const filterRef = useRef(null)

  useEffect(() => {
    if (creatingCollection && newColInputRef.current) {
      newColInputRef.current.focus()
    }
  }, [creatingCollection])

  useEffect(() => {
    if (settings.collectionsExpanded !== undefined) {
      setCollectionsGroupExpanded(settings.collectionsExpanded)
    }
  }, [settings.collectionsExpanded])

  function toggleCollectionsGroup() {
    setCollectionsGroupExpanded((prev) => {
      const next = !prev
      updateSetting('collectionsExpanded', next)
      return next
    })
  }

  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
      return () => {
        document.removeEventListener('click', handleClick)
        document.removeEventListener('contextmenu', handleClick)
      }
    }
  }, [contextMenu])

  useEffect(() => {
    function handleClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [filterOpen])

  useEffect(() => {
    let cancelled = false
    async function loadCovers() {
      const urls = {}
      for (const game of games) {
        if (coverUrls[game.id]) continue
        const img = game.coverImage || game.bannerImage
        // Shared catalog artwork covers games with no local image.
        const fallback = game.coverUrl || game.bannerUrl || null
        if (!img) {
          if (fallback) urls[game.id] = fallback
          continue
        }
        try {
          const url = await window.api.artwork.getUrl(img)
          if (!cancelled) urls[game.id] = url || fallback
        } catch {
          if (!cancelled && fallback) urls[game.id] = fallback
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setCoverUrls((prev) => ({ ...prev, ...urls }))
      }
    }
    if (games.length > 0) loadCovers()
    return () => { cancelled = true }
  }, [games])

  const filteredGames = (() => {
    let result = searchQuery.trim()
      ? games.filter((g) => g.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : [...games]
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
  })()

  const installedCount = games.filter((g) => g.exePath).length

  const toggleCollection = (colId) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(colId)) {
        next.delete(colId)
      } else {
        next.add(colId)
      }
      return next
    })
  }

  const getCollectionGames = (col) => {
    if (!col.gameIds) return []
    return col.gameIds.map((id) => games.find((g) => g.id === id)).filter(Boolean)
  }

  function handleCreateConfirm() {
    const name = newCollectionName.trim()
    if (!name) {
      setCreatingCollection(false)
      return
    }
    onCreateCollection(name)
    setNewCollectionName('')
    setCreatingCollection(false)
  }

  function handleCreateKeyDown(e) {
    if (e.key === 'Enter') {
      handleCreateConfirm()
    } else if (e.key === 'Escape') {
      setCreatingCollection(false)
      setNewCollectionName('')
    }
  }

  function clampMenuPos(x, y, itemCount) {
    const margin = 8
    const estWidth = 16 * 16
    const estHeight = 40 + itemCount * 38
    return {
      x: Math.max(margin, Math.min(x, window.innerWidth - estWidth - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - estHeight - margin))
    }
  }

  function handleGameContextMenu(e, game) {
    e.preventDefault()
    e.stopPropagation()
    if (collections.length === 0) return
    const pos = clampMenuPos(e.clientX, e.clientY, collections.length)
    setContextMenu({
      ...pos,
      type: 'game',
      gameId: game.id,
      gameTitle: game.title
    })
  }

  function handleCollectionGameContextMenu(e, game, colId) {
    e.preventDefault()
    e.stopPropagation()
    const pos = clampMenuPos(e.clientX, e.clientY, 1)
    setContextMenu({
      ...pos,
      type: 'collection-game',
      gameId: game.id,
      gameTitle: game.title,
      colId
    })
  }

  function handleCollectionHeaderContextMenu(e, col) {
    e.preventDefault()
    e.stopPropagation()
    const pos = clampMenuPos(e.clientX, e.clientY, 1)
    setContextMenu({
      ...pos,
      type: 'collection',
      colId: col.id,
      colName: col.name
    })
  }

  function addToCollection(colId) {
    if (!contextMenu) return
    onAddGameToCollection(contextMenu.gameId, colId)
    setContextMenu(null)
  }

  function removeFromCollection() {
    if (!contextMenu) return
    onRemoveGameFromCollection(contextMenu.gameId, contextMenu.colId)
    setContextMenu(null)
  }

  function deleteCollection() {
    if (!contextMenu) return
    onDeleteCollection(contextMenu.colId)
    setContextMenu(null)
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {collapsed ? (
        <div className="sidebar-collapsed-icons">
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Expand sidebar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3l4 4-4 4" />
            </svg>
          </button>
          {collections.length > 0 && (
            <div className="sidebar-collapsed-collections">
              {collections.map((col) => (
                <button
                  key={col.id}
                  className={`sidebar-collapsed-collection ${filterCollectionId === col.id ? 'active' : ''}`}
                  title={col.name}
                  onClick={() => {
                    onFilterCollectionChange(filterCollectionId === col.id ? null : col.id)
                    onViewChange('library')
                  }}
                >
                  <span className="sidebar-collapsed-collection-letter">
                    {col.name.charAt(0).toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            className={`sidebar-nav-item sidebar-collapsed-settings ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
            title="Settings"
          >
            <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M13.2 9.9a1.2 1.2 0 0 0 .24 1.32l.04.04a1.44 1.44 0 1 1-2.04 2.04l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.72 1.08v.12a1.44 1.44 0 0 1-2.88 0v-.06a1.2 1.2 0 0 0-.78-1.08 1.2 1.2 0 0 0-1.32.24l-.04.04a1.44 1.44 0 1 1-2.04-2.04l.04-.04a1.2 1.2 0 0 0 .24-1.32 1.2 1.2 0 0 0-1.08-.72H2.4a1.44 1.44 0 0 1 0-2.88h.06a1.2 1.2 0 0 0 1.08-.78 1.2 1.2 0 0 0-.24-1.32L3.26 4.02a1.44 1.44 0 1 1 2.04-2.04l.04.04a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .72-1.08V.9a1.44 1.44 0 0 1 2.88 0v.06a1.2 1.2 0 0 0 .72 1.08 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.44 1.44 0 1 1 2.04 2.04l-.04.04a1.2 1.2 0 0 0-.24 1.32v.06a1.2 1.2 0 0 0 1.08.72h.12a1.44 1.44 0 0 1 0 2.88h-.06a1.2 1.2 0 0 0-1.08.72z" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <div className="sidebar-search">
            <div className="sidebar-search-input-wrap">
              <svg className="sidebar-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="4.5" />
                <path d="M9.5 9.5L12.5 12.5" />
              </svg>
              <input
                ref={searchRef}
                className="sidebar-search-input"
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button className="sidebar-search-clear" onClick={() => { onSearchChange(''); searchRef.current?.focus() }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              )}
            </div>
            <div className="sidebar-filter-wrap" ref={filterRef}>
              <button
                className={`sidebar-filter-btn ${filterCollectionId ? 'sidebar-filter-btn--active' : ''}`}
                title="Filter by collection"
                onClick={() => setFilterOpen((p) => !p)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.75 3.5h10.5M3.5 7h7M5.25 10.5h3.5" />
                </svg>
              </button>
              {filterOpen && (
                <div className="filter-dropdown">
                  <button
                    className={`filter-dropdown-item ${!filterCollectionId ? 'filter-dropdown-item--active' : ''}`}
                    onClick={() => { onFilterCollectionChange(null); setFilterOpen(false) }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1.5" y="1.5" width="4" height="4" rx="0.75" />
                      <rect x="6.5" y="1.5" width="4" height="4" rx="0.75" />
                      <rect x="1.5" y="6.5" width="4" height="4" rx="0.75" />
                      <rect x="6.5" y="6.5" width="4" height="4" rx="0.75" />
                    </svg>
                    All Games
                  </button>
                  {collections.length > 0 && <div className="filter-dropdown-divider" />}
                  {collections.map((col) => (
                    <button
                      key={col.id}
                      className={`filter-dropdown-item ${filterCollectionId === col.id ? 'filter-dropdown-item--active' : ''}`}
                      onClick={() => { onFilterCollectionChange(col.id); setFilterOpen(false) }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.75 2.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-.75.75H2.5a.75.75 0 0 1-.75-.75z" />
                        <path d="M6.25 2.5a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75z" />
                      </svg>
                      {col.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3l-4 4 4 4" />
              </svg>
            </button>
          </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${activeView === 'library' ? 'active' : ''}`}
          onClick={() => onViewChange('library')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
            <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
            <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
            <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          </svg>
          Library
        </button>
        <button
          className={`sidebar-nav-item ${activeView === 'consoles' ? 'active' : ''}`}
          onClick={() => onViewChange('consoles')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="12" x2="10" y2="12" />
            <line x1="8" y1="10" x2="8" y2="14" />
            <line x1="15" y1="13" x2="15.01" y2="13" />
            <line x1="18" y1="11" x2="18.01" y2="11" />
            <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
          </svg>
          Consoles
        </button>
        <button
          className={`sidebar-nav-item ${activeView === 'tierlist' ? 'active' : ''}`}
          onClick={() => onViewChange('tierlist')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M2 8h9M2 12h6" />
          </svg>
          Tier List
        </button>
        <button
          className={`sidebar-nav-item ${activeView === 'social' ? 'active' : ''}`}
          onClick={() => onViewChange('social')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="5.5" r="2" />
            <circle cx="11" cy="5.5" r="2" />
            <path d="M1.5 13.5c0-2 1.5-3.25 3.5-3.25s3.5 1.25 3.5 3.25" />
            <path d="M8.5 10.25c2-.5 3.5.75 3.5 2.75" />
            <path d="M10.5 7.75c1.5-.1 2.5 1 2.5 2.5" />
          </svg>
          Community
        </button>
        {settings.enablePerformanceMonitoring && (
          <button
            className={`sidebar-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => onViewChange('dashboard')}
          >
            <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="8" width="3" height="6.5" rx="0.5" />
              <rect x="6.5" y="4.5" width="3" height="10" rx="0.5" />
              <rect x="11.5" y="1.5" width="3" height="13" rx="0.5" />
            </svg>
            Performance
          </button>
        )}
        <button
          className={`sidebar-nav-item ${activeView === 'rewind' ? 'active' : ''}`}
          onClick={() => onViewChange('rewind')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          Rewind
        </button>
      </nav>

      <div className="sidebar-scroll">
        <div className="sidebar-divider" />

        <div className="sidebar-collections">
          <div className="sidebar-section-header sidebar-section-header--toggle" onClick={toggleCollectionsGroup}>
            <svg
              className={`sidebar-section-chevron ${collectionsGroupExpanded ? 'expanded' : ''}`}
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M3 1.5l4 3.5-4 3.5" />
            </svg>
            <span className="sidebar-section-title">Collections</span>
            <button
              className="sidebar-section-add"
              title="New collection"
              onClick={(e) => { e.stopPropagation(); setCreatingCollection(true) }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 2v8M2 6h8" />
              </svg>
            </button>
          </div>

          {collectionsGroupExpanded && (
            <div className="sidebar-collections-body">
              {creatingCollection && (
                <div className="new-collection-input">
                  <input
                    ref={newColInputRef}
                    className="new-collection-field"
                    type="text"
                    placeholder="Collection name..."
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={handleCreateKeyDown}
                    onBlur={() => { if (!newCollectionName.trim()) { setCreatingCollection(false) } }}
                    maxLength={40}
                  />
                </div>
              )}

              {collections.length === 0 && !creatingCollection && (
                <div className="sidebar-empty sidebar-empty--padded">No collections yet</div>
              )}
              {collections.map((col) => {
                const isExpanded = expandedCollections.has(col.id)
                const colGames = getCollectionGames(col)

                return (
                  <div key={col.id} className="collection-group">
                    <button
                      className="collection-header"
                      onClick={() => toggleCollection(col.id)}
                      onContextMenu={(e) => handleCollectionHeaderContextMenu(e, col)}
                    >
                      <svg
                        className={`collection-chevron ${isExpanded ? 'expanded' : ''}`}
                        width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M4.5 2.5l4 3.5-4 3.5" />
                      </svg>
                      <span className="collection-name">{col.name}</span>
                      <span className="collection-count">{colGames.length}</span>
                    </button>

                    <div className={`collection-games ${isExpanded ? 'expanded' : ''}`}>
                      {colGames.map((game) => {
                        const installed = !!game.exePath
                        const coverUrl = coverUrls[game.id]
                        return (
                          <button
                            key={game.id}
                            className={`collection-game-item ${game.id === selectedGameId ? 'collection-game-item--active' : ''} ${!installed ? 'collection-game-item--uninstalled' : ''}`}
                            onClick={() => onGameSelect(game)}
                            onContextMenu={(e) => handleCollectionGameContextMenu(e, game, col.id)}
                          >
                            <div className="collection-game-thumb">
                              {coverUrl ? (
                                <img src={coverUrl} alt="" draggable={false} />
                              ) : (
                                <span>{game.title.charAt(0)}</span>
                              )}
                            </div>
                            <span className="collection-game-name">{game.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-game-list">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">Games</span>
            <span className="sidebar-section-count">{installedCount}/{games.length}</span>
          </div>
          {filteredGames.length === 0 && (
            <div className="sidebar-empty">
              {searchQuery ? 'No games match your search' : 'No games yet'}
            </div>
          )}
          {filteredGames.map((game) => {
            const installed = !!game.exePath
            const coverUrl = coverUrls[game.id]
            return (
              <button
                key={game.id}
                className={`sidebar-game-item ${game.id === selectedGameId ? 'sidebar-game-item--active' : ''} ${!installed ? 'sidebar-game-item--uninstalled' : ''}`}
                onClick={() => onGameSelect(game)}
                onContextMenu={(e) => handleGameContextMenu(e, game)}
                title={game.title}
              >
                <div className="sidebar-game-thumb">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" draggable={false} />
                  ) : (
                    <span>{game.title.charAt(0)}</span>
                  )}
                </div>
                <span className="sidebar-game-name">{game.title}</span>
                {!installed && (
                  <span className="sidebar-game-badge">Not Installed</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-add-buttons">
          <button className="sidebar-add-btn" onClick={onAddGame}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
            Add Game
          </button>
          <button className="sidebar-add-btn sidebar-add-btn--secondary" onClick={onAddManual}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.75 1.75h3.5v3.5" />
              <path d="M5.25 8.75H1.75v-3.5" />
              <path d="M12.25 1.75L8.15 5.85a2.8 2.8 0 0 1-3.95.15L1.75 2.35" />
            </svg>
            Add Manually
          </button>
        </div>
        <ProfileCard onViewChange={onViewChange} />
        <button
          className={`sidebar-nav-item sidebar-settings-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.2 9.9a1.2 1.2 0 0 0 .24 1.32l.04.04a1.44 1.44 0 1 1-2.04 2.04l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.72 1.08v.12a1.44 1.44 0 0 1-2.88 0v-.06a1.2 1.2 0 0 0-.78-1.08 1.2 1.2 0 0 0-1.32.24l-.04.04a1.44 1.44 0 1 1-2.04-2.04l.04-.04a1.2 1.2 0 0 0 .24-1.32 1.2 1.2 0 0 0-1.08-.72H2.4a1.44 1.44 0 0 1 0-2.88h.06a1.2 1.2 0 0 0 1.08-.78 1.2 1.2 0 0 0-.24-1.32L3.26 4.02a1.44 1.44 0 1 1 2.04-2.04l.04.04a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .72-1.08V.9a1.44 1.44 0 0 1 2.88 0v.06a1.2 1.2 0 0 0 .72 1.08 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.44 1.44 0 1 1 2.04 2.04l-.04.04a1.2 1.2 0 0 0-.24 1.32v.06a1.2 1.2 0 0 0 1.08.72h.12a1.44 1.44 0 0 1 0 2.88h-.06a1.2 1.2 0 0 0-1.08.72z" />
          </svg>
          Settings
        </button>
      </div>
        </>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'game' && (
            <>
              <div className="context-menu-label">{contextMenu.gameTitle}</div>
              <div className="context-menu-divider" />
              {collections.map((col) => (
                <button
                  key={col.id}
                  className="context-menu-item"
                  onClick={() => addToCollection(col.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M6 2v8M2 6h8" />
                  </svg>
                  {col.name}
                </button>
              ))}
            </>
          )}
          {contextMenu.type === 'collection-game' && (
            <>
              <div className="context-menu-label">{contextMenu.gameTitle}</div>
              <div className="context-menu-divider" />
              <button className="context-menu-item context-menu-item--danger" onClick={removeFromCollection}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h6" />
                </svg>
                Remove from Collection
              </button>
            </>
          )}
          {contextMenu.type === 'collection' && (
            <>
              <div className="context-menu-label">{contextMenu.colName}</div>
              <div className="context-menu-divider" />
              <button className="context-menu-item context-menu-item--danger" onClick={deleteCollection}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 3.5h7M4.5 3.5V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M5.25 5.5v3M6.75 5.5v3" />
                  <path d="M3.5 3.5l.5 6.5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1l.5-6.5" />
                </svg>
                Delete Collection
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

export default Sidebar
