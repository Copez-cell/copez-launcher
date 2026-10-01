import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getRatingColor } from '../utils/ratingColor'
import ImageAdjustModal from './ImageAdjustModal'

function getStoragePathFromUrl(publicUrl) {
  if (!publicUrl) return null
  try {
    const marker = '/object/public/avatars/'
    const idx = publicUrl.indexOf(marker)
    if (idx === -1) return null
    return publicUrl.slice(idx + marker.length)
  } catch {
    return null
  }
}

async function removeStoredObject(publicUrl) {
  const path = getStoragePathFromUrl(publicUrl)
  if (!path) return
  await supabase.storage.from('avatars').remove([path])
}

function RatedGameCover({ game }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    const cover = game?.coverImage
    if (!cover) return
    if (/^https?:\/\//i.test(cover)) {
      setSrc(cover)
    } else {
      window.api.artwork.getUrl(cover).then((u) => {
        if (!cancelled && u) setSrc(u)
      })
    }
    return () => { cancelled = true }
  }, [game?.coverImage])

  if (src) {
    return <img src={src} alt="" className="profile-rated-img" onError={() => setSrc(null)} />
  }
  return (
    <div className="profile-rated-fallback">
      <span>{(game?.title || 'G').charAt(0).toUpperCase()}</span>
    </div>
  )
}

function AvatarPreview({ url, username, big }) {
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    setErrored(false)
  }, [url])

  const initial = (username || 'U').charAt(0).toUpperCase()
  const size = big ? 'w-28 h-28' : 'w-20 h-20'
  const textSize = big ? 'text-4xl' : 'text-2xl'

  if (!url || errored) {
    return (
      <div className={`${size} rounded-2xl bg-[#06d6a0]/10 border border-[#06d6a0]/30 shadow-[0_0_15px_rgba(6,214,160,0.15)]`}>
        <div className={`w-full h-full flex items-center justify-center ${textSize} font-black text-[#06d6a0]`}>
          {initial}
        </div>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      onError={() => setErrored(true)}
      className={`${size} rounded-2xl object-cover border border-[#06d6a0]/30 shadow-[0_0_15px_rgba(6,214,160,0.15)]`}
    />
  )
}

export default function ProfilePage({ user, onBack, games = [] }) {
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [adjust, setAdjust] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const fileInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const originalAvatarRef = useRef('')
  const originalBannerRef = useRef('')
  const localObjectUrlRef = useRef(null)

  const previewAvatarUrl = pendingPreview?.kind === 'avatar' ? pendingPreview.url : null
  const previewBannerUrl = pendingPreview?.kind === 'banner' ? pendingPreview.url : null

  const email = user?.email ?? ''
  const userId = user?.id

  const topRated = useMemo(() => {
    return (games || [])
      .filter((g) => (g.averageRating || 0) > 0)
      .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
      .slice(0, 10)
  }, [games])

  useEffect(() => {
    if (user?.user_metadata) {
      setUsername(user.user_metadata.username ?? '')
      setAvatarUrl(user.user_metadata.avatar_url ?? '')
      originalAvatarRef.current = user.user_metadata.avatar_url ?? ''
    }
  }, [user])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('users')
      .select('banner_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data?.banner_url) {
          setBannerUrl(data.banner_url)
          originalBannerRef.current = data.banner_url
        } else {
          originalBannerRef.current = ''
        }
      })
    return () => { cancelled = true }
  }, [userId])

  const clearMessages = useCallback(() => {
    setMessage(null)
    setError(null)
  }, [])

  const startLocalPreview = useCallback((file, kind) => {
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current)
    const url = URL.createObjectURL(file)
    localObjectUrlRef.current = url
    setPendingPreview({ url, kind })
  }, [])

  const stopLocalPreview = useCallback(() => {
    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current)
      localObjectUrlRef.current = null
    }
    setPendingPreview(null)
  }, [])

  useEffect(() => {
    return () => {
      if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(clearMessages, 4000)
      return () => clearTimeout(timer)
    }
  }, [message, error, clearMessages])

  async function handleUpload(file) {
    if (!file || !userId) return
    setUploading(true)
    clearMessages()

    const MAX_SIZE = 1 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      setError('Image must be under 1MB')
      stopLocalPreview()
      setUploading(false)
      return
    }

    const ext = file.name.split('.').pop() || 'png'
    const fileName = `${Date.now()}.${ext}`
    const filePath = `${userId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      stopLocalPreview()
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const { error: metaError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl }
    })
    if (metaError) {
      setError(metaError.message)
      stopLocalPreview()
      setUploading(false)
      return
    }

    const { error: profileError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    const { data: objects } = await supabase.storage.from('avatars').list(userId)
    const stale = (objects || [])
      .filter((o) => !o.name.startsWith('banner-') && o.name !== fileName)
      .map((o) => `${userId}/${o.name}`)
    if (stale.length) {
      await supabase.storage.from('avatars').remove(stale)
    }

    setAvatarUrl(publicUrl)
    stopLocalPreview()
    setUploading(false)
    if (profileError) {
      setError(profileError.message)
    } else {
      originalAvatarRef.current = publicUrl
      setMessage('Avatar uploaded')
    }
  }

  async function handleBannerUpload(file) {
    if (!file || !userId) return
    setBannerUploading(true)
    clearMessages()

    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      setError('Banner must be under 5MB')
      stopLocalPreview()
      setBannerUploading(false)
      return
    }

    const ext = file.name.split('.').pop() || 'png'
    const fileName = `${Date.now()}.${ext}`
    const filePath = `${userId}/banner-${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      stopLocalPreview()
      setBannerUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const { error: profileError } = await supabase
      .from('users')
      .update({ banner_url: publicUrl })
      .eq('id', userId)

    const { data: objects } = await supabase.storage.from('avatars').list(userId)
    const stale = (objects || [])
      .filter((o) => o.name.startsWith('banner-') && o.name !== `banner-${fileName}`)
      .map((o) => `${userId}/${o.name}`)
    if (stale.length) {
      await supabase.storage.from('avatars').remove(stale)
    }

    setBannerUrl(publicUrl)
    stopLocalPreview()
    setBannerUploading(false)
    if (profileError) {
      setError(profileError.message)
    } else {
      originalBannerRef.current = publicUrl
      setMessage('Banner uploaded')
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    clearMessages()

    const meta = user?.user_metadata ?? {}
    const lastChanged = meta.username_last_changed
    const originalUsername = meta.username ?? ''

    const usernameChanged = username !== originalUsername

    if (usernameChanged && lastChanged) {
      const diff = Date.now() - new Date(lastChanged).getTime()
      const daysSince = diff / (1000 * 60 * 60 * 24)
      if (daysSince < 7) {
        const remaining = Math.ceil(7 - daysSince)
        setError(`You can change your username again in ${remaining} day${remaining === 1 ? '' : 's'}`)
        setLoading(false)
        return
      }
    }

    const updateData = { username, avatar_url: avatarUrl }

    if (usernameChanged || !meta.username_last_changed) {
      updateData.username_last_changed = new Date().toISOString()
    } else {
      updateData.username_last_changed = meta.username_last_changed
    }

    const { error: updateError } = await supabase.auth.updateUser({ data: updateData })

    if (updateError) {
      setError(updateError.message)
    } else {
      await supabase
        .from('users')
        .update({ username, avatar_url: avatarUrl, banner_url: bannerUrl || null })
        .eq('id', userId)

      if (originalAvatarRef.current && originalAvatarRef.current !== avatarUrl) {
        await removeStoredObject(originalAvatarRef.current)
      }
      if (originalBannerRef.current && originalBannerRef.current !== (bannerUrl || '')) {
        await removeStoredObject(originalBannerRef.current)
      }

      originalAvatarRef.current = avatarUrl
      originalBannerRef.current = bannerUrl || ''

      setMessage('Profile updated successfully')
    }

    setLoading(false)
  }

  return (
    <div className="settings-page">
      {message && (
        <div className="mb-4 p-3 rounded-xl text-xs text-center bg-[#06d6a0]/10 border border-[#06d6a0]/20 text-[#06d6a0]">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
          {error}
        </div>
      )}

      <div className="settings-section">
        <h3 className="settings-section-title">Profile Banner</h3>
        <div className="settings-row">
          <div className="flex items-center gap-4">
            <div className="pr-banner-preview">
              {(previewBannerUrl || bannerUrl) ? (
                <>
                  <img
                    src={previewBannerUrl || bannerUrl}
                    alt=""
                    onError={(e) => { if (!previewBannerUrl) e.currentTarget.style.display = 'none' }}
                  />
                  {bannerUploading && <div className="pr-upload-overlay">Uploading&hellip;</div>}
                </>
              ) : (
                <span>No banner</span>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label className="settings-label">Image URL</label>
              <div className="pi-wrap">
                <input
                  type="url"
                  placeholder="https://example.com/banner.jpg"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  className="pi-input"
                />
              </div>
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setAdjust({ file, type: 'banner' })
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={bannerUploading}
              className="settings-pill active bg-[#06d6a0] text-[#0d0d0d] font-bold border-none text-xs"
            >
              {bannerUploading ? 'Uploading...' : 'Upload Banner'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Avatar</h3>
        <div className="settings-row">
          <div className="flex items-center gap-4">
            <div className="relative inline-block rounded-2xl overflow-hidden">
            <AvatarPreview url={previewAvatarUrl || avatarUrl} username={username} big />
            {uploading && <div className="pr-upload-overlay">Uploading&hellip;</div>}
          </div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label className="settings-label">Image URL</label>
              <div className="pi-wrap">
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="pi-input"
                />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setAdjust({ file, type: 'avatar' })
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="settings-pill active bg-[#06d6a0] text-[#0d0d0d] font-bold border-none text-xs"
            >
              {uploading ? 'Uploading...' : 'Upload Image'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Top 10 Rated Games</h3>
        {topRated.length > 0 ? (
          <div className="profile-rated-scroll">
            {topRated.map((game, i) => (
              <div key={game.id} className="profile-rated-card">
                <div className="profile-rated-cover">
                  <span className="profile-rated-rank">{i + 1}</span>
                  <RatedGameCover game={game} />
                </div>
                <span className="profile-rated-title" title={game.title}>{game.title}</span>
                <span className="profile-rated-score" style={{ color: getRatingColor(game.averageRating) }}>
                  {game.averageRating.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-rated-empty">Rate games in the game details to see your top rated here.</p>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Account</h3>

        <div className="settings-row">
          <label className="settings-label">Username</label>
          <div className="pi-wrap" style={{ maxWidth: '18rem' }}>
            <input
              type="text"
              placeholder="Your display name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="pi-input"
            />
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Email</label>
          <div className="pi-wrap pi-wrap--disabled" style={{ maxWidth: '18rem' }}>
            <input
              type="email"
              value={email}
              disabled
              className="pi-input"
            />
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Member Since</label>
          <span className="text-sm text-gray-400">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
          </span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || uploading}
          onClick={handleSave}
          className="settings-pill active bg-[#06d6a0] text-[#0d0d0d] font-bold border-none"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-[#0d0d0d] border-t-transparent rounded-full animate-spin"></span>
          ) : (
            'Save Changes'
          )}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="settings-pill bg-[#1c1c1e] border border-[#2a2a2e] text-[#8e8e93]">
            Back
          </button>
        )}
      </div>

      {adjust && (
        <ImageAdjustModal
          file={adjust.file}
          type={adjust.type}
          onCancel={() => setAdjust(null)}
          onConfirm={(adjustedFile) => {
            const type = adjust.type
            setAdjust(null)
            startLocalPreview(adjustedFile, type)
            if (type === 'banner') handleBannerUpload(adjustedFile)
            else handleUpload(adjustedFile)
          }}
        />
      )}
    </div>
  )
}
