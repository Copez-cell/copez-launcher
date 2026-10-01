import { useState, useEffect } from 'react'

function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    const unsub = window.api.window.onMaximizedChange(setIsMaximized)
    return unsub
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <svg className="titlebar-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="4" width="18" height="12" rx="3" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
            <circle cx="6.5" cy="10" r="2" fill="var(--accent)" />
            <circle cx="13.5" cy="10" r="2" fill="var(--accent)" />
            <rect x="8.5" y="7" width="3" height="1.2" rx="0.6" fill="var(--accent)" opacity="0.7" />
            <rect x="8.5" y="11.8" width="3" height="1.2" rx="0.6" fill="var(--accent)" opacity="0.7" />
          </svg>
          <span className="titlebar-brand-text">C<span className="titlebar-brand-accent">O</span>PEZ</span>
        </div>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn titlebar-minimize"
          onClick={() => window.api.window.minimize()}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect fill="currentColor" width="10" height="1" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-maximize"
          onClick={() => window.api.window.maximize()}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          className="titlebar-btn titlebar-close"
          onClick={() => window.api.window.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Titlebar
