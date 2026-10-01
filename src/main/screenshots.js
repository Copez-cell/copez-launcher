import { app, shell } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { pathToFileURL } from 'url'
import screenshot from 'screenshot-desktop'

const SCREENSHOTS_ROOT = join(app.getPath('documents'), 'COPEZ', 'Screenshots')

function sanitizeTitle(title) {
  return (title || 'Unknown').replace(/[<>:"/\\|?*]+/g, '').trim()
}

function getGameDir(gameTitle) {
  const safeName = sanitizeTitle(gameTitle)
  return join(SCREENSHOTS_ROOT, `${safeName} screenshots`)
}

export async function captureScreenshot(gameTitle) {
  const gameDir = getGameDir(gameTitle)
  console.log(`[Screenshots] Preparing capture for title="${gameTitle}" → ${gameDir}`)
  mkdirSync(gameDir, { recursive: true })
  const filename = `${Date.now()}.png`
  const filePath = join(gameDir, filename)
  console.log(`[Screenshots] Target file: ${filePath}`)

  const buf = await screenshot({ format: 'png' })
  console.log(`[Screenshots] Screenshot buffer captured (${buf.length} bytes)`)

  const { writeFileSync } = await import('fs')
  writeFileSync(filePath, buf)
  console.log(`[Screenshots] File written successfully: ${filePath}`)

  return filePath
}

export function getScreenshotPaths(gameTitle) {
  const dir = getGameDir(gameTitle)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === '.png')
    .sort((a, b) => {
      const tsA = parseInt(a.replace('.png', ''), 10) || 0
      const tsB = parseInt(b.replace('.png', ''), 10) || 0
      return tsB - tsA
    })
    .map((f) => {
      const abs = join(dir, f)
      return {
        filename: f,
        path: abs,
        url: pathToFileURL(abs).href,
        timestamp: parseInt(f.replace('.png', ''), 10) || 0
      }
    })
}

export function deleteScreenshot(filePath) {
  if (!filePath || !existsSync(filePath)) return false
  if (!filePath.startsWith(SCREENSHOTS_ROOT)) return false
  unlinkSync(filePath)
  return true
}

export function openScreenshotFolder(gameTitle) {
  const dir = getGameDir(gameTitle)
  mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
}
