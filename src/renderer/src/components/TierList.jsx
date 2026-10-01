import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'

const TIER_COLORS = {
  S: '#ff4d4d',
  A: '#ff8c42',
  B: '#ffd166',
  C: '#06d6a0',
  D: '#118ab2',
  E: '#8e8e93',
  F: '#555558'
}

const DEFAULT_LABELS = {
  S: 'Amazing',
  A: 'Great',
  B: 'Good',
  C: 'Average',
  D: 'Below Average',
  E: 'Bad',
  F: 'Unranked'
}

const DEFAULT_MIN_SCORES = {
  S: 9.0,
  A: 8.5,
  B: 8.0,
  C: 7.5,
  D: 7.0,
  E: 5.0,
  F: 0.0
}

const TierCard = memo(function TierCard({
  game,
  index,
  coverUrl,
  isDragging,
  showIndicator,
  onDragStart,
  onDragOver,
  onDragEnd
}) {
  return (
    <>
      <div
        className={`tier-game-card ${isDragging ? 'tier-game-card--dragging' : ''}`}
        draggable
        data-index={index}
        onDragStart={onDragStart}
        onDragOver={(e) => onDragOver(e, game.id, index)}
        onDragEnd={onDragEnd}
        title={`${game.title} — ${(game.averageRating || 0).toFixed(1)}`}
      >
        {coverUrl ? (
          <img className="tier-game-cover" src={coverUrl} alt={game.title} draggable={false} />
        ) : (
          <div className="tier-game-cover tier-game-cover--placeholder">
            <span>{game.title.charAt(0)}</span>
          </div>
        )}
        <div className="tier-game-card-overlay">
          <span className="tier-game-card-title">{game.title}</span>
          <span className="tier-game-card-score">{(game.averageRating || 0).toFixed(1)}</span>
        </div>
      </div>
      {showIndicator && <div className="tier-drop-indicator" />}
    </>
  )
})

const TierRow = memo(function TierRow({
  tierId,
  label,
  color,
  tierGames,
  isEditing,
  editValue,
  isDropTarget,
  dropIndex,
  draggedGameId,
  coverUrls,
  onStartEdit,
  onEditChange,
  onEditKeyDown,
  onConfirmEdit,
  onRowDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragOver,
  onCardDragEnd
}) {
  const borderColor = color || TIER_COLORS[tierId]

  return (
    <div
      className={`tier-row ${isDropTarget ? 'tier-row--drag-over' : ''}`}
      onDragOver={(e) => onRowDragOver(e, tierId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, tierId)}
    >
      <div className="tier-label-cell" style={{ borderLeftColor: borderColor }}>
        {isEditing ? (
          <input
            className="tier-label-input"
            value={editValue}
            onChange={onEditChange}
            onBlur={() => onConfirmEdit(tierId)}
            onKeyDown={(e) => onEditKeyDown(e, tierId)}
            autoFocus
            maxLength={40}
          />
        ) : (
          <button
            className="tier-label-btn"
            onClick={() => onStartEdit(tierId)}
            style={{ color: borderColor }}
            title="Click to rename"
          >
            {label}
          </button>
        )}
      </div>

      <div className="tier-games-cell">
        {tierGames.length === 0 && !isDropTarget && (
          <div className="tier-empty">Drop games here</div>
        )}
        {isDropTarget && dropIndex === 0 && (
          <div className="tier-drop-indicator" />
        )}
        {tierGames.map((game, index) => (
          <TierCard
            key={game.id}
            game={game}
            index={index}
            coverUrl={coverUrls[game.id]}
            isDragging={draggedGameId === game.id}
            showIndicator={isDropTarget && dropIndex === index + 1}
            onDragStart={(e) => onCardDragStart(e, game.id)}
            onDragOver={onCardDragOver}
            onDragEnd={onCardDragEnd}
          />
        ))}
        {isDropTarget && dropIndex >= tierGames.length && tierGames.length > 0 && (
          <div className="tier-drop-indicator" />
        )}
      </div>
    </div>
  )
})

function TierList({ games, tiers: tierData, onTiersSaved }) {
  const [tierLabels, setTierLabels] = useState({})
  const [editingTier, setEditingTier] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [manualAssignments, setManualAssignments] = useState({})
  const [tierOrders, setTierOrders] = useState({})
  const [draggedGameId, setDraggedGameId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [coverUrls, setCoverUrls] = useState({})
  const [saveState, setSaveState] = useState('idle')

  const editValueRef = useRef('')
  const dropTargetRef = useRef(null)
  const fetchedRef = useRef(new Set())

  useEffect(() => {
    editValueRef.current = editValue
  }, [editValue])

  useEffect(() => {
    dropTargetRef.current = dropTarget
  }, [dropTarget])

  useEffect(() => {
    if (tierData && tierData.tiers) {
      const labels = {}
      tierData.tiers.forEach((t) => {
        labels[t.id] = {
          label: t.label,
          color: t.color,
          minScore: t.minScore ?? DEFAULT_MIN_SCORES[t.id]
        }
      })
      setTierLabels(labels)
    }
    if (tierData?.assignments) {
      setManualAssignments(tierData.assignments)
    } else {
      setManualAssignments({})
    }
    if (tierData?.tierOrders) {
      setTierOrders(tierData.tierOrders)
    } else {
      setTierOrders({})
    }
  }, [tierData])

  useEffect(() => {
    let cancelled = false
    const missing = games.filter((g) => {
      const img = g.coverImage || g.bannerImage
      if (!img || fetchedRef.current.has(img)) return false
      fetchedRef.current.add(img)
      return true
    })
    if (missing.length === 0) return

    const CHUNK = 8
    async function loadAll() {
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK)
        const urls = {}
        await Promise.all(
          chunk.map(async (game) => {
            const img = game.coverImage || game.bannerImage
            try {
              const url = await window.api.artwork.getUrl(img)
              if (!cancelled && url) urls[game.id] = url
            } catch {}
          })
        )
        if (!cancelled && Object.keys(urls).length > 0) {
          setCoverUrls((prev) => ({ ...prev, ...urls }))
        }
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [games])

  const sortedTiers = Object.keys(TIER_COLORS)

  function autoPlaceTier(game) {
    const avg = game.averageRating || 0
    for (const tier of sortedTiers) {
      const info = tierLabels[tier]
      const minScore = info?.minScore ?? DEFAULT_MIN_SCORES[tier]
      if (minScore !== undefined && avg >= minScore) return tier
    }
    return 'F'
  }

  const groupsData = useMemo(() => {
    const g = {}
    sortedTiers.forEach((tier) => { g[tier] = [] })

    games.forEach((game) => {
      const tier = manualAssignments[game.id] || autoPlaceTier(game)
      g[tier].push(game)
    })

    sortedTiers.forEach((tierId) => {
      const order = tierOrders[tierId]
      if (order && order.length > 0) {
        g[tierId].sort((a, b) => {
          const ai = order.indexOf(a.id)
          const bi = order.indexOf(b.id)
          const aIn = ai !== -1
          const bIn = bi !== -1
          if (aIn && bIn) return ai - bi
          if (aIn) return -1
          if (bIn) return 1
          return 0
        })
      }
    })

    return g
  }, [games, tierLabels, manualAssignments, tierOrders])

  const handleStartEdit = useCallback((tierId) => {
    setEditingTier(tierId)
    setEditValue(tierLabels[tierId]?.label || tierId)
  }, [tierLabels])

  const handleEditChange = useCallback((e) => {
    setEditValue(e.target.value)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingTier(null)
    setEditValue('')
  }, [])

  const handleConfirmEdit = useCallback(async (tierId) => {
    const newLabel = editValueRef.current.trim() || tierId
    const updated = { ...tierLabels }
    updated[tierId] = { ...updated[tierId], label: newLabel }
    setTierLabels(updated)
    setEditingTier(null)
    setEditValue('')

    const tierArray = Object.entries(updated).map(([id, info]) => ({
      id,
      label: info.label,
      minScore: info.minScore ?? DEFAULT_MIN_SCORES[id],
      color: info.color || TIER_COLORS[id]
    }))

    setSaveState('saving')
    await window.api.storage.saveTiers({
      tiers: tierArray,
      assignments: manualAssignments,
      tierOrders: tierOrders
    })
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
    if (onTiersSaved) onTiersSaved()
  }, [tierLabels, manualAssignments, tierOrders, onTiersSaved])

  const handleEditKeyDown = useCallback((e, tierId) => {
    if (e.key === 'Enter') {
      handleConfirmEdit(tierId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }, [handleConfirmEdit, handleCancelEdit])

  const handleCardDragStart = useCallback((e, gameId) => {
    setDraggedGameId(gameId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', gameId)
    e.currentTarget.style.opacity = '0.4'
  }, [])

  const handleCardDragEnd = useCallback((e) => {
    e.currentTarget.style.opacity = '1'
    setDraggedGameId(null)
    setDropTarget(null)
  }, [])

  const handleCardDragOver = useCallback((e, tierId, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const mid = rect.left + rect.width / 2
    const insertIndex = e.clientX < mid ? index : index + 1
    setDropTarget((prev) => {
      if (prev?.tierId === tierId && prev.index === insertIndex) return prev
      return { tierId, index: insertIndex }
    })
  }, [])

  const handleRowDragOver = useCallback((e, tierId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const tierGames = groupsData[tierId] || []
    setDropTarget((prev) => {
      if (prev?.tierId === tierId && prev.index === tierGames.length) return prev
      return { tierId, index: tierGames.length }
    })
  }, [groupsData])

  const handleDragLeave = useCallback((e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback((e, tierId) => {
    e.preventDefault()
    const gameId = e.dataTransfer.getData('text/plain')
    if (!gameId) return

    const currentGames = (groupsData[tierId] || []).filter((g) => g.id !== gameId)
    const target = dropTargetRef.current
    let insertAt = target?.tierId === tierId ? target.index : currentGames.length
    insertAt = Math.min(insertAt, currentGames.length)

    setManualAssignments((prev) => {
      const next = { ...prev }
      next[gameId] = tierId
      return next
    })

    setTierOrders((prev) => {
      const next = { ...prev }

      for (const tid of Object.keys(next)) {
        next[tid] = next[tid].filter((id) => id !== gameId)
      }

      const explicitOrder = (next[tierId] || []).filter((id) => id !== gameId)
      const autoGames = currentGames
        .filter((g) => !explicitOrder.includes(g.id))
        .map((g) => g.id)
      const fullOrder = [...explicitOrder, ...autoGames]
      fullOrder.splice(insertAt, 0, gameId)
      next[tierId] = fullOrder

      return next
    })

    setDraggedGameId(null)
    setDropTarget(null)
  }, [groupsData])

  function handleResetToRatings() {
    setManualAssignments({})
    setTierOrders({})
  }

  async function handleSaveTierList() {
    setSaveState('saving')

    const fullOrders = {}
    sortedTiers.forEach((tierId) => {
      fullOrders[tierId] = (groupsData[tierId] || []).map((g) => g.id)
    })

    const tierArray = Object.entries(tierLabels).map(([id, info]) => ({
      id,
      label: info.label,
      minScore: info.minScore ?? DEFAULT_MIN_SCORES[id],
      color: info.color || TIER_COLORS[id]
    }))

    await window.api.storage.saveTiers({
      tiers: tierArray,
      assignments: manualAssignments,
      tierOrders: fullOrders
    })

    setTierOrders(fullOrders)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
    if (onTiersSaved) onTiersSaved()
  }

  const totalAssigned = Object.keys(manualAssignments).length

  return (
    <div className="tier-list">
      <div className="tier-list-toolbar">
        <button
          className="tier-reset-btn"
          onClick={handleResetToRatings}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 7a6 6 0 1 1 1.2 3.6" />
            <path d="M1 11V7h4" />
          </svg>
          Reset to Ratings
        </button>

        {totalAssigned > 0 && (
          <span className="tier-assignment-count">{totalAssigned} manually assigned</span>
        )}

        <div className="tier-list-toolbar-spacer" />

        <button
          className={`tier-save-btn ${saveState === 'saved' ? 'tier-save-btn--saved' : ''}`}
          onClick={handleSaveTierList}
          disabled={saveState === 'saving'}
        >
          {saveState === 'saving' ? (
            'Saving...'
          ) : saveState === 'saved' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 7.5l3 3 6-6.5" />
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 12.5H2.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h6l3 3v7a1 1 0 0 1-1 1z" />
                <path d="M9 1.5v3h3" />
                <path d="M4.5 8.5h5" />
                <path d="M4.5 10.5h3" />
              </svg>
              Save Tier List
            </>
          )}
        </button>
      </div>

      {sortedTiers.map((tierId) => {
        const info = tierLabels[tierId]
        const label = info?.label ?? tierId
        const color = info?.color ?? TIER_COLORS[tierId]
        const tierGames = groupsData[tierId] || []
        const isEditing = editingTier === tierId
        const isDropTarget = dropTarget?.tierId === tierId

        return (
          <TierRow
            key={tierId}
            tierId={tierId}
            label={label}
            color={color}
            tierGames={tierGames}
            isEditing={isEditing}
            editValue={isEditing ? editValue : ''}
            isDropTarget={isDropTarget}
            dropIndex={isDropTarget ? dropTarget.index : null}
            draggedGameId={draggedGameId}
            coverUrls={coverUrls}
            onStartEdit={handleStartEdit}
            onEditChange={handleEditChange}
            onEditKeyDown={handleEditKeyDown}
            onConfirmEdit={handleConfirmEdit}
            onRowDragOver={handleRowDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onCardDragStart={handleCardDragStart}
            onCardDragOver={handleCardDragOver}
            onCardDragEnd={handleCardDragEnd}
          />
        )
      })}
    </div>
  )
}

export default TierList
