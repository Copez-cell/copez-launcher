import { useMemo } from 'react'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function isDateInRange(date, start, end) {
  const d = date.getTime()
  return d >= start.getTime() && d <= end.getTime()
}

function getHoursFromLogs(game, rangeStart, rangeEnd) {
  if (!Array.isArray(game.hardwareLogs) || game.hardwareLogs.length === 0) return 0
  let seconds = 0
  for (const log of game.hardwareLogs) {
    try {
      const d = new Date(log.date)
      if (!isNaN(d.getTime()) && isDateInRange(d, rangeStart, rangeEnd)) {
        seconds += log.duration || 0
      }
    } catch {}
  }
  return seconds
}

function getProportionalPlaytime(game, rangeStart, rangeEnd) {
  const totalPlaytime = typeof game.playtime === 'number' ? game.playtime : 0
  if (totalPlaytime <= 0) return 0
  const lp = game.lastPlayed ? new Date(game.lastPlayed) : null
  if (!lp || isNaN(lp.getTime())) return 0

  let fp = game.firstPlayed ? new Date(game.firstPlayed) : null
  if (!fp || isNaN(fp.getTime())) {
    let earliest = Infinity
    if (game.historicalPlaytime && typeof game.historicalPlaytime === 'object') {
      for (const yearStr of Object.keys(game.historicalPlaytime)) {
        const year = Number(yearStr)
        if (!isNaN(year) && game.historicalPlaytime[yearStr] > 0) {
          earliest = Math.min(earliest, new Date(year, 0, 1).getTime())
        }
      }
    }
    if (earliest !== Infinity) {
      fp = new Date(Math.min(earliest, lp.getTime()))
    } else {
      fp = new Date(lp.getTime())
    }
  }

  const activeStart = fp < rangeStart ? rangeStart : fp
  const activeEnd = lp > rangeEnd ? rangeEnd : lp
  if (activeStart > activeEnd) return 0

  const totalSpanMs = lp.getTime() - fp.getTime()
  const overlapMs = activeEnd.getTime() - activeStart.getTime()
  if (totalSpanMs <= 0 || overlapMs <= 0) return 0
  return (totalPlaytime * overlapMs) / totalSpanMs
}

function distributeLogsToBuckets(game, rangeStart, rangeEnd, bucketFn, bucketCount) {
  const buckets = new Array(bucketCount).fill(0)
  if (!Array.isArray(game.hardwareLogs) || game.hardwareLogs.length === 0) return buckets
  for (const log of game.hardwareLogs) {
    try {
      const d = new Date(log.date)
      if (!isNaN(d.getTime()) && isDateInRange(d, rangeStart, rangeEnd)) {
        const idx = bucketFn(d)
        if (idx >= 0 && idx < bucketCount) {
          buckets[idx] += (log.duration || 0) / 3600
        }
      }
    } catch {}
  }
  return buckets
}

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric' }
  const s = start.toLocaleDateString(undefined, opts)
  const e = end.toLocaleDateString(undefined, opts)
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.toLocaleDateString(undefined, { ...opts, year: 'numeric' })} – ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.getDate()}, ${start.getFullYear()}`
  }
  return `${s} – ${e}, ${start.getFullYear()}`
}

const GENRE_WHITELIST = ['Action', 'Adventure', 'Indie', 'Racing', 'Sports', 'Simulator', 'RPG', 'Shooter']
const GENRE_WHITELIST_MAP = new Map(GENRE_WHITELIST.map((g) => [g.toLowerCase(), g]))

function normalizeGenre(raw) {
  const key = String(raw).trim().toLowerCase()
  return GENRE_WHITELIST_MAP.get(key) || null
}

function buildDistribution(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)
}

export default function useRewindStats(games, timeframe = 'year', referenceDate = new Date()) {
  return useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonthIndex = now.getMonth()

    const empty = {
      graphData: [],
      topGames: [],
      topRatedGames: [],
      headerLabel: '',
      timeframe,
      referenceDate,
      filtered: {
        totalHours: 0,
        totalSessions: 0,
        gamesPlayed: 0,
        inputSplit: { kbm: 100, controller: 0 },
        avgHoursPerWeek: 0,
        peakMonth: null,
        peakMonthHours: 0,
        genreDistribution: [],
        platinumGames: []
      },
      lifetime: {
        hours: 0,
        sessions: 0,
        gamesPlayed: 0,
        platinumCount: 0
      }
    }

    if (!games || games.length === 0) return empty

    function getHoursForYear(game, year) {
      const histKey = String(year)
      const histVal = game.historicalPlaytime?.[histKey]
      if (typeof histVal === 'number' && histVal > 0) {
        return histVal
      }
      return 0
    }

    let rangeStart, rangeEnd, graphLabels, bucketFn

    if (timeframe === 'year') {
      const year = referenceDate.getFullYear()
      rangeStart = new Date(year, 0, 1)
      rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999)
      graphLabels = MONTH_NAMES
      bucketFn = (d) => d.getMonth()
      empty.headerLabel = String(year)
    } else if (timeframe === 'month') {
      const year = referenceDate.getFullYear()
      const month = referenceDate.getMonth()
      const days = getDaysInMonth(year, month)
      rangeStart = new Date(year, month, 1)
      rangeEnd = new Date(year, month, days, 23, 59, 59, 999)
      graphLabels = Array.from({ length: days }, (_, i) => String(i + 1))
      bucketFn = (d) => d.getDate() - 1
      empty.headerLabel = referenceDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    } else {
      const monday = getMonday(referenceDate)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      rangeStart = monday
      rangeEnd = sunday
      graphLabels = DAY_NAMES
      bucketFn = (d) => {
        const dow = d.getDay()
        return dow === 0 ? 6 : dow - 1
      }
      empty.headerLabel = formatDateRange(monday, sunday)
    }

    const selectedYear = timeframe === 'year' ? referenceDate.getFullYear() : null

    const bucketCount = graphLabels.length
    const bucketAccum = new Array(bucketCount).fill(0)
    let totalSeconds = 0
    let totalSessions = 0
    let gamesPlayed = 0
    let emulatedSeconds = 0
    let nativeSeconds = 0

    const filteredGenreCounts = {}
    const filteredPlatinum = []

    for (const game of games) {
      let effectiveSeconds = 0
      let effectiveSessions = 0
      let inRange = false

      if (timeframe === 'year') {
        effectiveSeconds = getHoursForYear(game, selectedYear)
        inRange = effectiveSeconds > 0
      } else {
        const logSeconds = getHoursFromLogs(game, rangeStart, rangeEnd)
        if (logSeconds > 0) {
          effectiveSeconds = logSeconds
          inRange = true
        } else {
          const propSeconds = getProportionalPlaytime(game, rangeStart, rangeEnd)
          effectiveSeconds = propSeconds
          inRange = propSeconds > 0
        }
      }

      if (inRange) {
        const hours = effectiveSeconds / 3600
        totalSeconds += effectiveSeconds
        totalSessions += effectiveSessions
        if (effectiveSeconds > 0) gamesPlayed++

        if (timeframe !== 'year') {
          if (game.launchType === 'emulated') {
            emulatedSeconds += effectiveSeconds
          } else {
            nativeSeconds += effectiveSeconds
          }
        }

        if (Array.isArray(game.genres)) {
          for (const g of game.genres) {
            const canonical = normalizeGenre(g)
            if (canonical) filteredGenreCounts[canonical] = (filteredGenreCounts[canonical] || 0) + 1
          }
        }
      }
    }

    // Platinum showcase filtered by dateFinished against timeframe
    for (const game of games) {
      if (game.isPlatinum && game.dateFinished) {
        try {
          const d = new Date(game.dateFinished)
          if (!isNaN(d.getTime()) && isDateInRange(d, rangeStart, rangeEnd)) {
            filteredPlatinum.push({
              id: game.id,
              title: game.title,
              coverImage: game.coverImage || null
            })
          }
        } catch {}
      }
    }

    // Populate graph buckets — exact telemetry first, then smart fallback
    if (timeframe === 'year') {
      const gamesWithTelemetry = new Set()

      for (const game of games) {
        if (Array.isArray(game.hardwareLogs)) {
          for (const log of game.hardwareLogs) {
            try {
              const d = new Date(log.date)
              if (!isNaN(d.getTime()) && d.getFullYear() === selectedYear) {
                const month = d.getMonth()
                if (month >= 0 && month < bucketCount) {
                  bucketAccum[month] += (log.duration || 0) / 3600
                  gamesWithTelemetry.add(game.id)
                }
              }
            } catch {}
          }
        }
      }

      // Bookend fallback for manual data (no telemetry, has historical backfill)
      for (const game of games) {
        if (gamesWithTelemetry.has(game.id)) continue

        const histSeconds = game.historicalPlaytime?.[String(selectedYear)]
        if (typeof histSeconds !== 'number' || histSeconds <= 0) continue

        const totalHours = histSeconds / 3600

        let startMonth = 0
        if (game.firstPlayed) {
          const fp = new Date(game.firstPlayed)
          if (!isNaN(fp.getTime()) && fp.getFullYear() === selectedYear) {
            startMonth = fp.getMonth()
          }
        }

        let endMonth
        if (game.lastPlayed) {
          const lp = new Date(game.lastPlayed)
          if (!isNaN(lp.getTime()) && lp.getFullYear() === selectedYear) {
            endMonth = lp.getMonth()
          } else {
            endMonth = selectedYear === currentYear ? currentMonthIndex : 11
          }
        } else {
          endMonth = selectedYear === currentYear ? currentMonthIndex : 11
        }

        const activeMonths = endMonth - startMonth + 1
        if (activeMonths < 1) continue

        const chunk = totalHours / activeMonths
        for (let m = startMonth; m <= endMonth; m++) {
          bucketAccum[m] += chunk
        }
      }
    } else {
      for (const game of games) {
        const logBuckets = distributeLogsToBuckets(game, rangeStart, rangeEnd, bucketFn, bucketCount)
        const hasLogs = logBuckets.some((v) => v > 0)
        if (hasLogs) {
          for (let i = 0; i < bucketCount; i++) {
            bucketAccum[i] += logBuckets[i]
          }
        } else {
          const propSeconds = getProportionalPlaytime(game, rangeStart, rangeEnd)
          if (propSeconds > 0) {
            let fp = game.firstPlayed ? new Date(game.firstPlayed) : null
            if (!fp || isNaN(fp.getTime())) {
              let earliest = Infinity
              if (game.historicalPlaytime && typeof game.historicalPlaytime === 'object') {
                for (const yearStr of Object.keys(game.historicalPlaytime)) {
                  const year = Number(yearStr)
                  if (!isNaN(year) && game.historicalPlaytime[yearStr] > 0) {
                    earliest = Math.min(earliest, new Date(year, 0, 1).getTime())
                  }
                }
              }
              fp = earliest !== Infinity
                ? new Date(Math.min(earliest, new Date(game.lastPlayed).getTime()))
                : new Date(game.lastPlayed)
            }
            const lp = new Date(game.lastPlayed)
            const activeStart = fp < rangeStart ? rangeStart : fp
            const activeEnd = lp > rangeEnd ? rangeEnd : lp
            if (activeStart <= activeEnd) {
              const totalDays = Math.max(Math.ceil((lp.getTime() - fp.getTime()) / 86400000), 1)
              const dayMs = 86400000
              let covered = 0
              const bucketsInRange = []
              let cursor = new Date(activeStart)
              cursor.setHours(0, 0, 0, 0)
              while (cursor <= activeEnd) {
                const dayEnd = new Date(cursor.getTime() + dayMs)
                if (dayEnd >= activeStart && cursor <= activeEnd) {
                  const idx = bucketFn(cursor)
                  if (idx >= 0 && idx < bucketCount) {
                    bucketsInRange.push(idx)
                    covered++
                  }
                }
                cursor = dayEnd
              }
              if (covered > 0) {
                const chunk = propSeconds / covered / 3600
                for (const idx of bucketsInRange) {
                  bucketAccum[idx] += chunk
                }
              }
            }
          }
        }
      }
    }

    const totalTracked = emulatedSeconds + nativeSeconds
    const inputSplit = totalTracked > 0
      ? {
          kbm: Math.round((nativeSeconds / totalTracked) * 100),
          controller: Math.round((emulatedSeconds / totalTracked) * 100)
        }
      : { kbm: 100, controller: 0 }

    const topGames = games
      .map((game) => {
        let effectiveSeconds = 0
        let hours = 0
        let inRange = false

        if (timeframe === 'year') {
          effectiveSeconds = getHoursForYear(game, selectedYear)
          hours = effectiveSeconds / 3600
          inRange = effectiveSeconds > 0
        } else {
          const logSeconds = getHoursFromLogs(game, rangeStart, rangeEnd)
          if (logSeconds > 0) {
            effectiveSeconds = logSeconds
            hours = logSeconds / 3600
            inRange = true
          } else {
            const propSeconds = getProportionalPlaytime(game, rangeStart, rangeEnd)
            effectiveSeconds = propSeconds
            hours = propSeconds / 3600
            inRange = propSeconds > 0
          }
        }

        return { id: game.id, title: game.title, coverImage: game.coverImage || null, hours, seconds: effectiveSeconds, inRange }
      })
      .filter((g) => g.inRange && g.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .map((g) => ({
        ...g,
        percentage: totalSeconds > 0 ? Math.round((g.seconds / totalSeconds) * 100) : 0
      }))

    const topRatedGames = games
      .map((game) => {
        let inRange = false
        if (timeframe === 'year') {
          inRange = getHoursForYear(game, selectedYear) > 0
        } else if (game.lastPlayed) {
          try {
            const d = new Date(game.lastPlayed)
            if (!isNaN(d.getTime()) && isDateInRange(d, rangeStart, rangeEnd)) {
              inRange = true
            }
          } catch {}
        }
        const rating = game.averageRating || game.rawgRating || 0
        return { id: game.id, title: game.title, coverImage: game.coverImage || null, rating, inRange }
      })
      .filter((g) => g.inRange && g.rating > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10)

    const graphData = graphLabels.map((name, i) => ({
      name,
      hours: Math.round(bucketAccum[i] * 10) / 10
    }))

    const totalHours = Math.round(totalSeconds / 3600)

    let avgHoursPerWeek = 0
    if (timeframe === 'year') {
      if (selectedYear < currentYear) {
        avgHoursPerWeek = Math.round((totalHours / 52) * 10) / 10
      } else {
        const weeksElapsed = Math.max((Date.now() - new Date(currentYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24 * 7), 1)
        avgHoursPerWeek = Math.round((totalHours / weeksElapsed) * 10) / 10
      }
    } else if (timeframe === 'month') {
      const weeksInMonth = getDaysInMonth(referenceDate.getFullYear(), referenceDate.getMonth()) / 7
      avgHoursPerWeek = weeksInMonth > 0 ? Math.round((totalHours / weeksInMonth) * 10) / 10 : 0
    } else {
      avgHoursPerWeek = totalHours
    }

    let peakIndex = 0
    let peakHours = 0
    for (let i = 0; i < bucketCount; i++) {
      if (bucketAccum[i] > peakHours) {
        peakHours = bucketAccum[i]
        peakIndex = i
      }
    }

    let peakLabel = null
    if (peakHours > 0) {
      peakLabel = graphLabels[peakIndex]
    }

    // Lifetime (unfiltered, single source of truth per game)
    const lifetimeSeconds = games.reduce((sum, g) => sum + (typeof g.playtime === 'number' ? g.playtime : 0), 0)
    const lifetimeSessions = games.reduce((sum, g) => sum + (typeof g.sessions === 'number' ? g.sessions : 0), 0)
    const lifetimeGamesPlayed = games.filter((g) => typeof g.playtime === 'number' && g.playtime > 0).length
    const lifetimePlatinumCount = games.filter((g) => g.isPlatinum === true).length

    return {
      graphData,
      topGames,
      topRatedGames,
      headerLabel: empty.headerLabel,
      timeframe,
      referenceDate,
      filtered: {
        totalHours,
        totalSessions,
        gamesPlayed,
        inputSplit,
        avgHoursPerWeek,
        peakMonth: peakLabel,
        peakMonthHours: Math.round(peakHours * 10) / 10,
        genreDistribution: buildDistribution(filteredGenreCounts),
        platinumGames: filteredPlatinum
      },
      lifetime: {
        hours: Math.round(lifetimeSeconds / 3600),
        sessions: lifetimeSessions,
        gamesPlayed: lifetimeGamesPlayed,
        platinumCount: lifetimePlatinumCount
      }
    }
  }, [games, timeframe, referenceDate?.getTime?.()])
}
