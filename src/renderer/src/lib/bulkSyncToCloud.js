import { supabase } from './supabase'
import { ensureUserProfile } from './ensureUserProfile'
import { resolveCatalogId } from './gameCatalog'

export async function bulkSyncGamesToCloud(games) {
  const { data } = await supabase.auth.getSession()
  const session = data?.session ?? null
  if (!session) return { synced: 0, errors: 0 }

  await ensureUserProfile()

  const valid = (games || []).filter((g) => g && g.id && g.title)
  if (valid.length === 0) return { synced: 0, errors: 0 }

  const payloads = []
  for (const g of valid) {
    const gameId = await resolveCatalogId(g)
    payloads.push({
      user_id: session.user.id,
      game_id: gameId,
      total_hours: g.playtime || 0,
      is_platinum: g.isPlatinum || false,
      average_rating: typeof g.averageRating === 'number' ? g.averageRating : null,
      historical_playtime: g.historicalPlaytime || {},
      first_played: g.firstPlayed || null,
      last_played: g.lastPlayed || null,
      date_finished: g.dateFinished || null,
    })
  }

  let synced = 0
  let errors = 0

  const { error: uErr } = await supabase.from('user_games').upsert(payloads, {
    onConflict: 'user_id, game_id',
  })

  if (uErr) {
    for (const p of payloads) {
      const { error } = await supabase.from('user_games').upsert(p, { onConflict: 'user_id, game_id' })
      if (error) errors++
      else synced++
    }
  } else {
    synced = valid.length
  }

  return { synced, errors }
}
