import RpcClient from 'discord-rpc'

const COPEZ_CLIENT_ID = '1395284196466417745'

let rpc = null
let connected = false
let activityStart = null

async function connectRPC() {
  if (rpc && connected) return true
  try {
    rpc = new RpcClient({ transport: 'ipc' })
    await rpc.login({ clientId: COPEZ_CLIENT_ID })
    connected = true
    rpc.on('disconnect', () => {
      connected = false
      rpc = null
    })
    return true
  } catch {
    connected = false
    rpc = null
    return false
  }
}

export async function setActivity(gameTitle, details) {
  const ok = await connectRPC()
  if (!ok || !rpc) return false
  activityStart = Date.now()
  try {
    rpc.setActivity({
      details: `Playing ${gameTitle}`,
      state: details || undefined,
      startTimestamp: activityStart,
      instance: false
    })
    return true
  } catch {
    return false
  }
}

export async function clearActivity() {
  activityStart = null
  if (!rpc || !connected) return
  try {
    rpc.clearActivity()
  } catch {}
}

export function isConnected() {
  return connected
}
