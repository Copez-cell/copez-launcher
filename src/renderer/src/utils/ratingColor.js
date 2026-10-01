const stops = [
  { pos: 0, r: 220, g: 50, b: 50 },
  { pos: 2.5, r: 160, g: 60, b: 200 },
  { pos: 5, r: 70, g: 130, b: 230 },
  { pos: 7.5, r: 60, g: 180, b: 90 },
  { pos: 10, r: 240, g: 210, b: 40 }
]

export function getRatingColor(value) {
  const v = Math.max(0, Math.min(10, value))
  let lower = stops[0]
  let upper = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].pos && v <= stops[i + 1].pos) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }
  const range = upper.pos - lower.pos
  const t = range === 0 ? 0 : (v - lower.pos) / range
  const r = Math.round(lower.r + (upper.r - lower.r) * t)
  const g = Math.round(lower.g + (upper.g - lower.g) * t)
  const b = Math.round(lower.b + (upper.b - lower.b) * t)
  return `rgb(${r}, ${g}, ${b})`
}
