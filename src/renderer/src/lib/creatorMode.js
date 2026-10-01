import { supabase, getReadyPromise } from './supabase'

const RPC_ERROR = {
  'bad-password': 'Wrong admin password.',
  'not-found': 'Game not found in the catalog.',
  'title-exists': 'A game with this title already exists or the title is invalid.',
  'wrong-current': 'Current password is incorrect.',
  'too-short': 'Password must be at least 4 characters.',
  'need-current': 'A current password is required to change it.'
}

async function rpc(name, args) {
  await getReadyPromise()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

export async function creatorIsConfigured() {
  return !!(await rpc('creator_is_configured'))
}

export async function creatorVerify(password) {
  return !!(await rpc('creator_verify_password', { p_password: password }))
}

export async function creatorSetPassword(current, next) {
  const result = await rpc('creator_set_password', { p_current: current, p_new: next })
  if (result !== 'ok') throw new Error(RPC_ERROR[result] || 'Failed to set password.')
  return true
}

export async function creatorRenameGame(gameId, newTitle, password) {
  const result = await rpc('creator_rename_game', {
    p_game_id: gameId,
    p_new_title: newTitle,
    p_password: password
  })
  if (result !== 'ok') throw new Error(RPC_ERROR[result] || 'Failed to rename game.')
  return true
}

export async function creatorDeleteGame(gameId, password) {
  const result = await rpc('creator_delete_game', {
    p_game_id: gameId,
    p_password: password
  })
  if (result !== 'ok') throw new Error(RPC_ERROR[result] || 'Failed to delete game.')
  return true
}

export async function creatorPurgeArtwork(password) {
  const ok = await creatorVerify(password)
  if (!ok) throw new Error('Wrong admin password.')

  const bucket = supabase.storage.from('artwork')
  const paths = []
  async function collect(prefix) {
    const { data, error } = await bucket.list(prefix || '', {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    })
    if (error) throw new Error(error.message)
    for (const item of data || []) {
      if (item.id && item.metadata) {
        paths.push(prefix ? `${prefix}/${item.name}` : item.name)
      } else if (item.id) {
        await collect(prefix ? `${prefix}/${item.name}` : item.name)
      }
    }
  }
  await collect('')

  let count = 0
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error } = await bucket.remove(batch)
    if (error) throw new Error(error.message)
    count += batch.length
  }

  const result = await rpc('creator_purge_artwork', { p_password: password })
  if (result !== 'ok') throw new Error('Wrong admin password.')
  return count
}

export async function creatorListGames(search = '', limit = 200) {
  await getReadyPromise()
  let q = supabase
    .from('games')
    .select('id, title, cover_url')
    .eq('is_deleted', false)
    .order('title')
    .limit(limit)
  const esc = String(search || '').trim()
  if (esc) q = q.ilike('title', `%${esc.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}