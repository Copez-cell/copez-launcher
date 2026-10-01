const { parentPort } = require('worker_threads')
let si = null

function ensureSI() {
  if (si) return true
  try {
    si = require('systeminformation')
    return true
  } catch (err) {
    console.error('[HWWorker] Failed to load systeminformation:', err.message)
    return false
  }
}

const fallback = {
  cpu: { model: 'Unknown CPU', cores: 0, load: 0, temp: null },
  ram: { total: 0, used: 0, free: 0, percentage: 0 },
  gpu: { model: 'No GPU detected', vramTotal: 0, vramUsed: 0, percentage: 0, temp: null }
}

function parseCPU(loadData, cpuTempData) {
  try {
    const cpuLoad = typeof loadData?.currentLoad === 'number' ? loadData.currentLoad : 0
    const cpuModel = loadData?.cpus?.[0]?.model || fallback.cpu.model
    const cpuCores = Array.isArray(loadData?.cpus) ? loadData.cpus.length : 0
    const cpuTemp = typeof cpuTempData?.main === 'number' ? cpuTempData.main : null
    return { model: cpuModel, cores: cpuCores, load: cpuLoad, temp: cpuTemp }
  } catch {
    return { ...fallback.cpu }
  }
}

function parseRAM(memData) {
  try {
    if (memData && typeof memData.total === 'number' && memData.total > 0) {
      const total = Math.round(memData.total / (1024 * 1024))
      const used = Math.round((memData.used || 0) / (1024 * 1024))
      const free = Math.round((memData.free || 0) / (1024 * 1024))
      return { total, used, free, percentage: Math.round((used / total) * 1000) / 10 }
    }
  } catch {}
  return { ...fallback.ram }
}

function parseGPU(gfxData) {
  try {
    if (gfxData?.controllers?.length > 0) {
      const active = gfxData.controllers.reduce((best, ctrl) => {
        if (!best) return ctrl
        return (ctrl.vram || 0) > (best.vram || 0) ? ctrl : best
      }, null)
      if (active) {
        return {
          model: active.model || fallback.gpu.model,
          vramTotal: typeof active.vram === 'number' ? active.vram : 0,
          vramUsed: 0,
          percentage: 0,
          temp: typeof active.temperatureGpu === 'number' ? active.temperatureGpu : null
        }
      }
    }
  } catch {}
  return { ...fallback.gpu }
}

async function fetchLightweight() {
  if (!ensureSI()) {
    return { cpu: { ...fallback.cpu }, ram: { ...fallback.ram }, timestamp: Date.now() }
  }
  const [loadData, memData] = await Promise.all([si.currentLoad(), si.mem()])
  return {
    cpu: parseCPU(loadData, null),
    ram: parseRAM(memData),
    timestamp: Date.now()
  }
}

async function fetchFull() {
  if (!ensureSI()) {
    return { ...fallback, timestamp: Date.now() }
  }
  const [cpuTempData, memData, gfxData, loadData] = await Promise.all([
    si.cpuTemperature(),
    si.mem(),
    si.graphics(),
    si.currentLoad()
  ])
  return {
    cpu: parseCPU(loadData, cpuTempData),
    ram: parseRAM(memData),
    gpu: parseGPU(gfxData),
    timestamp: Date.now()
  }
}

parentPort.on('message', async (msg) => {
  try {
    const data = msg.type === 'full' ? await fetchFull() : await fetchLightweight()
    parentPort.postMessage(data)
  } catch (err) {
    console.error('[HWWorker] Error:', err.message)
    parentPort.postMessage({
      cpu: { ...fallback.cpu },
      ram: { ...fallback.ram },
      gpu: { ...fallback.gpu },
      timestamp: Date.now()
    })
  }
})
