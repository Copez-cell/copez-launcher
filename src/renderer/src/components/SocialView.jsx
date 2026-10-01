import { useState, useEffect } from 'react'
import { supabase, getReadyPromise } from '../lib/supabase'
import { getRatingColor } from '../utils/ratingColor'

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

function GamepadIcon() {
  return (
    <svg
      className="cp-pick-icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  )
}

function GameArtwork({ title, coverUrl, games, className, fallbackClassName, icon }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)

    const local = (games || []).find(
      (g) => g.title && title && g.title.toLowerCase() === title.toLowerCase() && g.coverImage
    )

    if (local?.coverImage) {
      window.api.artwork.getUrl(local.coverImage).then((u) => {
        if (!cancelled && u) setSrc(u)
      })
    } else if (coverUrl) {
      setSrc(coverUrl)
    }

    return () => {
      cancelled = true
    }
  }, [title, coverUrl, games])

  if (!src) {
    if (icon) return <span className="cp-pick-icon"><GamepadIcon /></span>
    return <span className={fallbackClassName} />
  }

  return <img src={src} alt="" className={className} onError={() => setSrc(null)} />
}

function fmtHours(sec) {
  const h = (sec || 0) / 3600
  return h ? `${h.toFixed(1)}h` : '0h'
}

function fmtDate(d) {
  if (!d) return 'Unknown'
  const date = new Date(d)
  if (isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

function GameTile({ game, games, showHours, showPlat }) {
  const rating = game.average_rating || 0
  return (
    <div className="pp-tile">
      <GameArtwork
        title={game.games?.title}
        coverUrl={game.games?.cover_url}
        games={games}
        className="pp-cover"
        fallbackClassName="pp-cover pp-cover--fallback"
      />
      {showPlat && game.is_platinum && (
        <span className="pp-plat" title="Platinumed">&#9733;</span>
      )}
      <span className="pp-tile-title">{game.games?.title || 'Unknown'}</span>
      <div className="pp-tile-meta">
        <span className="pp-tile-rating" style={{ color: getRatingColor(rating) }}>
          {rating.toFixed(1)}
        </span>
        {showHours && <span className="pp-tile-hours">{fmtHours(game.total_hours)}</span>}
      </div>
    </div>
  )
}

export default function SocialView({ games = [] }) {
  const [tab, setTab] = useState('leaderboard')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [compare, setCompare] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [myId, setMyId] = useState(null)
  const [myProfile, setMyProfile] = useState(null)
  const [selfCompare, setSelfCompare] = useState(false)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileGames, setProfileGames] = useState([])
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      await getReadyPromise()
      const { data } = await supabase.auth.getSession()
      const session = data?.session ?? null
      if (!session) {
        setLoading(false)
        return
      }
      setMyId(session.user.id)

      const [usersRes, gamesRes] = await Promise.all([
        supabase.from('users').select('id, username, avatar_url, banner_url, created_at'),
        supabase.from('user_games').select('user_id, total_hours, is_platinum, last_played, games(id, title, cover_url)').filter('games.is_deleted', 'eq', false).limit(10000),
      ])

      if (cancelled) return

      if (gamesRes.error || usersRes.error) {
        setError(gamesRes.error?.message || usersRes.error?.message)
        setLoading(false)
        return
      }

      const agg = {}
      if (gamesRes.data) {
        for (const ug of gamesRes.data) {
          const a = agg[ug.user_id] || { totalHours: 0, gameCount: 0, platinum: 0, lastActive: null, lastGame: null }
          a.totalHours += ug.total_hours || 0
          a.gameCount += 1
          if (ug.is_platinum) a.platinum += 1
          const ts = ug.last_played ? new Date(ug.last_played).getTime() : 0
          if (ts && (!a.lastActive || ts > new Date(a.lastActive).getTime())) {
            a.lastActive = ug.last_played
            if (ug.games) a.lastGame = { title: ug.games.title, cover_url: ug.games.cover_url }
          }
          agg[ug.user_id] = a
        }
      }

      const userMap = {}
      if (usersRes.data) {
        for (const u of usersRes.data) userMap[u.id] = u
      }
      setMyProfile(userMap[session.user.id] || { username: 'You' })

      const combined = Object.keys(agg).map((uid) => ({
        user_id: uid,
        username: userMap[uid]?.username || 'Unknown',
        avatar_url: userMap[uid]?.avatar_url || null,
        banner_url: userMap[uid]?.banner_url || null,
        created_at: userMap[uid]?.created_at || null,
        ...agg[uid],
      }))
      combined.sort((a, b) => b.totalHours - a.totalHours)

      setPlayers(combined)
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  async function openProfile(player) {
    setProfilePlayer(player)
    setProfileGames([])
    setProfileLoading(true)

    await getReadyPromise()

    const { data, error } = await supabase
      .from('user_games')
      .select('game_id, total_hours, average_rating, is_platinum, last_played, games(id, title, cover_url)')
      .eq('user_id', player.user_id)
      .filter('games.is_deleted', 'eq', false)
      .order('total_hours', { ascending: false })

    const rows = error ? [] : (data || [])
    setProfileGames(rows)
    setProfileLoading(false)
  }

  function closeProfile() {
    setProfilePlayer(null)
    setProfileGames([])
  }

  async function openCompare(player) {
    setSelected(player)
    setSelfCompare(player.user_id === myId)
    setCompareLoading(true)
    setCompare(null)

    if (player.user_id === myId) {
      setCompareLoading(false)
      return
    }

    await getReadyPromise()

    const [theirRes, myRes, theirTop, myTop, theirMost, myMost] = await Promise.all([
      supabase.from('user_games')
        .select('total_hours, is_platinum')
        .eq('user_id', player.user_id),
      supabase.from('user_games')
        .select('total_hours, is_platinum')
        .eq('user_id', myId),
      supabase.from('user_games')
        .select('total_hours, average_rating, games(id, title, cover_url)')
        .eq('user_id', player.user_id)
        .filter('games.is_deleted', 'eq', false)
        .order('average_rating', { ascending: false, nullsFirst: false })
        .limit(3),
      supabase.from('user_games')
        .select('total_hours, average_rating, games(id, title, cover_url)')
        .eq('user_id', myId)
        .filter('games.is_deleted', 'eq', false)
        .order('average_rating', { ascending: false, nullsFirst: false })
        .limit(3),
      supabase.from('user_games')
        .select('total_hours, games(id, title, cover_url)')
        .eq('user_id', player.user_id)
        .filter('games.is_deleted', 'eq', false)
        .order('total_hours', { ascending: false })
        .limit(1),
      supabase.from('user_games')
        .select('total_hours, games(id, title, cover_url)')
        .eq('user_id', myId)
        .filter('games.is_deleted', 'eq', false)
        .order('total_hours', { ascending: false })
        .limit(1),
    ])

    const theirRows = theirRes.data || []
    const myRows = myRes.data || []

    const theirAgg = {
      totalHours: theirRows.reduce((s, r) => s + (r.total_hours || 0), 0),
      gameCount: theirRows.length,
      platinum: theirRows.filter((r) => r.is_platinum).length,
    }
    const myAgg = {
      totalHours: myRows.reduce((s, r) => s + (r.total_hours || 0), 0),
      gameCount: myRows.length,
      platinum: myRows.filter((r) => r.is_platinum).length,
    }

    const theirTopRated = theirTop.error ? [] : theirTop.data || []
    const myTopRated = myTop.error ? [] : myTop.data || []
    const theirMostPlayed = theirMost.error ? null : theirMost.data?.[0] || null
    const myMostPlayed = myMost.error ? null : myMost.data?.[0] || null

    setCompare({ theirAgg, myAgg, theirTopRated, myTopRated, theirMostPlayed, myMostPlayed })
    setCompareLoading(false)
  }

  if (loading) {
    return <div className="sv-loading">Loading community...</div>
  }

  if (error) {
    return (
      <div className="sv-empty sv-empty--error">
        Could not load community stats: {error}
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="sv-empty">
        No community stats yet. Play some games to appear here.
      </div>
    )
  }

  return (
    <div className="sv-view">
      <div className="sv-container">
        <div className="sv-tabs">
          <button
            className={`sv-tab ${tab === 'leaderboard' ? 'sv-tab--active' : ''}`}
            onClick={() => setTab('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`sv-tab ${tab === 'members' ? 'sv-tab--active' : ''}`}
            onClick={() => setTab('members')}
          >
            Members
          </button>
        </div>

        {tab === 'leaderboard' && (
          <>
            <div className="lb-header">
              <h3 className="detail-section-title">Community Leaderboard</h3>
              <span className="lb-stats">{players.length} players</span>
            </div>

            <div className="sv-list">
              {players.map((p, i) => {
                const rank = i + 1
                return (
                  <button
                    key={p.user_id}
                    className={`sv-card ${selected?.user_id === p.user_id ? 'sv-card--active' : ''} ${rank === 1 ? 'sv-card--first' : ''}`}
                    onClick={() => openCompare(p)}
                  >
                    <span className={`sv-rank ${rank <= 3 ? `sv-rank--top sv-rank--${rank}` : ''}`}>
                      {rank}
                    </span>

                    <PlayerAvatar url={p.avatar_url} name={p.username} />

                    <span className="sv-name">
                      {p.username}
                      {p.user_id === myId && <span className="sv-you">You</span>}
                    </span>

                    <span className="sv-stats">
                      <span className="sv-stat" title={`${p.platinum} platinumed`}>
                        <span className="sv-stat-value sv-stat-value--stars">{p.platinum}</span>
                        <span className="sv-stat-label">Stars</span>
                      </span>
                      <span className="sv-stat">
                        <span className="sv-stat-value">{p.gameCount}</span>
                        <span className="sv-stat-label">Games</span>
                      </span>
                      <span className="sv-stat">
                        <span className="sv-stat-value">{fmtHours(p.totalHours)}</span>
                        <span className="sv-stat-label">Hours</span>
                      </span>
                    </span>

                    <span className="sv-lastgame">
                      {p.lastGame ? (
                        <>
                          <GameArtwork
                            title={p.lastGame.title}
                            coverUrl={p.lastGame.cover_url}
                            games={games}
                            className="sv-lastgame-bg"
                            fallbackClassName="sv-lastgame-bg sv-lastgame-bg--fallback"
                          />
                          <span className="sv-lastgame-overlay" />
                          <span className="sv-lastgame-label">Last played</span>
                          <span className="sv-lastgame-name">{p.lastGame.title || 'Unknown'}</span>
                        </>
                      ) : (
                        <span className="sv-lastgame-empty">Never played</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {selected && (
              <div className="cp-card">
                <button className="cp-close" onClick={() => setSelected(null)}>&#10005;</button>

                {selfCompare ? (
                  <div className="cp-self">
                    <div className="cp-self-icon">&#9670;</div>
                    <p className="cp-self-title">You vs You?</p>
                    <p className="cp-self-sub">No need to battle yourself. Pick another player to start a rivalry.</p>
                  </div>
                ) : compareLoading ? (
                  <div className="cp-loading">Loading stats...</div>
                ) : compare ? (
                  <>
                    <div className="cp-vs">
                      <div className="cp-vs-side">
                        <PlayerAvatar
                          url={myProfile?.avatar_url}
                          name={myProfile?.username || 'You'}
                          className="cp-vs-avatar"
                        />
                        <span className="cp-vs-name">
                          {myProfile?.username || 'You'}
                          <span className="sv-you">You</span>
                        </span>
                      </div>
                      <span className="cp-vs-mid">VS</span>
                      <div className="cp-vs-side">
                        <PlayerAvatar url={selected.avatar_url} name={selected.username} className="cp-vs-avatar" />
                        <span className="cp-vs-name">{selected.username}</span>
                      </div>
                    </div>

                    <div className="cp-battles">
                      <StatBattle
                        label="Hours Played"
                        my={compare.myAgg.totalHours}
                        rival={compare.theirAgg.totalHours}
                        fmt={fmtHours}
                      />
                      <StatBattle
                        label="Games Owned"
                        my={compare.myAgg.gameCount}
                        rival={compare.theirAgg.gameCount}
                        fmt={(v) => `${v}`}
                      />
                      <StatBattle
                        label="Platinum Stars"
                        my={compare.myAgg.platinum}
                        rival={compare.theirAgg.platinum}
                        fmt={(v) => `${v}`}
                      />
                    </div>

                    <div className="cp-picks">
                      <PicksColumn
                        title={myProfile?.username || 'You'}
                        mostPlayed={compare.myMostPlayed}
                        topRated={compare.myTopRated}
                        games={games}
                      />
                      <PicksColumn
                        title={selected.username}
                        mostPlayed={compare.theirMostPlayed}
                        topRated={compare.theirTopRated}
                        games={games}
                      />
                    </div>
                  </>
                ) : (
                  <div className="cp-loading">No data to compare.</div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'members' && !profilePlayer && (
          <>
            <div className="lb-header">
              <h3 className="detail-section-title">Members</h3>
              <span className="lb-stats">{players.length} players</span>
            </div>

            <div className="mb-grid">
              {players.map((p) => (
                <button key={p.user_id} className="mb-card" onClick={() => openProfile(p)}>
                  <div className="mb-banner">
                    {p.banner_url ? (
                      <img src={p.banner_url} alt="" className="mb-banner-img" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    ) : (
                      <div className="mb-banner mb-banner--fallback" />
                    )}
                    <div className="mb-banner-overlay" />
                  </div>
                  <div className="mb-body">
                    <PlayerAvatar url={p.avatar_url} name={p.username} className="mb-avatar" />
                    <span className="mb-name">
                      {p.username}
                      {p.user_id === myId && <span className="sv-you">You</span>}
                    </span>
                    <span className="mb-since">Member since {fmtDate(p.created_at)}</span>
                    <div className="mb-stats">
                      <span className="mb-stat">
                        <span className="mb-stat-value">{p.gameCount}</span>
                        <span className="mb-stat-label">Games</span>
                      </span>
                      <span className="mb-stat">
                        <span className="mb-stat-value">{fmtHours(p.totalHours)}</span>
                        <span className="mb-stat-label">Hours</span>
                      </span>
                      <span className="mb-stat">
                        <span className="mb-stat-value">{p.platinum}</span>
                        <span className="mb-stat-label">Stars</span>
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'members' && profilePlayer && (
          <div className="pr-card">
            <button className="cp-close" onClick={closeProfile}>&#10005;</button>

            <div className="pr-banner">
              {profilePlayer.banner_url ? (
                <img src={profilePlayer.banner_url} alt="" className="pr-banner-img" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <div className="pr-banner pr-banner--fallback" />
              )}
              <div className="pr-banner-overlay" />
            </div>

            <div className="pr-head">
              <PlayerAvatar url={profilePlayer.avatar_url} name={profilePlayer.username} className="pr-avatar" />
              <div className="pr-head-info">
                <h4 className="pr-name">
                  {profilePlayer.username}
                  {profilePlayer.user_id === myId && <span className="sv-you">You</span>}
                </h4>
                <span className="pr-sub">Member since {fmtDate(profilePlayer.created_at)}</span>
              </div>
              <div className="pr-stats">
                <div className="pr-stat">
                  <span className="pr-stat-value">{profileGames.length || profilePlayer.gameCount}</span>
                  <span className="pr-stat-label">Games</span>
                </div>
                <div className="pr-stat">
                  <span className="pr-stat-value">
                    {profileLoading ? '...' : fmtHours(profileGames.reduce((s, g) => s + (g.total_hours || 0), 0))}
                  </span>
                  <span className="pr-stat-label">Hours</span>
                </div>
                <div className="pr-stat">
                  <span className="pr-stat-value">
                    {profileLoading ? '...' : profileGames.filter((g) => g.is_platinum).length}
                  </span>
                  <span className="pr-stat-label">Stars</span>
                </div>
              </div>
              <div className="pr-actions">
                <button className="pr-compare" onClick={() => { setTab('leaderboard'); openCompare(profilePlayer) }}>
                  &#9878; Compare vs Me
                </button>
                <button className="pr-back" onClick={closeProfile}>
                  &#8592; Members
                </button>
              </div>
            </div>

            {profilePlayer.user_id !== myId && (
              <div className="pr-section">
                <h5 className="pr-section-title">Games From {profilePlayer.username} You Haven't Played</h5>
                {profileLoading ? (
                  <div className="cp-loading">Loading games...</div>
                ) : (
                  (() => {
                    const myTitles = new Set(
                      (games || [])
                        .map((g) => String(g.title || '').trim().toLowerCase())
                        .filter(Boolean)
                    )
                    const notPlayed = profileGames
                      .filter((g) => {
                        const title = String(g.games?.title || '').trim().toLowerCase()
                        return title && !myTitles.has(title)
                      })
                      .sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0))
                      .slice(0, 5)
                    return notPlayed.length === 0 ? (
                      <div className="pr-empty">You've played every game this player has.</div>
                    ) : (
                      <div className="pr-grid">
                        {notPlayed.map((g) => (
                          <GameTile key={g.game_id || g.games?.id} game={g} games={games} showHours={false} showPlat />
                        ))}
                      </div>
                    )
                  })()
                )}
              </div>
            )}

            <div className="pr-section">
              <h5 className="pr-section-title">All Games ({profileLoading ? '...' : profileGames.length})</h5>
              {profileLoading ? (
                <div className="cp-loading">Loading games...</div>
              ) : profileGames.length === 0 ? (
                <div className="pr-empty">
                  {profilePlayer.user_id === myId
                    ? 'Your profile has no synced games yet.'
                    : 'This player has no games synced yet.'}
                </div>
              ) : (
                <div className="pr-grid">
                  {profileGames.map((g) => (
                    <GameTile key={g.game_id || g.games?.id} game={g} games={games} showHours showPlat />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PicksColumn({ title, mostPlayed, topRated, games }) {
  return (
    <div className="cp-picks-col">
      <h5 className="cp-col-title cp-picks-col-title">
        <span className="cp-col-icon">&#9733;</span> {title}
      </h5>

      <span className="cp-picks-tag">Most played</span>
      {mostPlayed?.games ? (
        <div className="cp-picks-most">
          <GameArtwork
            title={mostPlayed.games.title}
            coverUrl={mostPlayed.games.cover_url}
            games={games}
            className="cp-pick-art"
            icon
          />
          <div className="cp-picks-most-info">
            <span className="cp-picks-name">{mostPlayed.games.title}</span>
            <span className="cp-picks-hours">{fmtHours(mostPlayed.total_hours)}</span>
          </div>
        </div>
      ) : (
        <span className="cp-picks-empty">No data</span>
      )}

      <span className="cp-picks-tag">Top rated</span>
      <div className="cp-picks-list">
        {topRated && topRated.length > 0 ? (
          topRated.map((f) => (
            <div key={f.game_id || f.games?.id} className="cp-picks-row">
              <GameArtwork
                title={f.games?.title}
                coverUrl={f.games?.cover_url}
                games={games}
                className="cp-pick-art cp-pick-art--sm"
                icon
              />
              <span className="cp-picks-name cp-picks-name--sm">{f.games?.title || 'Unknown'}</span>
              <span
                className="cp-picks-rating"
                style={{ color: getRatingColor(f.average_rating || 0) }}
              >
                {(f.average_rating || 0).toFixed(1)}
              </span>
            </div>
          ))
        ) : (
          <span className="cp-picks-empty">No ratings yet</span>
        )}
      </div>
    </div>
  )
}

function StatBattle({ label, my, rival, fmt }) {
  const total = my + rival
  const myPct = total > 0 ? (my / total) * 100 : 50
  const rivalPct = total > 0 ? (rival / total) * 100 : 50
  const myWins = my > rival
  const rivalWins = rival > my
  return (
    <div className="cp-battle">
      <div className="cp-battle-row">
        <span className={`cp-battle-value cp-battle-value--me ${myWins ? 'cp-battle-value--win' : ''}`}>
          {fmt(my)}
        </span>
        <span className="cp-battle-label">{label}</span>
        <span className={`cp-battle-value cp-battle-value--rival ${rivalWins ? 'cp-battle-value--win' : ''}`}>
          {fmt(rival)}
        </span>
      </div>
      <div className="cp-bar">
        <span className="cp-bar-center" />
        <span
          className={`cp-bar-fill cp-bar-fill--me ${myWins ? 'cp-bar-fill--win' : ''}`}
          style={{ width: `${myPct}%` }}
        />
        <span
          className={`cp-bar-fill cp-bar-fill--rival ${rivalWins ? 'cp-bar-fill--win' : ''}`}
          style={{ width: `${rivalPct}%` }}
        />
      </div>
    </div>
  )
}
