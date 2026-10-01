import { useState, useEffect } from 'react'
import { supabase, getReadyPromise } from '../lib/supabase'
import { escapeLike } from '../lib/gameCatalog'

function fmtHours(v) {
  return `${((v || 0) / 3600).toFixed(1)}h`
}

function fmtDate(v) {
  return v
    ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
}

function fmtPct(v) {
  return v ? `${Math.round(v)}%` : '—'
}

function Initial({ name }) {
  return <span>{(name || 'U').charAt(0).toUpperCase()}</span>
}

function StatCompare({ label, myVal, rivalVal, fmt }) {
  const isNum = typeof myVal === 'number' && typeof rivalVal === 'number'
  const max = isNum ? Math.max(myVal, rivalVal, 1) : 1
  const myPct = isNum ? Math.min(100, (myVal / max) * 100) : 0
  const rivalPct = isNum ? Math.min(100, (rivalVal / max) * 100) : 0

  let myAhead = false
  let rivalAhead = false
  if (isNum) {
    myAhead = myVal > rivalVal
    rivalAhead = rivalVal > myVal
  } else {
    const myT = myVal ? new Date(myVal).getTime() : 0
    const rivalT = rivalVal ? new Date(rivalVal).getTime() : 0
    myAhead = myT > rivalT
    rivalAhead = rivalT > myT
  }

  return (
    <div className="rvc-stat">
      <span className="rvc-stat-title">{label}</span>
      <div className="rvc-stat-track">
        <div className={`rvc-stat-half ${myAhead ? 'rvc-stat-half--ahead' : ''}`}>
          <span className="rvc-stat-val">{fmt ? fmt(myVal) : myVal}</span>
          <span className="rvc-stat-bar">
            <span className="rvc-stat-bar-fill rvc-stat-bar-fill--me" style={{ width: `${myPct}%` }} />
          </span>
        </div>
        <span className="rvc-stat-vs">vs</span>
        <div className={`rvc-stat-half rvc-stat-half--rival ${rivalAhead ? 'rvc-stat-half--ahead' : ''}`}>
          <span className="rvc-stat-val">{fmt ? fmt(rivalVal) : rivalVal}</span>
          <span className="rvc-stat-bar">
            <span className="rvc-stat-bar-fill rvc-stat-bar-fill--rival" style={{ width: `${rivalPct}%` }} />
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ComparePanel({ title, rivalId, rivalName, onClose }) {
  const [myStats, setMyStats] = useState(null)
  const [rivalStats, setRivalStats] = useState(null)
  const [myProfile, setMyProfile] = useState(null)
  const [rivalProfile, setRivalProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      await getReadyPromise()
      const result = await supabase.auth.getSession()
      const session = result?.data?.session ?? null
      if (!session) { setLoading(false); return }

      const esc = escapeLike(title)
      const { data: catalogRows } = await supabase
        .from('games')
        .select('id')
        .eq('is_deleted', false)
        .ilike('title', esc)
      const ids = (catalogRows || []).map((c) => c.id)

      const gameQuery = (uid) =>
        ids.length
          ? supabase
              .from('user_games')
              .select('*')
              .eq('user_id', uid)
              .in('game_id', ids)
              .order('total_hours', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: null, error: null })

      const [myGameRes, rivalGameRes, myProfileRes, rivalProfileRes] = await Promise.all([
        gameQuery(session.user.id),
        gameQuery(rivalId),
        supabase.from('users').select('username, avatar_url').eq('id', session.user.id).maybeSingle(),
        supabase.from('users').select('username, avatar_url').eq('id', rivalId).maybeSingle(),
      ])

      if (cancelled) return

      if (myGameRes.error) setError(myGameRes.error.message)
      else setMyStats(myGameRes.data?.[0] ?? null)

      if (rivalGameRes.error) setError(rivalGameRes.error.message)
      else setRivalStats(rivalGameRes.data?.[0] ?? null)

      setMyProfile(myProfileRes.data ?? null)
      setRivalProfile(rivalProfileRes.data ?? null)

      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [title, rivalId])

  if (loading) return <div className="rvc-loading">Loading rivalry...</div>
  if (error) return <div className="rvc-error">{error}</div>

  const myHours = myStats?.total_hours || 0
  const rivalHours = rivalStats?.total_hours || 0
  const lead = myHours === rivalHours ? 'tie' : myHours > rivalHours ? 'me' : 'rival'
  const rivalDisplayName = rivalProfile?.username || rivalName

  const stats = [
    { label: 'Hours Played', myVal: myHours, rivalVal: rivalHours, fmt: fmtHours },
    { label: 'Completion', myVal: myStats?.is_platinum ? 100 : 0, rivalVal: rivalStats?.is_platinum ? 100 : 0, fmt: fmtPct },
    { label: 'First Played', myVal: myStats?.first_played || '', rivalVal: rivalStats?.first_played || '', fmt: fmtDate },
    { label: 'Last Played', myVal: myStats?.last_played || '', rivalVal: rivalStats?.last_played || '', fmt: fmtDate },
    { label: 'Date Finished', myVal: myStats?.date_finished || '', rivalVal: rivalStats?.date_finished || '', fmt: fmtDate },
  ]

  return (
    <div className="rvc-panel">
      <div className="rvc-header">
        <div className="rvc-header-title">
          <span className="rvc-header-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </span>
          <h4 className="rvc-title">Rivalry</h4>
        </div>
        <button className="rvc-close" onClick={onClose} title="Back to community">&#10005;</button>
      </div>

      <div className="rvc-vs">
        <div className={`rvc-vs-side ${lead === 'me' ? 'rvc-vs-side--lead' : ''}`}>
          <span className="rvc-avatar">
            {myProfile?.avatar_url ? (
              <img src={myProfile.avatar_url} alt="" />
            ) : (
              <Initial name="You" />
            )}
          </span>
          <span className="rvc-name">You</span>
          <span className="rvc-sub">{fmtHours(myHours)}</span>
          {lead === 'me' && <span className="rvc-badge">Leading</span>}
        </div>

        <div className="rvc-vs-center">
          <span className="rvc-vs-mid">VS</span>
          {lead === 'tie' && <span className="rvc-vs-tie">Dead Even</span>}
        </div>

        <div className={`rvc-vs-side ${lead === 'rival' ? 'rvc-vs-side--lead' : ''}`}>
          <span className="rvc-avatar">
            {rivalProfile?.avatar_url ? (
              <img src={rivalProfile.avatar_url} alt="" />
            ) : (
              <Initial name={rivalDisplayName} />
            )}
          </span>
          <span className="rvc-name">{rivalDisplayName}</span>
          <span className="rvc-sub">{fmtHours(rivalHours)}</span>
          {lead === 'rival' && <span className="rvc-badge rvc-badge--rival">Leading</span>}
        </div>
      </div>

      <div className="rvc-stats">
        {stats.map((s) => (
          <StatCompare key={s.label} {...s} />
        ))}
      </div>

      <div className="rvc-note">
        {lead === 'me'
          ? 'You\u2019re ahead on hours played. Keep the lead!'
          : lead === 'rival'
            ? `${rivalDisplayName} is ahead on hours played. Close the gap!`
            : 'You and your rival are dead even. Break the tie!'}
      </div>
    </div>
  )
}
