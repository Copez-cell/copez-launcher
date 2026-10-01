import { useState, useEffect, useRef, useMemo } from 'react'
import { getRatingColor } from '../utils/ratingColor'

const CARD_H = 110
const VISIBLE = 5
const INDICATOR_ROW = 2
const REEL_COPIES = 6

const FILTERS = [
  { key: 'all', label: 'Any Game' },
  { key: 'installed', label: 'Only Installed' },
  { key: 'highTier', label: 'S-Tier & A-Tier' }
]

function GameRoulette({ open, onClose, games, collections, tierData, onLaunchGame }) {
  const [filter, setFilter] = useState('all')
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState(null)
  const [selectedConsoleFilter, setSelectedConsoleFilter] = useState(null)
  const [phase, setPhase] = useState('pick')
  const [winner, setWinner] = useState(null)
  const [showParticles, setShowParticles] = useState(false)
  const [coverUrls, setCoverUrls] = useState({})
  const reelRef = useRef(null)
  const spinTimeout = useRef(null)
  const particleTimeout = useRef(null)

  const uniqueCollections = useMemo(() => {
    if (!collections || collections.length === 0) return []
    return collections
      .filter((c) => c.gameIds && c.gameIds.length > 0)
      .map((c) => ({ id: c.id, name: c.name, count: c.gameIds.length }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [collections])

  const uniqueConsoles = useMemo(() => {
    const consoleMap = {}
    for (const g of games) {
      if (g.console && g.launchType === 'emulated') {
        if (!consoleMap[g.console]) {
          consoleMap[g.console] = { name: g.console, count: 0 }
        }
        consoleMap[g.console].count++
      }
    }
    return Object.values(consoleMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [games])

  const pool = useMemo(() => {
    let list = [...games]

    if (filter === 'installed') {
      list = list.filter((g) => g.exePath || g.launchTarget)
    } else if (filter === 'highTier') {
      list = list.filter((g) => g.averageRating >= 8.5)
    }

    if (selectedCollectionFilter) {
      const col = collections?.find((c) => c.id === selectedCollectionFilter)
      if (col?.gameIds?.length) {
        const idSet = new Set(col.gameIds)
        list = list.filter((g) => idSet.has(g.id))
      } else {
        list = []
      }
    }

    if (selectedConsoleFilter) {
      list = list.filter((g) => g.launchType === 'emulated' && g.console === selectedConsoleFilter)
    }

    return list
  }, [games, filter, selectedCollectionFilter, selectedConsoleFilter, collections])

  useEffect(() => {
    let cancelled = false
    async function loadCovers() {
      const urls = {}
      for (const game of pool) {
        const img = game.coverImage || game.bannerImage
        if (img && !coverUrls[game.id]) {
          try {
            const url = await window.api.artwork.getUrl(img)
            if (!cancelled && url) urls[game.id] = url
          } catch {}
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setCoverUrls((prev) => ({ ...prev, ...urls }))
      }
    }
    if (pool.length > 0) loadCovers()
    return () => { cancelled = true }
  }, [pool])

  useEffect(() => {
    return () => {
      clearTimeout(spinTimeout.current)
      clearTimeout(particleTimeout.current)
    }
  }, [])

  function handleSpin() {
    if (pool.length === 0) return
    setWinner(null)
    setShowParticles(false)
    setPhase('spinning')

    const idx = Math.floor(Math.random() * pool.length)
    const chosen = pool[idx]
    const targetReelIndex = (REEL_COPIES - 1) * pool.length + idx
    const targetY = -((targetReelIndex - INDICATOR_ROW) * CARD_H)

    const el = reelRef.current
    if (!el) return

    el.style.transition = 'none'
    el.style.transform = 'translateY(0px)'

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 4.5s cubic-bezier(0.15, 0.85, 0.25, 1)'
        el.style.transform = `translateY(${targetY}px)`
      })
    })

    spinTimeout.current = setTimeout(() => {
      setWinner(chosen)
      setPhase('result')
      particleTimeout.current = setTimeout(() => setShowParticles(true), 200)
    }, 4600)
  }

  function handleSpinAgain() {
    const el = reelRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transform = 'translateY(0px)'
    }
    setPhase('pick')
    setWinner(null)
    setShowParticles(false)
    requestAnimationFrame(() => {
      handleSpin()
    })
  }

  function handleLaunch() {
    if (winner) onLaunchGame(winner.id)
  }

  function handleClose() {
    clearTimeout(spinTimeout.current)
    clearTimeout(particleTimeout.current)
    const el = reelRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.transform = 'translateY(0px)'
    }
    setPhase('pick')
    setWinner(null)
    setShowParticles(false)
    onClose()
  }

  if (!open) return null

  const reelItems = []
  for (let c = 0; c < REEL_COPIES; c++) {
    for (let i = 0; i < pool.length; i++) {
      reelItems.push(pool[i])
    }
  }

  return (
    <div className="roulette-overlay" onClick={handleClose}>
      <div className="roulette-panel" onClick={(e) => e.stopPropagation()}>
        <button className="roulette-close" onClick={handleClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l10 10M14 4L4 14" />
          </svg>
        </button>

        <div className="roulette-header">
          <h2 className="roulette-title">Random Game Roulette</h2>
          <p className="roulette-subtitle">Let fate decide your next game</p>
        </div>

        {phase === 'pick' && (
          <div className="roulette-filters">
            <p className="roulette-filter-label">Filter Pool</p>
            <div className="roulette-filter-row">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`roulette-filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {uniqueCollections.length > 0 && (
              <div className="roulette-filter-group">
                <p className="roulette-filter-group-label">Collection</p>
                <div className="roulette-filter-scroll no-scrollbar select-none">
                  <button
                    className={`roulette-filter-btn flex-shrink-0 ${!selectedCollectionFilter ? 'active' : ''}`}
                    onClick={() => setSelectedCollectionFilter(null)}
                  >
                    All
                  </button>
                  {uniqueCollections.map((col) => (
                    <button
                      key={col.id}
                      className={`roulette-filter-btn flex-shrink-0 ${selectedCollectionFilter === col.id ? 'active' : ''}`}
                      onClick={() => setSelectedCollectionFilter(col.id)}
                    >
                      {col.name}
                      <span className="roulette-filter-count">{col.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {uniqueConsoles.length > 0 && (
              <div className="roulette-filter-group">
                <p className="roulette-filter-group-label">Console</p>
                <div className="roulette-filter-row">
                  <button
                    className={`roulette-filter-btn ${!selectedConsoleFilter ? 'active' : ''}`}
                    onClick={() => setSelectedConsoleFilter(null)}
                  >
                    All
                  </button>
                  {uniqueConsoles.map((con) => (
                    <button
                      key={con.name}
                      className={`roulette-filter-btn ${selectedConsoleFilter === con.name ? 'active' : ''}`}
                      onClick={() => setSelectedConsoleFilter(con.name)}
                    >
                      {con.name}
                      <span className="roulette-filter-count">{con.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="roulette-pool-count">
              {pool.length} game{pool.length !== 1 ? 's' : ''} in pool
            </p>
          </div>
        )}

        <div className="roulette-reel-viewport">
          <div className="roulette-reel-mask roulette-reel-mask--top" />
          <div className="roulette-reel-mask roulette-reel-mask--bottom" />
          <div className="roulette-reel-indicator" />

          {pool.length > 0 ? (
            <div
              className={`roulette-reel ${phase === 'spinning' ? 'spinning' : ''}`}
              ref={reelRef}
            >
              {reelItems.map((game, i) => {
                const url = coverUrls[game.id]
                return (
                  <div key={`${game.id}-${i}`} className="roulette-reel-card">
                    <div className="roulette-reel-card-img">
                      {url ? (
                        <img src={url} alt="" draggable={false} />
                      ) : (
                        <div className="roulette-reel-card-placeholder">
                          {game.title.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className="roulette-reel-card-title">{game.title}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="roulette-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: '0.5rem' }}>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <p>No games match these filters</p>
              <p className="roulette-empty-hint">Try expanding your pool!</p>
            </div>
          )}
        </div>

        {phase === 'pick' && (
          <button
            className="roulette-spin-btn"
            onClick={handleSpin}
            disabled={pool.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 3.5l-4 4m4-4v4m0-4h-4" />
              <path d="M3.5 14.5l4-4m-4 4v-4m0 4h4" />
            </svg>
            SPIN
          </button>
        )}

        {phase === 'result' && winner && (
          <div className="roulette-result">
            {showParticles && (
              <div className="roulette-particles">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    className="roulette-particle"
                    style={{
                      '--angle': `${(360 / 18) * i}deg`,
                      '--delay': `${Math.random() * 0.3}s`,
                      '--color': i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? '#ff4d4d' : '#ffd166'
                    }}
                  />
                ))}
              </div>
            )}

            <div className="roulette-result-card">
              <div className="roulette-result-img">
                {coverUrls[winner.id] ? (
                  <img src={coverUrls[winner.id]} alt="" draggable={false} />
                ) : (
                  <div className="roulette-result-placeholder">{winner.title.charAt(0)}</div>
                )}
              </div>
              <div className="roulette-result-info">
                <h3 className="roulette-result-title">{winner.title}</h3>
                {winner.averageRating > 0 && (
                  <span
                    className="roulette-result-rating"
                    style={{ color: getRatingColor(winner.averageRating) }}
                  >
                    {winner.averageRating.toFixed(1)}
                  </span>
                )}
                {winner.exePath || winner.launchTarget ? (
                  <button className="roulette-launch-btn glow-btn" onClick={handleLaunch}>
                    Launch Now
                  </button>
                ) : (
                  <span className="roulette-not-installed">Not Installed</span>
                )}
              </div>
            </div>

            <div className="roulette-result-actions">
              <button className="roulette-spin-again-btn" onClick={handleSpinAgain}>
                Spin Again
              </button>
              <button className="roulette-close-btn" onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameRoulette
