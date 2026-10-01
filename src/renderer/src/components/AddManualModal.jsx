import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, getReadyPromise } from '../lib/supabase'
import { escapeLike } from '../lib/gameCatalog'

const CONSOLE_OPTIONS = [
  'PS1', 'PS2', 'PS3', 'PSP', 'PS Vita',
  'Nintendo 64', 'GameCube', 'Wii', 'Wii U', 'Switch',
  'NES', 'SNES', 'GBA', 'Game Boy', 'Game Boy Color', 'DS', '3DS',
  'Genesis', 'Dreamcast', 'Saturn',
  'Xbox', 'Xbox 360', 'Arcade', 'Other'
]

function AddManualModal({ open, onClose, onAdded }) {
  const [title, setTitle] = useState('')
  const [developer, setDeveloper] = useState('')
  const [publisher, setPublisher] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [launchType, setLaunchType] = useState('executable')
  const [launchTarget, setLaunchTarget] = useState('')
  const [console, setConsole] = useState('')
  const [emulatorPath, setEmulatorPath] = useState('')
  const [romPath, setRomPath] = useState('')
  const [saveDataPath, setSaveDataPath] = useState('')

  const [suggestions, setSuggestions] = useState([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)

  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchIdRef = useRef(0)

  const search = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([])
      setSuggestionsOpen(false)
      setSearching(false)
      return
    }

    const q = query.trim()
    const requestId = ++searchIdRef.current
    setSearching(true)

    const communityP = (async () => {
      await getReadyPromise()
      const esc = escapeLike(q)
      const { data } = await supabase
        .from('games')
        .select('id, title, cover_url')
        .eq('is_deleted', false)
        .ilike('title', `%${esc}%`)
        .order('title')
        .limit(5)
      return (data || []).map((g) => ({
        id: g.id,
        name: g.title,
        background_image: g.cover_url || null,
        released: null,
        genres: [],
        source: 'community',
      }))
    })().catch(() => [])

    const steamP = window.api.game
      .searchAutocomplete(q)
      .then((result) =>
        result && result.success && result.results.length > 0
          ? result.results.map((r) => ({ ...r, source: 'steam' }))
          : []
      )
      .catch(() => [])

    const apply = (community, steam) => {
      if (searchIdRef.current !== requestId) return
      const results = [...steam, ...community]
      setSuggestions(results)
      setSuggestionsOpen(results.length > 0)
      setSearching(false)
    }

    communityP.then((community) => apply(community, []))
    Promise.all([communityP, steamP]).then(([community, steam]) => apply(community, steam))
  }, [])

  function handleTitleChange(e) {
    const val = e.target.value
    setTitle(val)
    setSelectedSuggestion(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  async function handleSuggestionClick(suggestion) {
    setSelectedSuggestion(suggestion)
    setTitle(suggestion.name)
    setSuggestionsOpen(false)
    setSuggestions([])

    if (suggestion.released) {
      setReleaseDate(suggestion.released)
    }

    if (suggestion.id && suggestion.source !== 'community') {
      try {
        const result = await window.api.fetchGameData(suggestion.name)
        if (result.success && result.data) {
          const d = result.data
          if (d.developers?.length) setDeveloper(d.developers[0])
          if (d.publishers?.length) setPublisher(d.publishers[0])
          if (d.released) setReleaseDate(d.released)
        }
      } catch {}
    }
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Escape') {
      setSuggestionsOpen(false)
    } else if (e.key === 'ArrowDown' && suggestionsOpen && suggestions.length > 0) {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll('.autocomplete-item')
      items?.[0]?.focus()
    }
  }

  function handleDropdownKeyDown(e, suggestion) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSuggestionClick(suggestion)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll('.autocomplete-item')
      const idx = Array.from(items).indexOf(e.target)
      items?.[idx + 1]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll('.autocomplete-item')
      const idx = Array.from(items).indexOf(e.target)
      if (idx === 0) inputRef.current?.focus()
      else items?.[idx - 1]?.focus()
    } else if (e.key === 'Escape') {
      setSuggestionsOpen(false)
      inputRef.current?.focus()
    }
  }

  async function handleSubmit() {
    if (!title.trim()) return

    const extras = {
      skipAutoFetch: !!selectedSuggestion,
      releaseDate: releaseDate || null,
      developer: developer || null,
      publisher: publisher || null,
      rawgId: selectedSuggestion?.source === 'community' ? null : (selectedSuggestion?.id || null),
      background_image: selectedSuggestion?.background_image || null,
      genres: selectedSuggestion?.genres || [],
      launchType,
      launchTarget: launchType === 'emulated' ? '' : (launchTarget.trim() || ''),
      emulatorPath: emulatorPath.trim() || '',
      romPath: romPath.trim() || '',
      console: console || '',
      saveDataPath: saveDataPath.trim() || ''
    }

    const result = await window.api.game.addManual(title.trim(), extras)
    if (result.success) {
      onAdded?.(result.game)
    }
    handleClose()
  }

  function handleClose() {
    setTitle('')
    setDeveloper('')
    setPublisher('')
    setReleaseDate('')
    setLaunchType('executable')
    setLaunchTarget('')
    setConsole('')
    setEmulatorPath('')
    setRomPath('')
    setSaveDataPath('')
    setSuggestions([])
    setSuggestionsOpen(false)
    setSelectedSuggestion(null)
    onClose()
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setSuggestionsOpen(false)
      }
    }
    if (suggestionsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [suggestionsOpen])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-box add-manual-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-heading">Add Game Manually</h3>

        <div className="autocomplete-wrap">
          <div className="autocomplete-input-row">
            <input
              ref={inputRef}
              className="modal-input autocomplete-input"
              type="text"
              placeholder="Search game title..."
              value={title}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
              autoFocus
            />
            {searching && (
              <div className="autocomplete-spinner" />
            )}
          </div>

          {suggestionsOpen && suggestions.length > 0 && (
            <div className="autocomplete-dropdown" ref={dropdownRef}>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  className="autocomplete-item"
                  tabIndex={0}
                  onClick={() => handleSuggestionClick(s)}
                  onKeyDown={(e) => handleDropdownKeyDown(e, s)}
                >
                  {s.background_image ? (
                    <img className="autocomplete-thumb" src={s.background_image} alt="" draggable={false} />
                  ) : (
                    <div className="autocomplete-thumb autocomplete-thumb--placeholder">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
                        <circle cx="5" cy="5.5" r="1" />
                        <path d="M1.5 10l3-3 2 1.5 3-4 3 3.5" />
                      </svg>
                    </div>
                  )}
                  <div className="autocomplete-info">
                    <span className="autocomplete-name">{s.name}</span>
                    <span className="autocomplete-meta">
                      {s.source === 'community' ? (
                        <span className="autocomplete-source">Community library</span>
                      ) : (
                        <>
                          {s.released ? s.released.split('-')[0] : ''}
                          {s.released && s.genres?.length ? ' · ' : ''}
                          {s.genres?.slice(0, 2).join(', ')}
                        </>
                      )}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedSuggestion && (
          <div className="autocomplete-selected-hint">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5l2.5 2.5 4.5-5" />
            </svg>
            {selectedSuggestion.source === 'community'
              ? 'From the community library'
              : 'Pre-filled from Steam Storefront'}
          </div>
        )}

        <div className="add-manual-fields">
          <div className="add-manual-field">
            <label className="add-manual-label">Platform</label>
            <select
              className="add-manual-select"
              value={launchType}
              onChange={(e) => {
                setLaunchType(e.target.value)
                setLaunchTarget('')
                setEmulatorPath('')
                setRomPath('')
                setConsole('')
              }}
            >
              <option value="executable">Executable</option>
              <option value="steam">Steam</option>
              <option value="epic">Epic Games</option>
              <option value="emulated">Emulator</option>
            </select>
          </div>

          {launchType === 'emulated' ? (
            <>
              <div className="add-manual-field">
                <label className="add-manual-label">Console / System</label>
                <select
                  className="add-manual-select"
                  value={console}
                  onChange={(e) => setConsole(e.target.value)}
                >
                  <option value="">Select console...</option>
                  {CONSOLE_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="add-manual-field add-manual-field--wide">
                <label className="add-manual-label">Emulator Executable</label>
                <div className="add-manual-path-row">
                  <input
                    className="modal-input add-manual-path-input"
                    type="text"
                    placeholder="Path to emulator .exe"
                    value={emulatorPath}
                    onChange={(e) => setEmulatorPath(e.target.value)}
                  />
                  <button
                    className="add-manual-browse-btn"
                    onClick={async () => {
                      const result = await window.api.settings.selectEmulator()
                      if (!result.canceled && result.path) setEmulatorPath(result.path)
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
              <div className="add-manual-field add-manual-field--wide">
                <label className="add-manual-label">ROM File</label>
                <div className="add-manual-path-row">
                  <input
                    className="modal-input add-manual-path-input"
                    type="text"
                    placeholder="Path to ROM file"
                    value={romPath}
                    onChange={(e) => setRomPath(e.target.value)}
                  />
                  <button
                    className="add-manual-browse-btn"
                    onClick={async () => {
                      const result = await window.api.settings.selectRom()
                      if (!result.canceled && result.path) setRomPath(result.path)
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            </>
          ) : launchType === 'executable' ? (
            <div className="add-manual-field add-manual-field--wide">
              <label className="add-manual-label">Executable Path</label>
              <div className="add-manual-path-row">
                <input
                  className="modal-input add-manual-path-input"
                  type="text"
                  placeholder="Path to the game's .exe"
                  value={launchTarget}
                  onChange={(e) => setLaunchTarget(e.target.value)}
                />
                <button
                  className="add-manual-browse-btn"
                  onClick={async () => {
                    const result = await window.api.settings.selectExecutable()
                    if (!result.canceled && result.path) setLaunchTarget(result.path)
                  }}
                >
                  Browse
                </button>
              </div>
            </div>
          ) : (
            <div className="add-manual-field add-manual-field--wide">
              <label className="add-manual-label">
                {launchType === 'steam' ? 'Steam App ID' : 'Epic Catalog Namespace'}
              </label>
              <input
                className="modal-input"
                type="text"
                placeholder={
                  launchType === 'steam'
                    ? 'e.g. 730'
                    : 'e.g. Fortnite:DefaultGame'
                }
                value={launchTarget}
                onChange={(e) => setLaunchTarget(e.target.value)}
              />
            </div>
          )}
          <div className="add-manual-field">
            <label className="add-manual-label">Developer</label>
            <input
              className="modal-input"
              type="text"
              placeholder="Optional"
              value={developer}
              onChange={(e) => setDeveloper(e.target.value)}
            />
          </div>
          <div className="add-manual-field">
            <label className="add-manual-label">Publisher</label>
            <input
              className="modal-input"
              type="text"
              placeholder="Optional"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </div>
          <div className="add-manual-field">
            <label className="add-manual-label">Release Date</label>
            <input
              className="modal-input"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
          <div className="add-manual-field add-manual-field--wide">
            <label className="add-manual-label">Save Data Folder</label>
            <div className="add-manual-path-row">
              <input
                className="modal-input add-manual-path-input"
                type="text"
                placeholder="Auto-backup folder on game close (supports %APPDATA%, etc.)"
                value={saveDataPath}
                onChange={(e) => setSaveDataPath(e.target.value)}
              />
              <button
                className="add-manual-browse-btn"
                onClick={async () => {
                  const result = await window.api.settings.selectSaveDataFolder()
                  if (!result.canceled && result.path) setSaveDataPath(result.path)
                }}
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-cancel" onClick={handleClose}>Cancel</button>
          <button className="modal-confirm" onClick={handleSubmit}>Add</button>
        </div>
      </div>
    </div>
  )
}

export default AddManualModal
