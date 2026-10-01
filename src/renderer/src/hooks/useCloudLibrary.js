import { useState, useEffect, useRef } from 'react'
import { supabase, getReadyPromise } from '../lib/supabase'

export default function useCloudLibrary() {
  const [cloudGames, setCloudGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCloudData() {
      setLoading(true)
      const result = await supabase.auth.getSession()
      const session = result?.data?.session ?? null
      if (!session) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_games')
        .select('game_id, total_hours, is_platinum, historical_playtime, first_played, last_played, date_finished, games(id, title, cover_url, banner_url, logo_url)')
        .eq('user_id', session.user.id)
        .filter('games.is_deleted', 'eq', false)

      if (!cancelled) {
        if (error) {
          setError(error.message)
        } else if (data) {
          const mapped = data.map((ug) => ({
            id: ug.game_id,
            playtime: ug.total_hours || 0,
            isPlatinum: ug.is_platinum || false,
            historicalPlaytime: ug.historical_playtime || {},
            firstPlayed: ug.first_played,
            lastPlayed: ug.last_played,
            dateFinished: ug.date_finished,
            title: ug.games?.title,
            coverUrl: ug.games?.cover_url,
            bannerUrl: ug.games?.banner_url,
            logoUrl: ug.games?.logo_url,
          }))
          setCloudGames(mapped)
        }
        setLoading(false)
      }
    }

    getReadyPromise().then(() => {
      if (cancelled) return
      supabase.auth.getSession().then((result) => {
        const sess = result?.data?.session ?? null
        if (sess) fetchCloudData()
        else setLoading(false)
      }).catch(() => setLoading(false))
    })

    getReadyPromise().then(() => {
      if (cancelled) return
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') fetchCloudData()
        if (event === 'SIGNED_OUT') setCloudGames([])
      })
      unsubRef.current = () => listener?.subscription?.unsubscribe()
    })

    return () => {
      cancelled = true
      unsubRef.current?.()
    }
  }, [])

  return { cloudGames, loading, error }
}
