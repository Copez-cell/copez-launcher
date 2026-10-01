import { useLazyImage } from '../hooks/useLazyImage'
import { getRatingColor } from '../utils/ratingColor'
import PlatinumBadge from './PlatinumBadge'

function GameListRow({ game, onGameSelect, onLaunchGame, onLinkExe }) {
  const { ref, src } = useLazyImage(game.id, game.coverImage, true, game.coverUrl || null)
  const isUnlinked = !game.exePath && !game.launchTarget
  const hasRating = game.averageRating > 0
  const ratingColor = hasRating ? getRatingColor(game.averageRating) : null

  return (
    <div
      ref={ref}
      className="game-list-row"
      onClick={() => onGameSelect(game)}
    >
      <div className="game-list-image">
        {src ? (
          <img src={src} alt={game.title} loading="lazy" />
        ) : (
          <div className="game-list-placeholder">{game.title[0]}</div>
        )}
      </div>
      <div className="game-list-info">
        <h3 className="game-list-title">
          {game.title}
          {game.isPlatinum && <PlatinumBadge size="small" />}
        </h3>
        <div className="game-list-meta">
          {isUnlinked ? (
            <span className="game-list-unlinked-tag">Not installed</span>
          ) : (
            <>
              {hasRating && (
                <span
                  className="game-list-rating"
                  style={{ color: ratingColor }}
                >
                  {game.averageRating.toFixed(1)}
                </span>
              )}
              {hasRating && <span className="game-list-sep">&#183;</span>}
              <span>{game.sessions} sessions</span>
              <span className="game-list-sep">&#183;</span>
              <span>
                {game.playtime > 0
                  ? `${Math.floor(game.playtime / 3600)}h ${Math.floor((game.playtime % 3600) / 60)}m`
                  : 'No playtime'}
              </span>
                {game.lastPlayed && (
                <>
                  <span className="game-list-sep">&#183;</span>
                  <span>Last: {new Date(game.lastPlayed).toLocaleDateString()}</span>
                </>
              )}
              {(() => {
                if (!game.dateFinished || game.dateFinished === 'Invalid Date') return null
                const d = new Date(game.dateFinished)
                if (isNaN(d.getTime())) return null
                return <>
                  <span className="game-list-sep">&#183;</span>
                  <span>Finished: {d.toLocaleDateString()}</span>
                </>
              })()}
            </>
          )}
        </div>
      </div>
      {isUnlinked ? (
        <button
          className="game-list-install-btn"
          onClick={(e) => {
            e.stopPropagation()
            onLinkExe(game)
          }}
        >
          &#8615; Install
        </button>
      ) : (
        <button
          className="game-list-play"
          onClick={(e) => {
            e.stopPropagation()
            onLaunchGame(game.id)
          }}
        >
          &#9654; Play
        </button>
      )}
    </div>
  )
}

function GameList({ games, onGameSelect, onLaunchGame, onLinkExe }) {
  return (
    <div className="game-list">
      {games.map((game) => (
        <GameListRow
          key={game.id}
          game={game}
          onGameSelect={onGameSelect}
          onLaunchGame={onLaunchGame}
          onLinkExe={onLinkExe}
        />
      ))}
    </div>
  )
}

export default GameList
