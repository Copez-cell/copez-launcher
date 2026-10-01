import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function ProfileCard({ onViewChange }) {
  const [session, setSession] = useState(null)
  const [avatarErrored, setAvatarErrored] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener?.subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    setAvatarErrored(false)
  }, [session?.user?.user_metadata?.avatar_url])

  if (!session) return null

  const meta = session.user?.user_metadata ?? {}
  const displayName = meta.username || session.user?.email?.split('@')[0] || 'User'
  const initial = displayName.charAt(0).toUpperCase()
  const email = session.user?.email ?? ''
  const avatarUrl = meta.avatar_url

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="profile-card">
      <button
        className="profile-card-main"
        onClick={() => onViewChange?.('profile')}
        title="Profile Settings"
      >
        <div className="profile-card-avatar">
          {avatarUrl && !avatarErrored ? (
            <img
              src={avatarUrl}
              alt=""
              onError={() => setAvatarErrored(true)}
              className="profile-card-avatar-img"
            />
          ) : (
            initial
          )}
        </div>
        <div className="profile-card-info">
          <span className="profile-card-email" title={displayName}>{displayName}</span>
          <span className="profile-card-status">Online</span>
        </div>
      </button>
      <button className="profile-card-logout" onClick={handleSignOut} title="Sign out">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 2.5H3.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1H5" />
          <path d="M9 9.5L11.5 7 9 4.5" />
          <path d="M11.5 7H5" />
        </svg>
      </button>
    </div>
  )
}

export default ProfileCard
