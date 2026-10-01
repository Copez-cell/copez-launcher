import { useState, useEffect } from 'react'
import { supabase, getReadyPromise } from '../lib/supabase'
import { escapeLike } from '../lib/gameCatalog'
import ComparePanel from './ComparePanel'

function AvatarCluster({ players }) {
  const maxShow = 5
  const visible = players.slice(0, maxShow)
  const rest = players.length - maxShow

  return (
    <div className="lc-avatars">
      {visible.map((p, i) => (
        <div
          key={p.user_id}
          className={`lc-avatar ${p.isMe ? 'lc-avatar--me' : ''}`}
          style={{ zIndex: maxShow - i, marginLeft: i === 0 ? 0 : -8 }}
          title={p.isMe ? 'You' : p.username || 'Unknown'}
        >
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" />
          ) : (
            <span>{(p.username || 'U').charAt(0).toUpperCase()}</span>
          )}
        </div>
      ))}
      {rest > 0 && (
        <div className="lc-avatar lc-avatar--more" title={`${rest} more`}>
          <span>+{rest}</span>
        </div>
      )}
    </div>
  )
}

export default function LeaderboardWidget({ title }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [cloudReady, setCloudReady] = useState(false)
  const [compareRival, setCompareRival] = useState(null)

  useEffect(() => {
    getReadyPromise().then(() => setCloudReady(true))
  }, [])

  useEffect(() => {
    if (!cloudReady || !title) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetch() {
      const result = await supabase.auth.getSession()
      const session = result?.data?.session ?? null
      if (!session) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data: catalogRows } = await supabase
        .from('games')
        .select('id')
        .eq('is_deleted', false)
        .ilike('title', escapeLike(title))
      const ids = (catalogRows || []).map((c) => c.id)
      if (ids.length === 0) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_games')
        .select('user_id, total_hours, is_platinum, first_played, last_played')
        .in('game_id', ids)
        .order('total_hours', { ascending: false })
        .limit(20)

      if (cancelled) return
      if (error || !data || data.length === 0) {
        if (!cancelled) setLoading(false)
        return
      }

      const seen = new Set()
      const uniqueData = data.filter((d) => {
        if (seen.has(d.user_id)) return false
        seen.add(d.user_id)
        return true
      })

      const userIds = uniqueData.map((d) => d.user_id)
      const { data: profiles } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', userIds)

      const profileMap = {}
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url }
        }
      }

      const enriched = uniqueData.map((d) => ({
        ...d,
        username: profileMap[d.user_id]?.username || 'Unknown',
        avatar_url: profileMap[d.user_id]?.avatar_url || null,
        isMe: d.user_id === session.user.id,
      }))

      setPlayers(enriched)
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [cloudReady, title])

  if (loading) return null
  if (players.length === 0) return null

  const totalPlayers = players.length
  const totalHours = players.reduce((s, p) => s + (p.total_hours || 0), 0)
  const maxHours = players.reduce((s, p) => Math.max(s, p.total_hours || 0), 0)
  const shown = players.slice(0, 10)

  if (compareRival) {
    return (
      <ComparePanel
        title={title}
        rivalId={compareRival.id}
        rivalName={compareRival.name}
        onClose={() => setCompareRival(null)}
      />
    )
  }

  return (
    <div className="lc-widget">
      <div className="lc-header">
        <h3 className="detail-section-title">Community</h3>
        <div className="lc-header-right">
          <span className="lc-stat">
            <span className="lc-stat-num">{totalPlayers}</span> players
          </span>
          <span className="lc-stat-divider">·</span>
          <span className="lc-stat">
            <span className="lc-stat-num">{Math.round(totalHours / 3600).toLocaleString()}</span>h total
          </span>
        </div>
      </div>

      <div className="lc-body">
        <AvatarCluster players={players} />

        <div className="lc-list">
          {shown.map((p, i) => (
            <button
              key={p.user_id}
              className={`lc-row ${p.isMe ? 'lc-row--me' : ''}`}
              onClick={() => setCompareRival({ id: p.user_id, name: p.username })}
            >
              <span className="lc-rank">
                {i < 3 ? <span className={`lc-medal lc-medal--${i + 1}`}>{i + 1}</span> : i + 1}
              </span>
              <span className="lc-row-avatar">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" />
                ) : (
                  <span>{(p.username || 'U').charAt(0).toUpperCase()}</span>
                )}
              </span>
              <span className="lc-name">
                <span className="lc-name-text">
                  <span className="lc-name-label">{p.username}</span>
                  {p.isMe && <span className="lc-you">You</span>}
                </span>
                <span className="lc-bar">
                  <span
                    className="lc-bar-fill"
                    style={{ width: `${maxHours ? ((p.total_hours || 0) / maxHours) * 100 : 0}%` }}
                  />
                </span>
              </span>
              {p.is_platinum && <span className="lc-badge" title="Platinum">&#9733;</span>}
              <span className="lc-hours">{((p.total_hours || 0) / 3600).toFixed(1)}h</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lc-footer-hint">
        <span className="lc-footer-icon">&#9889;</span> Click a player to start a rivalry
      </div>
    </div>
  )
}
