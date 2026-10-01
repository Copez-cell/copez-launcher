import { useState, useEffect, useRef, useCallback } from 'react'

const PRESETS = {
  avatar: { width: 512, height: 512, label: 'Profile Avatar' },
  banner: { width: 1920, height: 620, label: 'Profile Banner' }
}

function isGif(file) {
  return !!(file && (file.type === 'image/gif' || /\.gif$/i.test(file.name)))
}

export default function ImageAdjustModal({ file, type = 'avatar', onCancel, onConfirm }) {
  const preset = PRESETS[type] || PRESETS.avatar
  const aspect = preset.width / preset.height
  const animated = isGif(file)

  const [imgSrc, setImgSrc] = useState(null)
  const [imgMeta, setImgMeta] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [view, setView] = useState({ w: 0, h: 0 })
  const [exporting, setExporting] = useState(false)
  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const hasDraggedRef = useRef(false)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    setImgMeta(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    hasDraggedRef.current = false
    const el = new Image()
    el.onload = () => setImgMeta({ el, width: el.naturalWidth, height: el.naturalHeight })
    el.src = url
    return () => { URL.revokeObjectURL(url) }
  }, [file])

  useEffect(() => {
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect && rect.width > 0) {
        setView({ w: rect.width, h: rect.width / aspect })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [aspect])

  const effectiveScale = imgMeta
    ? Math.max(view.w / imgMeta.width, view.h / imgMeta.height) * zoom
    : 1

  const clampFor = useCallback((scale, o) => {
    if (!imgMeta) return { x: 0, y: 0 }
    const sw = imgMeta.width * scale
    const sh = imgMeta.height * scale
    const maxX = Math.min(0, view.w - sw)
    const maxY = Math.min(0, view.h - sh)
    return {
      x: Math.min(0, Math.max(maxX, o.x)),
      y: Math.min(0, Math.max(maxY, o.y))
    }
  }, [imgMeta, view])

  useEffect(() => {
    if (!imgMeta || hasDraggedRef.current) return
    const scale = Math.max(view.w / imgMeta.width, view.h / imgMeta.height) * zoom
    setOffset({
      x: (view.w - imgMeta.width * scale) / 2,
      y: (view.h - imgMeta.height * scale) / 2
    })
  }, [view, imgMeta, zoom])

  function handlePointerDown(e) {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: offset.x,
      oy: offset.y
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e) {
    const d = dragRef.current
    if (!d) return
    hasDraggedRef.current = true
    const next = clampFor(effectiveScale, {
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY)
    })
    setOffset(next)
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  function handleZoom(newZoom) {
    const scale = imgMeta
      ? Math.max(view.w / imgMeta.width, view.h / imgMeta.height) * newZoom
      : 1
    setZoom(newZoom)
    setOffset((o) => clampFor(scale, o))
  }

  function handleReset() {
    hasDraggedRef.current = false
    setZoom(1)
  }

  function handleConfirm() {
    if (animated) {
      onConfirm(file)
      return
    }
    if (!imgMeta) return
    setExporting(true)
    const canvas = document.createElement('canvas')
    canvas.width = preset.width
    canvas.height = preset.height
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const scale = effectiveScale
    const cropX = -offset.x / scale
    const cropY = -offset.y / scale
    const cropW = view.w / scale
    const cropH = view.h / scale
    ctx.drawImage(imgMeta.el, cropX, cropY, cropW, cropH, 0, 0, preset.width, preset.height)
    canvas.toBlob((blob) => {
      setExporting(false)
      if (blob) {
        const name = type === 'banner' ? 'banner.jpg' : 'avatar.jpg'
        onConfirm(new File([blob], name, { type: 'image/jpeg' }))
      } else {
        onCancel()
      }
    }, 'image/jpeg', 0.85)
  }

  if (!file) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="iam-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-heading">{preset.label}</h3>

        <div
          className="iam-view"
          ref={containerRef}
          style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          onPointerDown={animated ? undefined : handlePointerDown}
          onPointerMove={animated ? undefined : handlePointerMove}
          onPointerUp={animated ? undefined : handlePointerUp}
          onPointerLeave={animated ? undefined : handlePointerUp}
        >
          {imgSrc && (
            <img
              src={imgSrc}
              alt=""
              draggable={false}
              className="iam-view-img"
              style={{
                width: imgMeta ? imgMeta.width * effectiveScale : undefined,
                height: imgMeta ? imgMeta.height * effectiveScale : undefined,
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`
              }}
            />
          )}
        </div>

        {!animated ? (
          <div className="iam-controls">
            <label className="iam-zoom-label">
              <span>Zoom</span>
              <span>{Math.round(zoom * 100)}%</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.01"
              value={zoom}
              onChange={(e) => handleZoom(parseFloat(e.target.value))}
              className="iam-zoom-slider"
            />
            <div className="iam-hint">
              Drag the image to reposition · {type === 'banner' ? 'Output: 1920 × 620' : 'Output: 512 × 512'}
            </div>
          </div>
        ) : (
          <div className="iam-controls">
            <div className="iam-hint">
              Animated GIFs are uploaded as-is so the animation is preserved.
            </div>
          </div>
        )}

        <div className="modal-actions">
          {!animated && (
            <button type="button" className="modal-cancel" onClick={handleReset}>Reset</button>
          )}
          <button type="button" className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="modal-confirm"
            onClick={handleConfirm}
            disabled={exporting || !imgMeta}
          >
            {exporting ? 'Processing...' : 'Use Image'}
          </button>
        </div>
      </div>
    </div>
  )
}
