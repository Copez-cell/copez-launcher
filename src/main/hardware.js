import { Worker } from 'worker_threads'
import { join } from 'path'

const FAST_INTERVAL = 2000
const SLOW_INTERVAL = 10000
const GPU_EVERY_N = 5

let worker = null
let pollTimer = null
let mainRef = null
let tickCount = 0
let dashboardActive = false
let lastStats = null

let onStatsCallback = null

function createWorker() {
  if (worker) return
  const workerPath = join(__dirname, 'hardware-worker.js')
  worker = new Worker(workerPath)

  worker.on('message', (data) => {
    lastStats = data
    if (onStatsCallback) onStatsCallback(data)
    if (mainRef && !mainRef.isDestroyed()) {
      mainRef.webContents.send('hardware-stats', data)
    }
  })

  worker.on('error', (err) => {
    console.error('[Hardware] Worker error:', err.message)
    worker = null
  })

  worker.on('exit', () => {
    if (worker) {
      console.error('[Hardware] Worker exited unexpectedly')
      worker = null
    }
  })
}

function postMessage(msg) {
  if (!worker) createWorker()
  worker.postMessage(msg)
}

function tick() {
  tickCount++
  const fullTick = tickCount % GPU_EVERY_N === 0
  postMessage({ type: fullTick ? 'full' : 'lightweight' })
}

function applyInterval() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  const interval = dashboardActive ? FAST_INTERVAL : SLOW_INTERVAL
  tickCount = 0
  tick()
  pollTimer = setInterval(tick, interval)
}

export function startHardwarePolling(mainWindow) {
  stopHardwarePolling()
  mainRef = mainWindow
  createWorker()
  applyInterval()
}

export function stopHardwarePolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function setDashboardActive(active) {
  dashboardActive = active
  if (worker && pollTimer) {
    applyInterval()
  }
}

export function setOnStats(callback) {
  onStatsCallback = callback
}

export function getLastStats() {
  return lastStats
}

export function terminateWorker() {
  stopHardwarePolling()
  if (worker) {
    worker.terminate()
    worker = null
  }
}

const gpuStats = {
  model: 'No GPU detected',
  vramTotal: 0,
  temp: null
}

let sessionTick = 0
let sessionRunning = false
let sessionStartTime = 0
let sessionStartTimestamp = 0
let sessionTickHandler = null

function updateGPUCache(stats) {
  if (stats.gpu && typeof stats.gpu.vramTotal === 'number' && stats.gpu.vramTotal > 0) {
    gpuStats.model = stats.gpu.model
    gpuStats.vramTotal = stats.gpu.vramTotal
    gpuStats.temp = stats.gpu.temp
  }
}

function onSessionTick(stats) {
  if (!sessionRunning) return

  sessionTick++
  updateGPUCache(stats)

  const cpuTemp = typeof stats.cpu?.temp === 'number' ? stats.cpu.temp : null
  const gpuTemp = typeof stats.gpu?.temp === 'number' ? stats.gpu.temp : null
  const cpuLoad = typeof stats.cpu?.load === 'number' ? stats.cpu.load : 0
  const ramPct = typeof stats.ram?.percentage === 'number' ? stats.ram.percentage : 0
  const vramTotal = typeof stats.gpu?.vramTotal === 'number' ? stats.gpu.vramTotal : 0

  if (cpuTemp != null) {
    if (cpuTemp > sessionState.maxCpuTemp || sessionTick === 1) sessionState.maxCpuTemp = cpuTemp
  }
  if (gpuTemp != null) {
    if (gpuTemp > sessionState.maxGpuTemp || sessionTick === 1) sessionState.maxGpuTemp = gpuTemp
  }
  if (vramTotal > sessionState.maxGpuVram) sessionState.maxGpuVram = vramTotal

  sessionState.sumCpuLoad += cpuLoad
  sessionState.sumRamPct += ramPct

  sessionState.cpuModel = stats.cpu?.model || sessionState.cpuModel
  sessionState.gpuModel = stats.gpu?.model || sessionState.gpuModel
}

const sessionState = {
  maxCpuTemp: 0,
  maxGpuTemp: 0,
  maxGpuVram: 0,
  sumCpuLoad: 0,
  sumRamPct: 0,
  cpuModel: 'Unknown CPU',
  gpuModel: 'No GPU detected'
}

function resetSessionState() {
  sessionTick = 0
  sessionStartTime = Date.now()
  sessionStartTimestamp = Date.now()
  sessionState.maxCpuTemp = 0
  sessionState.maxGpuTemp = 0
  sessionState.maxGpuVram = 0
  sessionState.sumCpuLoad = 0
  sessionState.sumRamPct = 0
  sessionState.cpuModel = 'Unknown CPU'
  sessionState.gpuModel = 'No GPU detected'
}

export function startSessionCollection() {
  stopSessionCollection()
  resetSessionState()
  sessionRunning = true

  sessionTickHandler = (stats) => onSessionTick(stats)
  onStatsCallback = sessionTickHandler

  if (lastStats) {
    onSessionTick(lastStats)
  }
}

export function stopSessionCollection() {
  sessionRunning = false
  onStatsCallback = null

  if (sessionTick === 0) return null

  const durationSec = Math.round((Date.now() - sessionStartTimestamp) / 1000)
  const avgCpuLoad = Math.round((sessionState.sumCpuLoad / sessionTick) * 10) / 10
  const avgRamUsage = Math.round((sessionState.sumRamPct / sessionTick) * 10) / 10

  const result = {
    date: new Date().toISOString(),
    duration: durationSec,
    readingsCount: sessionTick,
    maxCpuTemp: Math.round(sessionState.maxCpuTemp * 10) / 10,
    avgCpuLoad,
    maxGpuTemp: Math.round(sessionState.maxGpuTemp * 10) / 10,
    maxGpuVram: sessionState.maxGpuVram,
    avgRamUsage,
    cpuModel: sessionState.cpuModel,
    gpuModel: sessionState.gpuModel
  }

  resetSessionState()
  return result
}
