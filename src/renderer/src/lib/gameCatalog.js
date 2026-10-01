import { supabase } from './supabase'

export const escapeLike = (s) => String(s || '').replace(/[\\%_]/g, (c) => `\\${c}`)

export async function resolveCatalogId(game) {
  const title = String(game.title || '').trim()
  if (!title) return game.id

  const esc = escapeLike(title)
  const { data } = await supabase.from('games').select('id').ilike('title', esc).maybeSingle()
  if (data?.id) return data.id

  const { error } = await supabase
    .from('games')
    .upsert(
      { id: game.id, title: game.title, cover_url: null, banner_url: null },
      { onConflict: 'id' }
    )
  if (!error) return game.id

  const { data: again } = await supabase.from('games').select('id').ilike('title', esc).maybeSingle()
  return again?.id || game.id
}
