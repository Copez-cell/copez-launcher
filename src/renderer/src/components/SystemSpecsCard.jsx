import { useState, useEffect } from 'react'

const PLATFORM_NAMES = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  freebsd: 'FreeBSD',
  android: 'Android',
  sunos: 'Solaris',
  aix: 'AIX'
}

function formatRam(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '\u2014'
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function SpecItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</p>
        <p className="text-sm text-zinc-100 font-medium truncate" title={value}>{value}</p>
      </div>
    </div>
  )
}

const CPU_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M15 2v2M9 2v2M15 20v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2" />
  </svg>
)

const RAM_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 19v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M2 10h20" />
  </svg>
)

const OS_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)

export default function SystemSpecsCard() {
  const [specs, setSpecs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const getSpecs = window.api?.getSystemSpecs
    if (typeof getSpecs !== 'function') {
      setError('System specs unavailable')
      return
    }
    getSpecs()
      .then((data) => {
        if (!cancelled) setSpecs(data)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to read system specs')
      })
    return () => {
      cancelled = true
    }
  }, [])

  let osLabel = '\u2014'
  if (specs) {
    const platform = PLATFORM_NAMES[specs.platform] || specs.platform || ''
    const release = specs.release ? ` ${specs.release}` : ''
    const arch = specs.arch ? ` (${specs.arch})` : ''
    osLabel = `${platform}${release}${arch}`.trim()
  }

  return (
    <div className="bg-[#18181b]/60 backdrop-blur-md rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <h3 className="text-sm font-semibold text-zinc-100 tracking-wide">System Specs</h3>
        <span className="ml-auto h-px flex-1 max-w-[8rem] bg-gradient-to-r from-[var(--accent)]/40 to-transparent" />
      </div>

      {error ? (
        <p className="text-xs text-zinc-500">{error}</p>
      ) : !specs ? (
        <div className="flex items-center gap-2.5 text-xs text-zinc-400">
          <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          Reading system specs...
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <SpecItem icon={CPU_ICON} label="Processor" value={specs.cpuModel || '\u2014'} />
          <SpecItem icon={RAM_ICON} label="Memory" value={formatRam(specs.totalRam)} />
          <SpecItem icon={OS_ICON} label="Operating System" value={osLabel} />
        </div>
      )}
    </div>
  )
}
