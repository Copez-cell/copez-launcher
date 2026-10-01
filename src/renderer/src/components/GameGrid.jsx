import { useState, useEffect } from 'react'
import { useLazyImage } from '../hooks/useLazyImage'
import { getRatingColor } from '../utils/ratingColor'
import PlatinumBadge from './PlatinumBadge'

function GameCard({ game, onGameSelect, onLaunchGame, onLinkExe, onContextMenu, rank }) {
  // Shared catalog cover (Cloudflare R2) is the fallback when the player has
  // no local image for this game.
  const { ref, src } = useLazyImage(game.id, game.coverImage, true, game.coverUrl || null)
  const isUnlinked = !game.exePath && !game.launchTarget
  const hasRating = game.averageRating > 0
  const ratingColor = hasRating ? getRatingColor(game.averageRating) : null
  const finishedDate = (() => {
    if (!game.dateFinished || game.dateFinished === 'Invalid Date') return null
    const d = new Date(game.dateFinished)
    return isNaN(d.getTime()) ? null : d.toLocaleDateString()
  })()

  return (
    <div
      ref={ref}
      className="game-card"
      onClick={() => onGameSelect(game)}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, game)}
    >
      <div className="game-card-image">
        {rank != null && (
          <div className="game-card-rank">#{rank}</div>
        )}
        {src ? (
          <img src={src} alt={game.title} loading="lazy" />
        ) : (
          <div className="game-card-placeholder">{game.title[0]}</div>
        )}
        {hasRating && (
          <div
            className="game-card-rating"
            style={{ color: ratingColor }}
          >
            {game.averageRating.toFixed(1)}
          </div>
        )}
        {game.isPlatinum && <PlatinumBadge />}
        {isUnlinked ? (
          <button
            className="game-card-install-badge"
            onClick={(e) => {
              e.stopPropagation()
              onLinkExe(game)
            }}
          >
            &#8615; Install
          </button>
        ) : (
          <button
            className="game-card-play"
            onClick={(e) => {
              e.stopPropagation()
              onLaunchGame(game.id)
            }}
          >
            &#9654;
          </button>
        )}
      </div>
      <div className="game-card-info">
        <h3 className="game-card-title">{game.title}</h3>
        <p className="game-card-stats">
          {isUnlinked
            ? 'Not installed'
            : game.playtime > 0
              ? `${Math.floor(game.playtime / 3600)}h played`
              : 'Not played'}
          {finishedDate && <span className="game-card-finished"> &#183; Finished {finishedDate}</span>}
        </p>
      </div>
    </div>
  )
}

function GameGrid({ games, onGameSelect, onLaunchGame, onLinkExe, cardSize, showRanking, collections, onAddGameToCollection }) {
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
      return () => {
        document.removeEventListener('click', handleClick)
        document.removeEventListener('contextmenu', handleClick)
      }
    }
  }, [contextMenu])

  function handleContextMenu(e, game) {
    e.preventDefault()
    e.stopPropagation()
    if (!collections || collections.length === 0) return
    const margin = 8
    const estWidth = 16 * 16
    const estHeight = 40 + collections.length * 38
    const x = Math.max(margin, Math.min(e.clientX, window.innerWidth - estWidth - margin))
    const y = Math.max(margin, Math.min(e.clientY, window.innerHeight - estHeight - margin))
    setContextMenu({
      x,
      y,
      gameId: game.id,
      gameTitle: game.title
    })
  }

  function addToCollection(colId) {
    if (contextMenu) onAddGameToCollection(contextMenu.gameId, colId)
    setContextMenu(null)
  }

  return (
    <>
      <div className={`game-grid game-grid--${cardSize || 'medium'}`}>
        {games.map((game, i) => (
          <GameCard
            key={game.id}
            game={game}
            rank={showRanking ? i + 1 : null}
            onGameSelect={onGameSelect}
            onLaunchGame={onLaunchGame}
            onLinkExe={onLinkExe}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-label">{contextMenu.gameTitle}</div>
          <div className="context-menu-divider" />
          {collections.map((col) => (
            <button
              key={col.id}
              className="context-menu-item"
              onClick={() => addToCollection(col.id)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M6 2v8M2 6h8" />
              </svg>
              {col.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default GameGrid
