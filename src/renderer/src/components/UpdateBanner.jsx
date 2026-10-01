import { useState, useEffect } from 'react'

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('available')
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return window.api.updater.onStatus((s) => {
      if (s.status === 'update-available') {
        setMode('available')
        setDismissed(false)
        setVisible(true)
      } else if (s.status === 'download-progress') {
        setMode('downloading')
        setProgress(s.progress)
        setVisible(true)
      } else if (s.status === 'update-downloaded') {
        setMode('downloaded')
        setProgress(null)
        setVisible(true)
      } else if (s.status === 'error') {
        setMode('error')
        setMessage(s.message || 'Update check failed')
        setVisible(true)
        setTimeout(() => setVisible(false), 6000)
      }
    })
  }, [])

  if (!visible || dismissed) return null

  const percent = progress ? Math.round(progress.percent) : 0

  async function startDownload() {
    setMode('downloading')
    setProgress(null)
    await window.api.updater.download()
  }

  return (
    <div className={`update-banner update-banner--${mode}`}>
      <span className="update-banner-icon">
        {mode === 'downloaded' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="M12 12v9" />
            <path d="m16 16-4-4-4 4" />
          </svg>
        )}
      </span>
      <div className="update-banner-body">
        <span className="update-banner-title">
          {mode === 'downloaded'
            ? 'Update ready — restart to install'
            : mode === 'downloading'
              ? progress
                ? `Downloading update... ${percent}%`
                : 'Update found — downloading'
              : mode === 'available'
                ? 'A new update is available'
                : message}
        </span>
        {mode === 'downloading' && (
          <div className="update-banner-progress">
            <div
              className="update-banner-progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      {mode === 'downloaded' ? (
        <button
          className="update-banner-btn"
          onClick={() => window.api.updater.quitAndInstall()}
        >
          Restart &amp; Install
        </button>
      ) : mode === 'available' ? (
        <button
          className="update-banner-btn"
          onClick={startDownload}
        >
          Download
        </button>
      ) : (
        <button
          className="update-banner-close"
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          &#10005;
        </button>
      )}
    </div>
  )
}
