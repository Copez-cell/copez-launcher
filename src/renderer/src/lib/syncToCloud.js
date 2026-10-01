import { supabase } from './supabase'
import { resolveCatalogId } from './gameCatalog'

export async function syncGameToCloud(game) {
  const result = await supabase.auth.getSession()
  const session = result?.data?.session ?? null
  if (!session) return

  const gameId = await resolveCatalogId(game)

  const payload = {
    user_id: session.user.id,
    game_id: gameId,
    total_hours: game.playtime || 0,
    is_platinum: game.isPlatinum || false,
    average_rating: typeof game.averageRating === 'number' ? game.averageRating : null,
    historical_playtime: game.historicalPlaytime || {},
    first_played: game.firstPlayed || null,
    last_played: game.lastPlayed || null,
    date_finished: game.dateFinished || null,
  }

  const { error } = await supabase.from('user_games').upsert(payload, {
    onConflict: 'user_id, game_id',
  })

  if (error) console.error('syncToCloud error:', error)
}
