import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import useRewindStats from '../hooks/useRewindStats'
import { supabase, getReadyPromise } from '../lib/supabase'

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function PlayerAvatar({ url, name, className }) {
  const [errored, setErrored] = useState(false)
  useEffect(() => setErrored(false), [url])
  return (
    <div className={`sv-avatar${className ? ` ${className}` : ''}`}>
      {url && !errored ? (
        <img src={url} alt="" onError={() => setErrored(true)} />
      ) : (
        <span>{(name || 'U').charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}

function CoverImage({ coverImage, title, className, games }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)

    const isRemote = typeof coverImage === 'string' && /^https?:\/\//i.test(coverImage)
    if (isRemote) {
      setUrl(coverImage)
    } else if (coverImage) {
      window.api.artwork.getUrl(coverImage).then((u) => {
        if (!cancelled && u) setUrl(u)
      })
    } else {
      const local = (games || []).find(
        (g) => g.title && title && g.title.toLowerCase() === title.toLowerCase() && g.coverImage
      )
      if (local?.coverImage) {
        window.api.artwork.getUrl(local.coverImage).then((u) => {
          if (!cancelled && u) setUrl(u)
        })
      }
    }

    return () => { cancelled = true }
  }, [coverImage, title, games])

  if (url) return <img src={url} alt={title} className={className} />
  return <div className="rewind-poster-placeholder">{title?.[0] || '?'}</div>
}

function RewindDashboard({ games }) {
  const [timeframe, setTimeframe] = useState('year')
  const [referenceDate, setReferenceDate] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const [players, setPlayers] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [cloudRows, setCloudRows] = useState(null)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState(null)
  const [myId, setMyId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetchPlayers() {
      await getReadyPromise()
      const { data } = await supabase.auth.getSession()
      const session = data?.session ?? null
      if (!session) return

      setMyId(session.user.id)

      const [usersRes, gamesRes] = await Promise.all([
        supabase.from('users').select('id, username, avatar_url'),
        supabase.from('user_games').select('user_id, total_hours, games(id)').filter('games.is_deleted', 'eq', false).limit(10000),
      ])
      if (cancelled || usersRes.error || gamesRes.error) return

      const agg = {}
      if (gamesRes.data) {
        for (const ug of gamesRes.data) {
          const a = agg[ug.user_id] || { hours: 0 }
          a.hours += ug.total_hours || 0
          agg[ug.user_id] = a
        }
      }
      const userMap = {}
      if (usersRes.data) {
        for (const u of usersRes.data) userMap[u.id] = u
      }

      const list = Object.keys(agg)
        .map((uid) => ({
          user_id: uid,
          username: userMap[uid]?.username || 'Unknown',
          avatar_url: userMap[uid]?.avatar_url || null,
          hours: agg[uid].hours,
        }))
        .sort((a, b) => b.hours - a.hours)

      if (cancelled) return
      setPlayers(list)
      setSelectedPlayer(list.find((p) => p.user_id === session.user.id) || list[0] || null)
    }
    fetchPlayers()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedPlayer) return
    if (selectedPlayer.user_id === myId) {
      setCloudRows(null)
      setCloudError(null)
      setCloudLoading(false)
      return
    }

    let cancelled = false
    async function loadCloud() {
      setCloudLoading(true)
      setCloudError(null)
      await getReadyPromise()
      const { data, error } = await supabase
        .from('user_games')
        .select('game_id, total_hours, is_platinum, historical_playtime, first_played, last_played, date_finished, average_rating, games(id, title, cover_url)')
        .eq('user_id', selectedPlayer.user_id)
        .filter('games.is_deleted', 'eq', false)
        .limit(10000)
      if (cancelled) return

      if (error) {
        setCloudError(error.message)
        setCloudLoading(false)
        return
      }

      const rows = (data || []).map((ug) => ({
        id: ug.game_id,
        title: ug.games?.title || 'Unknown',
        coverImage: ug.games?.cover_url || null,
        playtime: Math.round(ug.total_hours || 0),
        sessions: 0,
        historicalPlaytime: ug.historical_playtime || {},
        lastPlayed: ug.last_played,
        firstPlayed: ug.first_played,
        dateFinished: ug.date_finished,
        isPlatinum: ug.is_platinum || false,
        averageRating: ug.average_rating || null,
        genres: [],
        launchType: null,
        hardwareLogs: [],
      }))

      setCloudRows(rows)
      setCloudLoading(false)
    }
    loadCloud()
    return () => { cancelled = true }
  }, [selectedPlayer, myId])

  const isViewingSelf = !selectedPlayer || selectedPlayer.user_id === myId
  const rows = isViewingSelf ? games : (cloudRows || [])
  const stats = useRewindStats(rows, timeframe, referenceDate)
  const podiumRef = useRef(null)

  useEffect(() => {
    if (podiumRef.current) {
      podiumRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [timeframe, referenceDate])

  function navigatePrev() {
    setReferenceDate((prev) => {
      const d = new Date(prev)
      if (timeframe === 'year') d.setFullYear(d.getFullYear() - 1)
      else if (timeframe === 'month') d.setMonth(d.getMonth() - 1)
      else d.setDate(d.getDate() - 7)
      return d
    })
  }

  function navigateNext() {
    setReferenceDate((prev) => {
      const d = new Date(prev)
      if (timeframe === 'year') d.setFullYear(d.getFullYear() + 1)
      else if (timeframe === 'month') d.setMonth(d.getMonth() + 1)
      else d.setDate(d.getDate() + 7)
      return d
    })
  }

  const isFutureDisabled = (() => {
    const now = new Date()
    if (timeframe === 'year') return referenceDate.getFullYear() >= now.getFullYear()
    if (timeframe === 'month') {
      return referenceDate.getFullYear() > now.getFullYear() ||
        (referenceDate.getFullYear() === now.getFullYear() && referenceDate.getMonth() >= now.getMonth())
    }
    const mon = getMonday(referenceDate)
    const nextMon = new Date(mon)
    nextMon.setDate(nextMon.getDate() + 7)
    return nextMon > now
  })()

  const f = stats.filtered
  const timeframeLabel = timeframe === 'week' ? 'this week' : timeframe === 'month' ? 'this month' : 'this year'

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rewind-tooltip">
        <span className="rewind-tooltip-label">{label}</span>
        <span className="rewind-tooltip-value">{payload[0].value}h</span>
      </div>
    )
  }

  return (
    <div className="rewind">

      {/* Player selector */}
      {players.length > 1 && (
        <div className="rewind-section">
          <div className="rewind-players">
            {players.map((p) => (
              <button
                key={p.user_id}
                className={`rewind-player-chip ${selectedPlayer?.user_id === p.user_id ? 'rewind-player-chip--active' : ''}`}
                onClick={() => setSelectedPlayer(p)}
              >
                <PlayerAvatar url={p.avatar_url} name={p.username} className="rewind-chip-avatar" />
                <span className="rewind-chip-name">{p.username}</span>
                {p.user_id === myId && <span className="sv-you">You</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level 1: Title + Timeframe Controls */}
      <div className="rewind-hero">
        <div className="rewind-hero-content">
          <div className="rewind-hero-year">{referenceDate.getFullYear()}</div>
          <h1 className="rewind-hero-title">
            <span className="rewind-hero-copez">{(selectedPlayer?.username || 'COPEZ').toUpperCase()}</span> REWIND
          </h1>
        </div>
      </div>

      {cloudLoading && (
        <div className="rewind-loading-note">Loading {selectedPlayer?.username || 'player'}&apos;s rewind...</div>
      )}
      {cloudError && (
        <div className="rewind-loading-note rewind-loading-note--error">Could not load rewind: {cloudError}</div>
      )}

      <div className="rewind-section">
        <div className="rewind-controls">
          <div className="rewind-toggles">
            {['year', 'month', 'week'].map((tf) => (
              <button
                key={tf}
                className={`rewind-toggle ${timeframe === tf ? 'rewind-toggle--active' : ''}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>
          <div className="rewind-nav">
            <button className="rewind-nav-btn" onClick={navigatePrev}>&#8249;</button>
            <span className="rewind-nav-label">{stats.headerLabel}</span>
            <button className="rewind-nav-btn" onClick={navigateNext} disabled={isFutureDisabled}>&#8250;</button>
          </div>
        </div>
      </div>

      {/* Level 2: Most Played — Horizontal Podium Scroll */}
      {stats.topGames.length > 0 && (
        <div className="rewind-section">
          <h3 className="rewind-section-subtitle">Games You Played</h3>
          <div ref={podiumRef} className="rewind-podium">
            {stats.topGames.map((game, i) => (
              <div key={game.id} className={`rewind-podium-card rewind-podium-rank-${i < 3 ? i + 1 : 'rest'}`}>
                <div className="rewind-podium-cover">
                  <CoverImage coverImage={game.coverImage} title={game.title} className="rewind-podium-img" games={games} />
                  <div className="rewind-podium-rank-badge">#{i + 1}</div>
                  <div className="rewind-podium-overlay">
                    <span className="rewind-podium-pct">{game.percentage}%</span>
                    <span className="rewind-podium-hours">{Math.round(game.hours)}h played</span>
                  </div>
                </div>
                <h4 className="rewind-podium-title">{game.title}</h4>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Level 3: Playtime Bar Graph */}
      <div className="rewind-section">
        <h3 className="rewind-section-subtitle">Playtime Overview</h3>
        <div className="rewind-chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.graphData} barCategoryGap="20%">
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted, #666)', fontSize: timeframe === 'month' ? 10 : 12 }}
                interval={timeframe === 'month' ? 3 : 0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted, #666)', fontSize: 12 }}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]} fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Level 4: Summary Stats */}
      <div className="rewind-section">
        <div className="rewind-quick-stats">
          <div className="rewind-pill">
            <span className="rewind-pill-value">{f.avgHoursPerWeek}</span>
            <span className="rewind-pill-label">{timeframe === 'week' ? 'hrs this week' : 'hrs / week avg'}</span>
          </div>
          {f.peakMonth && (
            <div className="rewind-pill">
              <span className="rewind-pill-value">{f.peakMonth}</span>
              <span className="rewind-pill-label">peak &middot; {f.peakMonthHours}h</span>
            </div>
          )}
          <div className="rewind-pill">
            <span className="rewind-pill-value">{f.gamesPlayed}</span>
            <span className="rewind-pill-label">games played</span>
          </div>
          <div className="rewind-pill">
            <span className="rewind-pill-value">{f.totalHours.toLocaleString()}</span>
            <span className="rewind-pill-label">total hours</span>
          </div>
        </div>
      </div>

      <div className="rewind-section">
        <div className="rewind-stats-grid">
          <div className="rewind-stat-card">
            <span className="rewind-stat-value">{f.totalHours.toLocaleString()}</span>
            <span className="rewind-stat-label">Total Hours</span>
          </div>
          {isViewingSelf && (
            <div className="rewind-stat-card">
              <span className="rewind-stat-value">{f.totalSessions.toLocaleString()}</span>
              <span className="rewind-stat-label">Total Sessions</span>
            </div>
          )}
          {isViewingSelf && (
            <div className="rewind-stat-card">
              <div className="rewind-input-split">
                <div className="rewind-input-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
                  </svg>
                  <span className="rewind-input-pct">{f.inputSplit.kbm}%</span>
                  <span className="rewind-input-name">Keyboard + Mouse</span>
                </div>
                <div className="rewind-input-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
                    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
                  </svg>
                  <span className="rewind-input-pct">{f.inputSplit.controller}%</span>
                  <span className="rewind-input-name">Controller</span>
                </div>
              </div>
              <span className="rewind-stat-label">Input Split</span>
            </div>
          )}
        </div>
      </div>

      {/* Level 5: Timeframe Insights Grid */}
      <div className="rewind-section">
        <div className="rewind-insights-grid">
          <div className="rewind-insights-left">
            {f.genreDistribution.length > 0 ? (
              <div className="rewind-donut-card">
                <h3 className="rewind-donut-title">Genre Distribution</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={f.genreDistribution}
                      dataKey="percentage"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {f.genreDistribution.map((_, i) => (
                        <Cell key={i} fill={GENRE_COLORS[i % GENRE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<GenreTooltip />} />
                    <Legend content={<GenreLegend />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rewind-donut-card">
                <h3 className="rewind-donut-title">Genre Distribution</h3>
                <p className="rewind-donut-empty">
                  {isViewingSelf
                    ? `No genre data for ${timeframeLabel}. Launch some games to see distribution.`
                    : 'Genre data isn\u2019t synced for other players.'}
                </p>
              </div>
            )}
          </div>

          <div className="rewind-insights-right">
            <div className="rewind-achievements-card">
              <h3 className="rewind-achievements-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
                <span>Platinum Achievements</span>
              </h3>
              {f.platinumGames.length > 0 ? (
                <div className="rewind-platinum-grid">
                  {f.platinumGames.map((game) => (
                    <div key={game.id} className="rewind-platinum-item">
                      <div className="rewind-platinum-cover">
                        <CoverImage coverImage={game.coverImage} title={game.title} games={games} />
                        <div className="rewind-platinum-badge">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                            <path d="M4 22h16" />
                            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                          </svg>
                        </div>
                      </div>
                      <span className="rewind-platinum-name">{game.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rewind-achievements-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                  </svg>
                  <p>No games platinumed {timeframeLabel}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Level 6: Top 10 Rated Games */}
      {stats.topRatedGames.length > 0 && (
        <div className="rewind-section">
          <h3 className="rewind-section-subtitle">Top 10 Rated Games</h3>
          <div className="rewind-rated-grid">
            {stats.topRatedGames.map((game) => (
              <div key={game.id} className="rewind-rated-card">
                <div className="rewind-rated-cover">
                  <CoverImage coverImage={game.coverImage} title={game.title} className="rewind-rated-img" games={games} />
                  <div className="rewind-rated-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span>{game.rating.toFixed(1)}</span>
                  </div>
                </div>
                <h4 className="rewind-rated-title">{game.title}</h4>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Level 7: Lifetime Summary Footer */}
      <div className="rewind-lifetime-divider" />
      <div className="rewind-lifetime-footer">
        <h3 className="rewind-lifetime-footer-title">Lifetime</h3>
        <div className="rewind-lifetime-footer-grid">
          <div className="rewind-lifetime-footer-stat">
            <span className="rewind-lifetime-footer-value">{stats.lifetime.hours.toLocaleString()}</span>
            <span className="rewind-lifetime-footer-label">Hours Played</span>
          </div>
          <div className="rewind-lifetime-footer-stat">
            <span className="rewind-lifetime-footer-value">{stats.lifetime.sessions.toLocaleString()}</span>
            <span className="rewind-lifetime-footer-label">Total Sessions</span>
          </div>
          <div className="rewind-lifetime-footer-stat">
            <span className="rewind-lifetime-footer-value">{stats.lifetime.gamesPlayed.toLocaleString()}</span>
            <span className="rewind-lifetime-footer-label">Games Played</span>
          </div>
          <div className="rewind-lifetime-footer-stat">
            <span className="rewind-lifetime-footer-value">{stats.lifetime.platinumCount.toLocaleString()}</span>
            <span className="rewind-lifetime-footer-label">Games Platinumed</span>
          </div>
        </div>
      </div>

    </div>
  )
}

const GENRE_COLORS = ['#e6c619', '#06d6a0', '#4ea8de', '#b47ede', '#ef476f', '#ff9f1c', '#2ec4b6', '#e76f51']

function GenreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rewind-tooltip">
      <span className="rewind-tooltip-label">{payload[0].name}</span>
      <span className="rewind-tooltip-value">{payload[0].value}%</span>
    </div>
  )
}

function GenreLegend({ payload }) {
  if (!payload?.length) return null
  return (
    <div className="rewind-donut-legend">
      {payload.map((entry, i) => (
        <div key={i} className="rewind-donut-legend-item">
          <span className="rewind-donut-legend-dot" style={{ background: entry.color }} />
          <span className="rewind-donut-legend-name">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default RewindDashboard
