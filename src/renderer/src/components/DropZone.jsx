import { useState, useCallback, useEffect, useRef } from 'react'

function DropZone({ onGameAdded }) {
  const [dragging, setDragging] = useState(false)
  const [dropMessage, setDropMessage] = useState('')
  const [dropMessageType, setDropMessageType] = useState('')
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer?.types?.includes('Files')) {
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragging(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]
    const filePath = file.path

    if (!filePath) {
      setDropMessage('Could not read file path')
      setDropMessageType('error')
      setTimeout(() => setDropMessage(''), 3000)
      return
    }

    const ext = filePath.split('.').pop()?.toLowerCase()
    if (ext !== 'exe' && ext !== 'lnk') {
      setDropMessage('Only .exe and .lnk files are supported')
      setDropMessageType('error')
      setTimeout(() => setDropMessage(''), 3000)
      return
    }

    const result = await window.api.game.addFromPath(filePath)

    if (result.success) {
      setDropMessage(`Added "${result.game.title}" to your library`)
      setDropMessageType('success')
      if (onGameAdded) onGameAdded()
    } else {
      setDropMessage(result.error)
      setDropMessageType('error')
    }
    setTimeout(() => setDropMessage(''), 3000)
  }, [onGameAdded])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    root.addEventListener('dragenter', handleDragEnter)
    root.addEventListener('dragleave', handleDragLeave)
    root.addEventListener('dragover', handleDragOver)
    root.addEventListener('drop', handleDrop)

    return () => {
      root.removeEventListener('dragenter', handleDragEnter)
      root.removeEventListener('dragleave', handleDragLeave)
      root.removeEventListener('dragover', handleDragOver)
      root.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

  return (
    <>
      {dragging && (
        <div className="dropzone-overlay">
          <div className="dropzone-content">
            <div className="dropzone-icon">&#128193;</div>
            <p className="dropzone-text">Drop .exe or .lnk to add a game</p>
            <p className="dropzone-subtext">Release to add to your library</p>
          </div>
        </div>
      )}

      {dropMessage && (
        <div className={`dropzone-toast ${dropMessageType}`}>
          {dropMessage}
        </div>
      )}
    </>
  )
}

export default DropZone
