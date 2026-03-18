/**
 * Church Calendar Date Utilities
 * Computes dates for recurring liturgical/church events for a given year.
 */

// ── General: Sunday on or before a given date ──────────────────────────────────
// Returns the Sunday that falls on or before the given date.
export function sundayOnOrBefore(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - dow)
  return d
}

// ── General: Sunday before a given date (strictly before, not on) ─────────────
// Returns the most recent Sunday strictly before the given date.
export function sundayBefore(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  // If date is already Sunday, go back 7; otherwise go back to most recent Sunday
  d.setDate(d.getDate() - (dow === 0 ? 7 : dow))
  return d
}

// ── General: Nth Sunday before a date ─────────────────────────────────────────
export function nthSundayBefore(date: Date, n: number): Date {
  const d = sundayOnOrBefore(date)
  d.setDate(d.getDate() - (n - 1) * 7)
  return d
}

// ── Easter (Anonymous Gregorian algorithm) ─────────────────────────────────────
export function easterDate(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

// ── Palm Sunday = Sunday before Easter ────────────────────────────────────────
export function palmSundayDate(year: number): Date {
  const d = easterDate(year)
  d.setDate(d.getDate() - 7)
  return d
}

// ── Advent Start = 4th Sunday before Christmas ────────────────────────────────
// The 4th Sunday before Dec 25, counting Dec 25 itself if it's a Sunday.
// Equivalent to: Sunday on or before Dec 25, then go back 3 weeks.
export function adventStartDate(year: number): Date {
  const christmas = new Date(year, 11, 25)
  // 4th Sunday before Christmas = Sunday on or before Christmas, minus 3 weeks
  const sundayOfChristmas = sundayOnOrBefore(christmas)
  const advent = new Date(sundayOfChristmas)
  advent.setDate(advent.getDate() - 21)
  return advent
}

// ── Christmas = Dec 25 ────────────────────────────────────────────────────────
export function christmasDate(year: number): Date {
  return new Date(year, 11, 25)
}

// ── Reformation Sunday = Sunday on or before Oct 31 ──────────────────────────
// Reformed tradition observes this on the Sunday closest to Oct 31 (Halloween/
// Reformation Day). "On or before" means if Oct 31 is a Sunday, use it;
// otherwise use the Sunday immediately before it.
export function reformationSundayDate(year: number): Date {
  const oct31 = new Date(year, 9, 31)
  return sundayOnOrBefore(oct31)
}

// ── Key → compute function map ─────────────────────────────────────────────────
export const RECURRENCE_COMPUTERS: Record<string, (year: number) => Date> = {
  easter:             easterDate,
  palm_sunday:        palmSundayDate,
  advent_start:       adventStartDate,
  christmas:          christmasDate,
  reformation_sunday: reformationSundayDate,
}

// ── Compute date for a given recurrence key and year ──────────────────────────
export function computeRecurringDate(key: string, year: number): Date | null {
  const fn = RECURRENCE_COMPUTERS[key]
  return fn ? fn(year) : null
}

// ── Compute all built-in dates for a year range ───────────────────────────────
export function computeBuiltInDates(
  fromYear: number,
  toYear: number
): { key: string; name: string; date: Date }[] {
  const NAMES: Record<string, string> = {
    easter:             'Easter Sunday',
    palm_sunday:        'Palm Sunday',
    advent_start:       'Advent Sunday (1st)',
    christmas:          'Christmas',
    reformation_sunday: 'Reformation Sunday',
  }
  const results: { key: string; name: string; date: Date }[] = []
  for (let year = fromYear; year <= toYear; year++) {
    for (const [key, fn] of Object.entries(RECURRENCE_COMPUTERS)) {
      results.push({ key, name: NAMES[key] ?? key, date: fn(year) })
    }
  }
  return results
}

// ── ISO date string helper ────────────────────────────────────────────────────
export function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Format for display ────────────────────────────────────────────────────────
export function formatEventDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}
