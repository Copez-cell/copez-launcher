import { useState, useEffect, useMemo } from 'react'
import { getRatingColor } from '../utils/ratingColor'
import {
  UNIVERSAL_CRITERIA,
  GENRE_CRITERIA,
  GENRE_OPTIONS,
  getCriteriaForGenre,
  computeAverage
} from '../utils/ratingCriteria'
import TemplateDropdown from './TemplateDropdown'

function RatingSlider({ label, value, onChange }) {
  const percentage = (value / 10) * 100
  const color = getRatingColor(value)

  return (
    <div className="rating-slider-row">
      <label className="rating-slider-label">{label}</label>
      <div className="rating-slider-track-wrap">
        <input
          type="range"
          className="rating-slider-input"
          min="0"
          max="10"
          step="0.1"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #2a2a2e ${percentage}%, #2a2a2e 100%)`
          }}
        />
      </div>
      <span className="rating-slider-value">{value.toFixed(1)}</span>
    </div>
  )
}

function RatePage({ games, selectedGame, onRatingSaved }) {
  const [ratings, setRatings] = useState({})
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    if (selectedGame) {
      const existing = selectedGame.ratings || {}
      setRatings(existing)
      setSelectedTemplate(existing.selectedTemplate || '')
    } else {
      setRatings({})
      setSelectedTemplate('')
    }
    setSaveMessage('')
  }, [selectedGame])

  const average = useMemo(() => {
    return computeAverage(ratings, selectedTemplate)
  }, [ratings, selectedTemplate])

  function handleSliderChange(key, value) {
    setRatings((prev) => ({ ...prev, [key]: value }))
  }

  function handleTemplateChange(genre) {
    const prevGenre = selectedTemplate
    const prevKeys = getCriteriaForGenre(prevGenre).map((c) => c.key)
    const newKeys = getCriteriaForGenre(genre).map((c) => c.key)
    setRatings((r) => {
      const next = { ...r }
      prevKeys.forEach((k) => {
        if (!newKeys.includes(k)) delete next[k]
      })
      return next
    })
    setSelectedTemplate(genre)
  }

  async function handleSave() {
    if (!selectedGame) return
    setSaving(true)
    const activeKeys = getCriteriaForGenre(selectedTemplate).map((c) => c.key)
    const cleanRatings = { selectedTemplate }
    activeKeys.forEach((k) => {
      if (ratings[k] !== undefined) cleanRatings[k] = ratings[k]
    })
    await window.api.storage.saveRatings(selectedGame.id, cleanRatings)
    setSaving(false)
    setSaveMessage('Ratings saved')
    if (onRatingSaved) onRatingSaved()
    setTimeout(() => setSaveMessage(''), 2000)
  }

  async function handleClearRatings() {
    if (!selectedGame) return
    setSaving(true)
    setRatings({})
    setSelectedTemplate('')
    await window.api.storage.saveRatings(selectedGame.id, {})
    setSaving(false)
    setSaveMessage('Ratings cleared')
    if (onRatingSaved) onRatingSaved()
    setTimeout(() => setSaveMessage(''), 2000)
  }

  if (!selectedGame) {
    return (
      <div className="rate-page-empty">
        <p>Select a game from the library to rate it.</p>
      </div>
    )
  }

  const ratingColor = getRatingColor(average)

  return (
    <div className="rate-page">
      <div className="rate-page-header">
        <div className="rate-page-game-info">
          <h2 className="rate-page-game-title">{selectedGame.title}</h2>
          <div
            className="rate-page-average"
            style={{ color: ratingColor }}
          >
            {average.toFixed(1)}
          </div>
        </div>

        <TemplateDropdown
          value={selectedTemplate}
          options={GENRE_OPTIONS}
          onChange={handleTemplateChange}
          placeholder="Select Template..."
        />
      </div>

      {selectedTemplate ? (
        <div className="rate-page-sliders">
          <div className="rate-slider-section">
            <h3 className="rate-slider-section-title">Universal</h3>
            {UNIVERSAL_CRITERIA.map((cat) => (
              <RatingSlider
                key={cat.key}
                label={cat.label}
                value={ratings[cat.key] ?? 5.0}
                onChange={(val) => handleSliderChange(cat.key, val)}
              />
            ))}
          </div>

          <div className="rate-slider-section">
            <h3 className="rate-slider-section-title">{selectedTemplate}</h3>
            {GENRE_CRITERIA[selectedTemplate]?.map((cat) => (
              <RatingSlider
                key={cat.key}
                label={cat.label}
                value={ratings[cat.key] ?? 5.0}
                onChange={(val) => handleSliderChange(cat.key, val)}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="rating-genre-hint">Select a template above to configure rating criteria.</p>
      )}

      <div className="rate-page-footer">
        <button
          className="rate-save-btn"
          onClick={handleSave}
          disabled={saving || !selectedTemplate}
        >
          {saving ? 'Saving...' : 'Save Ratings'}
        </button>
        <button
          className="rate-clear-btn"
          onClick={handleClearRatings}
          disabled={saving}
        >
          Clear Ratings
        </button>
        {saveMessage && <span className="rate-save-msg">{saveMessage}</span>}
      </div>
    </div>
  )
}

export default RatePage
