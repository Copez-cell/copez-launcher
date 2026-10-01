import { supabase } from './supabase'

export async function ensureUserProfile() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session ?? null
  if (!session) return

  const meta = session.user?.user_metadata ?? {}
  const username = meta.username || session.user.email?.split('@')[0] || 'user'

  const { error } = await supabase.from('users').upsert(
    {
      id: session.user.id,
      username,
      avatar_url: meta.avatar_url || null,
    },
    { onConflict: 'id' }
  )

  if (error) console.error('ensureUserProfile error:', error.message)
}
