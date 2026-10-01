import { useRef, useEffect, useState, useCallback } from 'react'

const WHEEL_SIZE = 200
const WHEEL_RADIUS = WHEEL_SIZE / 2
const SLIDER_HEIGHT = 200
const SLIDER_WIDTH = 14

function hexToHsl(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let hDeg = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) hDeg = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) hDeg = ((b - r) / d + 2) / 6
    else hDeg = ((r - g) / d + 4) / 6
  }

  return { h: hDeg * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r, g, b
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  const toHex = (v) => {
    const hex = Math.round((v + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r, g, b
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}

function drawWheel(canvas, lightness) {
  const ctx = canvas.getContext('2d')
  const size = canvas.width
  const cx = size / 2
  const cy = size / 2
  const radius = cx - 1

  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= radius) {
        const angle = Math.atan2(dy, dx)
        const hue = ((angle * 180) / Math.PI + 360) % 360
        const saturation = (dist / radius) * 100

        const { r, g, b } = hslToRgb(hue, saturation, lightness)

        const idx = (y * size + x) * 4
        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = 255
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

function drawLightnessGradient(canvas, hue, saturation) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height

  for (let y = 0; y < h; y++) {
    const l = 100 - (y / h) * 100
    const { r, g, b } = hslToRgb(hue, saturation, l)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, y, w, 1)
  }
}

function drawCheckerboard(canvas) {
  const ctx = canvas.getContext('2d')
  const size = 8
  const w = canvas.width
  const h = canvas.height

  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const isLight = ((x / size) + (y / size)) % 2 === 0
      ctx.fillStyle = isLight ? '#2a2a2e' : '#222225'
      ctx.fillRect(x, y, size, size)
    }
  }
}

export default function ColorWheel({ color, onChange }) {
  const wheelCanvasRef = useRef(null)
  const sliderCanvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dragging, setDragging] = useState(null)
  const [hsl, setHsl] = useState(() => hexToHsl(color))

  const { h, s, l } = hsl

  useEffect(() => {
    setHsl(hexToHsl(color))
  }, [color])

  useEffect(() => {
    const canvas = wheelCanvasRef.current
    if (!canvas) return
    canvas.width = WHEEL_SIZE
    canvas.height = WHEEL_SIZE
    drawWheel(canvas, l)
  }, [l])

  useEffect(() => {
    const canvas = sliderCanvasRef.current
    if (!canvas) return
    canvas.width = SLIDER_WIDTH
    canvas.height = SLIDER_HEIGHT
    drawLightnessGradient(canvas, h, s)
  }, [h, s])

  const handleWheelInteraction = useCallback((clientX, clientY) => {
    const canvas = wheelCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const dx = x - cx
    const dy = y - cy
    const radius = cx

    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius)
    const angle = Math.atan2(dy, dx)
    const hue = ((angle * 180) / Math.PI + 360) % 360
    const saturation = (dist / radius) * 100

    const newHsl = { h: hue, s: saturation, l }
    setHsl(newHsl)
    onChange(hslToHex(hue, saturation, l))
  }, [l, onChange])

  const handleSliderInteraction = useCallback((clientY) => {
    const canvas = sliderCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height))
    const lightness = 100 - (y / rect.height) * 100

    const newHsl = { h, s, l: lightness }
    setHsl(newHsl)
    onChange(hslToHex(h, s, lightness))
  }, [h, s, onChange])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e) => {
      e.preventDefault()
      if (dragging === 'wheel') {
        handleWheelInteraction(e.clientX, e.clientY)
      } else if (dragging === 'slider') {
        handleSliderInteraction(e.clientY)
      }
    }

    const handleMouseUp = () => {
      setDragging(null)
    }

    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseup', handleMouseUp, true)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true)
      document.removeEventListener('mouseup', handleMouseUp, true)
    }
  }, [dragging, handleWheelInteraction, handleSliderInteraction])

  const wheelSelectorX = (s / 100) * (WHEEL_RADIUS - 2) * Math.cos((h * Math.PI) / 180)
  const wheelSelectorY = (s / 100) * (WHEEL_RADIUS - 2) * Math.sin((h * Math.PI) / 180)
  const sliderY = ((100 - l) / 100) * (SLIDER_HEIGHT - 2)

  const previewRgb = hslToRgb(h, s, l)

  return (
    <div className="color-wheel-container" ref={containerRef}>
      <div className="color-wheel-main">
        <div className="color-wheel-canvas-wrap">
          <canvas
            ref={wheelCanvasRef}
            className="color-wheel-canvas"
            onMouseDown={(e) => {
              setDragging('wheel')
              handleWheelInteraction(e.clientX, e.clientY)
            }}
          />
          <div
            className="color-wheel-selector"
            style={{
              transform: `translate(${wheelSelectorX}px, ${wheelSelectorY}px)`
            }}
          >
            <div
              className="color-wheel-selector-inner"
              style={{
                background: hslToHex(h, s, l),
                boxShadow: `0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.5), 0 0 8px rgba(${previewRgb.r},${previewRgb.g},${previewRgb.b},0.5)`
              }}
            />
          </div>
        </div>

        <div className="color-wheel-slider-wrap">
          <canvas
            ref={sliderCanvasRef}
            className="color-wheel-slider"
            onMouseDown={(e) => {
              setDragging('slider')
              handleSliderInteraction(e.clientY)
            }}
          />
          <div
            className="color-wheel-slider-thumb"
            style={{ top: `${sliderY}px` }}
          />
        </div>
      </div>

      <div className="color-wheel-info">
        <div className="color-wheel-info-row">
          <span className="color-wheel-info-label">H</span>
          <input
            type="range"
            className="color-wheel-hsl-slider"
            min="0"
            max="359"
            value={Math.round(h)}
            onChange={(e) => {
              const newH = parseInt(e.target.value)
              const newHsl = { h: newH, s, l }
              setHsl(newHsl)
              onChange(hslToHex(newH, s, l))
            }}
          />
          <span className="color-wheel-info-value">{Math.round(h)}°</span>
        </div>
        <div className="color-wheel-info-row">
          <span className="color-wheel-info-label">S</span>
          <input
            type="range"
            className="color-wheel-hsl-slider"
            min="0"
            max="100"
            value={Math.round(s)}
            onChange={(e) => {
              const newS = parseInt(e.target.value)
              const newHsl = { h, s: newS, l }
              setHsl(newHsl)
              onChange(hslToHex(h, newS, l))
            }}
          />
          <span className="color-wheel-info-value">{Math.round(s)}%</span>
        </div>
        <div className="color-wheel-info-row">
          <span className="color-wheel-info-label">L</span>
          <input
            type="range"
            className="color-wheel-hsl-slider"
            min="0"
            max="100"
            value={Math.round(l)}
            onChange={(e) => {
              const newL = parseInt(e.target.value)
              const newHsl = { h, s, l: newL }
              setHsl(newHsl)
              onChange(hslToHex(h, s, newL))
            }}
          />
          <span className="color-wheel-info-value">{Math.round(l)}%</span>
        </div>
      </div>
    </div>
  )
}
