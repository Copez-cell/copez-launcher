import { useState, useEffect, useRef } from 'react'
import SystemSpecsCard from './SystemSpecsCard'

function safeNum(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function loadColor(pct) {
  if (pct >= 90) return 'var(--hw-critical)'
  if (pct >= 70) return 'var(--hw-warning)'
  if (pct >= 40) return 'var(--hw-accent)'
  return 'var(--hw-good)'
}

function loadGlow(pct) {
  if (pct >= 90) return '0 0 20px rgba(255, 80, 80, 0.3)'
  if (pct >= 70) return '0 0 20px rgba(255, 170, 50, 0.3)'
  if (pct >= 40) return '0 0 20px rgba(6, 214, 160, 0.2)'
  return 'none'
}

function formatBytes(mb) {
  const val = safeNum(mb)
  if (val >= 1024) return `${(val / 1024).toFixed(1)} GB`
  return `${Math.round(val)} MB`
}

function formatDuration(seconds) {
  const s = safeNum(seconds)
  if (s >= 3600) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${h}h ${m}m`
  }
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function formatDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(isoString) {
  const d = new Date(isoString)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function SemiGauge({ value, max = 100, label, size = 160 }) {
  const safe = safeNum(value)
  const safeMax = safeNum(max, 100) || 1
  const pct = Math.min(100, Math.max(0, (safe / safeMax) * 100))
  const color = loadColor(pct)
  const bg = 'rgba(255, 255, 255, 0.06)'
  const deg = (pct / 100) * 180
  const arcLen = deg * 1.484

  return (
    <div className="hw-gauge" style={{ width: size, height: size / 2 + 16 }}>
      <svg className="hw-gauge-svg" viewBox="0 0 200 110" width={size} height={size / 2 + 10}>
        <defs>
          <linearGradient id={`gauge-grad-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke={bg} strokeWidth="14" strokeLinecap="round" />
        {arcLen > 0 && (
          <path
            d="M 15 100 A 85 85 0 0 1 185 100"
            fill="none"
            stroke={`url(#gauge-grad-${label})`}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${arcLen} 999`}
            className="hw-gauge-fill"
          />
        )}
        <text x="100" y="82" textAnchor="middle" className="hw-gauge-value" fill={color}>
          {Math.round(pct)}%
        </text>
        <text x="100" y="102" textAnchor="middle" className="hw-gauge-label">
          {label}
        </text>
      </svg>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="hw-stat-row">
      <span className="hw-stat-row-label">{label}</span>
      <span className="hw-stat-row-value">{value}</span>
    </div>
  )
}

function ProgressBar({ value, max = 100 }) {
  const safe = safeNum(value)
  const safeMax = safeNum(max, 100) || 1
  const pct = Math.min(100, Math.max(0, (safe / safeMax) * 100))
  const color = loadColor(pct)

  return (
    <div className="hw-progress">
      <div className="hw-progress-fill" style={{ width: `${pct}%`, background: color, boxShadow: loadGlow(pct) }} />
    </div>
  )
}

function HWCard({ icon, title, model, gaugeValue, gaugeMax, gaugeLabel, stats, progress }) {
  return (
    <div className="hw-card">
      <div className="hw-card-header">
        <div className="hw-card-icon">{icon}</div>
        <div>
          <h3 className="hw-card-title">{title}</h3>
          <p className="hw-card-model">{model || 'Unknown'}</p>
        </div>
      </div>
      <div className="hw-card-gauge-wrap">
        <SemiGauge value={gaugeValue} max={gaugeMax || 100} label={gaugeLabel} />
      </div>
      {progress && progress.length > 0 && (
        <div className="hw-card-progress">
          {progress.map((p, i) => (
            <div key={i} className="hw-progress-group">
              <div className="hw-progress-header">
                <span>{p.label}</span>
                <span>{p.display}</span>
              </div>
              <ProgressBar value={p.value} max={p.max} />
            </div>
          ))}
        </div>
      )}
      {stats && (
        <div className="hw-card-stats">
          {stats.map((s, i) => (
            <StatRow key={i} label={s.label} value={s.value} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ log }) {
  const peakTemp = safeNum(log.maxCpuTemp)
  const peakGpuTemp = safeNum(log.maxGpuTemp)
  const peakVram = safeNum(log.maxGpuVram)
  const avgLoad = safeNum(log.avgCpuLoad)
  const avgRam = safeNum(log.avgRamUsage)

  return (
    <div className="hw-session-card">
      <div className="hw-session-card-header">
        <div className="hw-session-card-info">
          <h4 className="hw-session-card-title">{log.gameTitle || 'Unknown Game'}</h4>
          <div className="hw-session-card-meta">
            <span>{formatDate(log.date)}</span>
            <span className="hw-session-card-dot" />
            <span>{formatTime(log.date)}</span>
          </div>
        </div>
        <span className="hw-session-card-duration">{formatDuration(log.duration)}</span>
      </div>
      <div className="hw-session-card-metrics">
        {peakTemp > 0 && (
          <div className="hw-session-metric">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
            <span className="hw-session-metric-label">Peak Temp</span>
            <span className={`hw-session-metric-value ${peakTemp >= 80 ? 'hw-metric-critical' : peakTemp >= 70 ? 'hw-metric-warn' : ''}`}>
              {peakTemp.toFixed(1)}°C
            </span>
          </div>
        )}
        {peakGpuTemp > 0 && (
          <div className="hw-session-metric">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
            </svg>
            <span className="hw-session-metric-label">GPU Temp</span>
            <span className={`hw-session-metric-value ${peakGpuTemp >= 85 ? 'hw-metric-critical' : peakGpuTemp >= 75 ? 'hw-metric-warn' : ''}`}>
              {peakGpuTemp.toFixed(1)}°C
            </span>
          </div>
        )}
        {peakVram > 0 && (
          <div className="hw-session-metric">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 19v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" />
            </svg>
            <span className="hw-session-metric-label">Max VRAM</span>
            <span className="hw-session-metric-value">{formatBytes(peakVram)}</span>
          </div>
        )}
        {avgLoad > 0 && (
          <div className="hw-session-metric">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
            </svg>
            <span className="hw-session-metric-label">Avg CPU</span>
            <span className={`hw-session-metric-value ${avgLoad >= 90 ? 'hw-metric-critical' : avgLoad >= 70 ? 'hw-metric-warn' : ''}`}>
              {avgLoad.toFixed(1)}%
            </span>
          </div>
        )}
        {avgRam > 0 && (
          <div className="hw-session-metric">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 19v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" />
            </svg>
            <span className="hw-session-metric-label">Avg RAM</span>
            <span className="hw-session-metric-value">{avgRam.toFixed(1)}%</span>
          </div>
        )}
      </div>
      {(log.cpuModel || log.gpuModel) && (
        <div className="hw-session-card-hardware">
          {log.cpuModel && <span>{log.cpuModel}</span>}
          {log.cpuModel && log.gpuModel && <span className="hw-session-card-dot" />}
          {log.gpuModel && <span>{log.gpuModel}</span>}
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [sessionLogs, setSessionLogs] = useState([])
  const unsubRef = useRef(null)

  useEffect(() => {
    const hw = window.api?.hardware
    if (!hw) {
      console.error('[Dashboard] window.api.hardware is undefined')
      return
    }

    hw.setActiveTab('dashboard')
    hw.startHardwarePolling()

    unsubRef.current = hw.onHardwareStats((data) => {
      setStats(data)
    })

    hw.getAllSessionLogs().then((logs) => {
      setSessionLogs(logs)
    }).catch(() => {})

    return () => {
      hw.setActiveTab('library')
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
      try { hw.stopHardwarePolling() } catch {}
    }
  }, [])

  if (!stats) {
    return (
      <div className="hw-loading">
        <div className="hw-loading-spinner" />
        <p>Waiting for hardware telemetry...</p>
      </div>
    )
  }

  const cpu = stats.cpu || {}
  const ram = stats.ram || {}
  const gpu = stats.gpu || {}

  const vramPct = safeNum(gpu.vramTotal) > 0
    ? Math.round((safeNum(gpu.vramUsed) / safeNum(gpu.vramTotal)) * 1000) / 10
    : 0

  return (
    <div className="hw-dashboard">
      <div className="mb-6">
        <SystemSpecsCard />
      </div>

      <div className="hw-section">
        <div className="hw-header">
          <div className="hw-header-left">
            <div className="hw-live-dot" />
            <span className="hw-header-subtitle">Real-time system telemetry</span>
          </div>
          <span className="hw-header-interval">2s active / 10s idle</span>
        </div>

        <div className="hw-grid">
          <HWCard
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2M9 2v2M15 20v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2" /></svg>}
            title="CPU"
            model={cpu.model}
            gaugeValue={cpu.load}
            gaugeLabel="Load"
            stats={[
              { label: 'Cores', value: safeNum(cpu.cores) },
              { label: 'Temperature', value: cpu.temp != null ? `${safeNum(cpu.temp).toFixed(1)}\u00B0C` : 'N/A' }
            ]}
          />

          <HWCard
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 19v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" /><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></svg>}
            title="Memory"
            model="System RAM"
            gaugeValue={ram.percentage}
            gaugeLabel="Usage"
            progress={[
              { label: 'Used', value: ram.used, max: ram.total, display: `${formatBytes(ram.used)} / ${formatBytes(ram.total)}` }
            ]}
            stats={[
              { label: 'Total', value: formatBytes(ram.total) },
              { label: 'Free', value: formatBytes(ram.free) }
            ]}
          />

          <HWCard
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><path d="M12 12v.01" /></svg>}
            title="GPU"
            model={gpu.model}
            gaugeValue={vramPct}
            gaugeMax={100}
            gaugeLabel="VRAM"
            progress={safeNum(gpu.vramTotal) > 0 ? [
              { label: 'VRAM', value: gpu.vramUsed, max: gpu.vramTotal, display: `${formatBytes(gpu.vramUsed)} / ${formatBytes(gpu.vramTotal)}` }
            ] : []}
            stats={[
              { label: 'VRAM Total', value: safeNum(gpu.vramTotal) > 0 ? formatBytes(gpu.vramTotal) : 'N/A' },
              { label: 'Temperature', value: gpu.temp != null ? `${safeNum(gpu.temp).toFixed(1)}\u00B0C` : 'N/A' }
            ]}
          />
        </div>
      </div>

      <div className="hw-section">
        <div className="hw-header">
          <div className="hw-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="hw-header-subtitle">Recent gaming sessions</span>
          </div>
          <span className="hw-header-interval">{sessionLogs.length} session{sessionLogs.length !== 1 ? 's' : ''}</span>
        </div>

        {sessionLogs.length === 0 ? (
          <div className="hw-sessions-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
            </svg>
            <p>No session data yet. Launch a game to start recording hardware telemetry.</p>
          </div>
        ) : (
          <div className="hw-sessions-grid">
            {sessionLogs.map((log, i) => (
              <SessionCard key={`${log.gameId}-${log.date}-${i}`} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
