import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'
import { createWriteStream } from 'fs'

function sanitizeTitle(title) {
  return title.replace(/[<>:"/\\|?*]/g, '_').trim()
}

export function resolveEnvPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null

  let resolved = rawPath.trim()

  const envPattern = /%([^%]+)%/g
  resolved = resolved.replace(envPattern, (match, varName) => {
    const envVal = process.env[varName]
    return envVal || match
  })

  resolved = resolve(resolved)

  if (!existsSync(resolved)) {
    console.warn(`[Backup] Path does not exist: ${resolved}`)
    return null
  }

  return resolved
}

export async function backupGameSave(gameTitle, rawPath) {
  try {
    const savePath = resolveEnvPath(rawPath)
    if (!savePath || !existsSync(savePath)) {
      console.warn(`[Backup] Skipping — save path invalid for "${gameTitle}"`)
      return { success: false, error: 'Save data path does not exist' }
    }

    const archiverMod = await import('archiver')
    const archiver = archiverMod.default || archiverMod

    const safeName = sanitizeTitle(gameTitle)
    const backupDir = join(app.getPath('userData'), 'Backups', safeName)
    mkdirSync(backupDir, { recursive: true })

    const now = new Date()
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-')
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0')
    ].join('-')

    const zipName = `${safeName}_${dateStr}_${timeStr}.zip`
    const zipPath = join(backupDir, zipName)

    return await new Promise((res) => {
      const output = createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 6 } })

      output.on('close', () => {
        console.log(`[Backup] Created: ${zipPath} (${archive.pointer()} bytes)`)
        res({ success: true, path: zipPath, size: archive.pointer() })
      })

      archive.on('error', (err) => {
        console.error(`[Backup] Archive error for "${gameTitle}":`, err.message)
        res({ success: false, error: err.message })
      })

      archive.pipe(output)
      archive.directory(savePath, safeName)
      archive.finalize()
    })
  } catch (err) {
    console.error(`[Backup] Failed for "${gameTitle}":`, err.message)
    return { success: false, error: err.message }
  }
}
