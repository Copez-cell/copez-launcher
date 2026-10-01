export const UNIVERSAL_CRITERIA = [
  { key: 'graphics', label: 'Graphics' },
  { key: 'music', label: 'Music' },
  { key: 'admiration', label: 'Admiration' },
  { key: 'gameplay', label: 'Gameplay' }
]

export const GENRE_CRITERIA = {
  'Standard/Action': [
    { key: 'levelDesign', label: 'Level Design' },
    { key: 'core', label: 'Core' },
    { key: 'replayability', label: 'Replayability' }
  ],
  'Narrative/RPG': [
    { key: 'story', label: 'Story' },
    { key: 'characters', label: 'Characters' },
    { key: 'dialogues', label: 'Dialogues' },
    { key: 'world', label: 'World' }
  ],
  'Sandbox/Survival': [
    { key: 'world', label: 'World' },
    { key: 'creativity', label: 'Creativity' },
    { key: 'replayability', label: 'Replayability' }
  ]
}

export const GENRE_OPTIONS = Object.keys(GENRE_CRITERIA)

export function getCriteriaForGenre(genre) {
  const genreSpecific = GENRE_CRITERIA[genre] || []
  return [...UNIVERSAL_CRITERIA, ...genreSpecific]
}

export function getActiveKeys(genre) {
  return getCriteriaForGenre(genre).map((c) => c.key)
}

export function computeAverage(ratings, genre) {
  const keys = getActiveKeys(genre)
  const values = keys
    .map((key) => ratings[key])
    .filter((v) => typeof v === 'number')
  if (values.length === 0) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}
