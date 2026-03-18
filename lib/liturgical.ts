// ── Liturgical calendar ────────────────────────────────────────────────────────
// Pure computed functions. No AI. No external calls.
// Returns observances relevant to a given date range and tradition.

export type LiturgicalAction = 'pause' | 'pivot' | 'adapt'

export interface LiturgicalObservance {
  date: Date
  name: string
  description: string
  suggestedAction: LiturgicalAction
  traditions: string[]    // empty = all traditions
  weekOffset?: number     // set when matched to a series week
}

// ── Easter calculation (Computus algorithm) ────────────────────────────────────
export function computeEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

// ── Nth weekday in month ───────────────────────────────────────────────────────
// weekday: 0=Sun, 1=Mon... n: 1=first, -1=last
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = new Date(year, month, 1)
    const offset = (weekday - first.getDay() + 7) % 7
    return new Date(year, month, 1 + offset + (n - 1) * 7)
  } else {
    // Last occurrence
    const last = new Date(year, month + 1, 0)
    const offset = (last.getDay() - weekday + 7) % 7
    return new Date(year, month, last.getDate() - offset)
  }
}

// ── Last Sunday of October (Reformation Sunday) ───────────────────────────────
function reformationSunday(year: number): Date {
  return nthWeekdayOfMonth(year, 9, 0, -1) // last Sunday of October
}

// ── First Sunday of Advent (4 Sundays before Christmas) ───────────────────────
function adventStart(year: number): Date {
  const christmas = new Date(year, 11, 25)
  const dayOfWeek = christmas.getDay() // 0=Sun
  // 4th Sunday before Christmas
  const daysBack = dayOfWeek === 0 ? 28 : dayOfWeek + 21
  return new Date(year, 11, 25 - daysBack)
}

// ── Build observance list for a year ──────────────────────────────────────────
export function getObservancesForYear(year: number): LiturgicalObservance[] {
  const easter = computeEaster(year)
  const easterMs = easter.getTime()

  const obs: LiturgicalObservance[] = [
    // ── Universal Christian ───────────────────────────────────────────────────
    {
      date: new Date(year, 0, 6),
      name: 'Epiphany',
      description: 'Celebration of the visit of the Magi; marks the end of the Christmas season.',
      suggestedAction: 'adapt',
      traditions: [],
    },
    {
      date: new Date(easterMs - 46 * 86400000), // 46 days before Easter = Ash Wednesday
      name: 'Ash Wednesday',
      description: 'Beginning of Lent. A significant penitential observance.',
      suggestedAction: 'pivot',
      traditions: ['catholic', 'lutheran', 'anglican', 'methodist', 'presbyterian', 'reformed'],
    },
    {
      date: new Date(easterMs - 7 * 86400000),
      name: 'Palm Sunday',
      description: 'Entry of Jesus into Jerusalem. First day of Holy Week.',
      suggestedAction: 'pivot',
      traditions: [],
    },
    {
      date: new Date(easterMs - 2 * 86400000),
      name: 'Good Friday',
      description: 'Commemoration of the crucifixion. Many traditions hold special services.',
      suggestedAction: 'pivot',
      traditions: [],
    },
    {
      date: easter,
      name: 'Easter Sunday',
      description: 'Resurrection of Christ. The central Christian observance.',
      suggestedAction: 'pause',
      traditions: [],
    },
    {
      date: new Date(easterMs + 39 * 86400000),
      name: 'Ascension',
      description: "Christ's ascension into heaven. Observed Thursday (39 days post-Easter).",
      suggestedAction: 'adapt',
      traditions: ['catholic', 'lutheran', 'anglican', 'eastern_orthodox'],
    },
    {
      date: new Date(easterMs + 49 * 86400000),
      name: 'Pentecost Sunday',
      description: 'Commemorates the outpouring of the Holy Spirit. 50 days after Easter.',
      suggestedAction: 'adapt',
      traditions: [],
    },
    {
      date: adventStart(year),
      name: 'First Sunday of Advent',
      description: 'Advent begins. 4-week season of preparation for Christmas.',
      suggestedAction: 'pivot',
      traditions: [],
    },
    {
      date: new Date(year, 11, 25),
      name: 'Christmas Day',
      description: 'Celebration of the birth of Christ.',
      suggestedAction: 'pause',
      traditions: [],
    },

    // ── Tradition-specific ────────────────────────────────────────────────────
    {
      date: reformationSunday(year),
      name: 'Reformation Sunday',
      description: 'Commemoration of the Protestant Reformation (October 31, 1517).',
      suggestedAction: 'pivot',
      traditions: ['lutheran', 'reformed', 'presbyterian', 'baptist'],
    },
    {
      date: nthWeekdayOfMonth(year, 10, 0, 1), // first Sunday of November
      name: 'All Saints Sunday',
      description: 'Remembrance of the saints who have gone before.',
      suggestedAction: 'adapt',
      traditions: ['catholic', 'lutheran', 'anglican', 'methodist', 'episcopal'],
    },
  ]

  return obs.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ── Get observances for a date range ──────────────────────────────────────────
export function getObservancesInRange(
  startDate: Date,
  weeks: number,
  tradition: string
): LiturgicalObservance[] {
  const endDate = new Date(startDate.getTime() + weeks * 7 * 86400000)

  const startYear = startDate.getFullYear()
  const endYear = endDate.getFullYear()
  const years = startYear === endYear ? [startYear] : [startYear, endYear]
  const allObs: LiturgicalObservance[] = []
  for (const year of years) {
    allObs.push(...getObservancesForYear(year))
  }

  return allObs.filter(obs => {
    const inRange = obs.date >= startDate && obs.date <= endDate
    const relevantTradition = obs.traditions.length === 0 || obs.traditions.includes(tradition)
    return inRange && relevantTradition
  })
}

// ── Match observances to series weeks ─────────────────────────────────────────
// Returns observances annotated with the week number they fall in
export function matchObservancesToWeeks(
  startDate: Date,
  weeks: number,
  tradition: string
): (LiturgicalObservance & { weekOffset: number })[] {
  const observances = getObservancesInRange(startDate, weeks, tradition)

  return observances.map(obs => {
    const msSinceStart = obs.date.getTime() - startDate.getTime()
    const weekOffset = Math.floor(msSinceStart / (7 * 86400000)) + 1
    return { ...obs, weekOffset: Math.max(1, Math.min(weekOffset, weeks)) }
  })
}

// ── Format observance list for AI prompt ──────────────────────────────────────
export function formatObservancesForPrompt(
  observances: (LiturgicalObservance & { weekOffset: number })[]
): string {
  if (!observances.length) return 'No major liturgical observances in this series window.'
  return observances
    .map(o => `Week ${o.weekOffset}: ${o.name} (${o.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) — ${o.description}`)
    .join('\n')
}

// ── Describe tradition for prompts ────────────────────────────────────────────
export function traditionDisplayName(tradition: string): string {
  const map: Record<string, string> = {
    reformed: 'Reformed / Calvinist',
    presbyterian: 'Presbyterian',
    baptist: 'Baptist',
    methodist: 'Methodist / Wesleyan',
    lutheran: 'Lutheran',
    anglican: 'Anglican / Episcopal',
    pentecostal: 'Pentecostal / Charismatic',
    catholic: 'Roman Catholic',
    eastern_orthodox: 'Eastern Orthodox',
    nondenominational: 'Non-denominational evangelical',
  }
  return map[tradition] ?? tradition
}