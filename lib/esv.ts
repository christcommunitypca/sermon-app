// ── lib/esv.ts ─────────────────────────────────────────────────────────────────
// Fetches ESV passage text from api.esv.org.
<<<<<<< HEAD
// Caches verse text in scripture_cache.
// Also supports extracting ESV section headings for pericope setup.
=======
// Caches results in scripture_cache table — never re-fetches the same ref.
// Returns a flat array of VerseData objects, one per verse.
>>>>>>> f06f0a0aaec959e258a7d2c1d063c274c314df2e

import { supabaseAdmin } from '@/lib/supabase/admin'

export interface VerseData {
  verse_ref: string   // "John 3:16"
  verse_num: number   // 16
  text: string        // "For God so loved the world..."
}

<<<<<<< HEAD
export interface SectionHeader {
  label: string
  startVerse: string
  endVerse?: string
}

export interface PassageWithHeaders {
  verses: VerseData[]
  sections: SectionHeader[]
}

const ESV_HTML_API_BASE = 'https://api.esv.org/v3/passage/html'
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

const BOOKS_BY_NUMBER = [
  '',
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
] as const

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchPassage(ref: string): Promise<VerseData[]> {
  const normalizedRef = ref.trim()

=======
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text'

// Cache TTL — re-fetch after 90 days (scripture text doesn't change, but belt+suspenders)
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export async function fetchPassage(ref: string): Promise<VerseData[]> {
  const normalizedRef = ref.trim()

  // ── Check cache first ───────────────────────────────────────────────────────
>>>>>>> f06f0a0aaec959e258a7d2c1d063c274c314df2e
  const { data: cached } = await supabaseAdmin
    .from('scripture_cache')
    .select('passages, fetched_at')
    .eq('ref', normalizedRef)
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < CACHE_TTL_MS) {
      return cached.passages as VerseData[]
    }
  }

<<<<<<< HEAD
  const html = await fetchPassageHtml(normalizedRef, false)
  const verses = parseVersesFromHTML(html)

=======
  // ── Fetch from ESV API ──────────────────────────────────────────────────────
  const apiKey = process.env.ESV_API_KEY
  if (!apiKey) {
    throw new Error('ESV_API_KEY is not set. Add it to your .env.local file.')
  }

  const params = new URLSearchParams({
    q: normalizedRef,
    'include-headings': 'false',
    'include-footnotes': 'false',
    'include-verse-numbers': 'true',
    'include-short-copyright': 'false',
    'include-passage-references': 'false',
    'indent-paragraphs': '0',
    'indent-poetry': 'false',
    'include-selahs': 'false',
  })

  const res = await fetch(`${ESV_API_BASE}/?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ESV API error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json() as {
    passages: string[]
    canonical: string
    parsed?: Array<Array<[number, number]>>
  }

  const passages = data.passages ?? []
  if (passages.length === 0) {
    throw new Error(`ESV API returned no passages for "${ref}"`)
  }

  const verses = parseESVText(passages[0], data.canonical)

  // ── Write to cache ──────────────────────────────────────────────────────────
>>>>>>> f06f0a0aaec959e258a7d2c1d063c274c314df2e
  await supabaseAdmin
    .from('scripture_cache')
    .upsert({
      ref: normalizedRef,
      translation: 'ESV',
      passages: verses,
      fetched_at: new Date().toISOString(),
    })

  return verses
}

<<<<<<< HEAD
export async function fetchPassageWithHeaders(ref: string): Promise<PassageWithHeaders> {
  const normalizedRef = ref.trim()

  // Get clean verse text from the no-headings path, which also refreshes cache if needed.
  const verses = await fetchPassage(normalizedRef)

  // Separately fetch headings HTML so headings do not get mixed into verse text.
  const html = await fetchPassageHtml(normalizedRef, true)
  const sections = parseHeadersFromHTML(html, verses)

  return { verses, sections }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchPassageHtml(ref: string, includeHeadings: boolean): Promise<string> {
  const apiKey = process.env.ESV_API_KEY
  if (!apiKey) {
    throw new Error('ESV_API_KEY is not set. Add it to your .env.local file.')
  }

  const params = new URLSearchParams({
    q: ref,
    'include-headings': includeHeadings ? 'true' : 'false',
    'include-subheadings': includeHeadings ? 'true' : 'false',
    'include-footnotes': 'false',
    'include-verse-numbers': 'true',
    'include-first-verse-numbers': 'true',
    'include-short-copyright': 'false',
    'include-passage-references': 'false',
    'include-book-titles': 'false',
    'include-chapter-numbers': 'true',
    'include-verse-anchors': 'true',
  })

  const res = await fetch(`${ESV_HTML_API_BASE}/?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ESV HTML API error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json() as { passages?: string[] }
  const html = (data.passages ?? []).join('\n')

  if (!html.trim()) {
    throw new Error(`ESV HTML API returned no passage HTML for "${ref}"`)
  }

  return html
}

// ── Verse parsing from HTML ───────────────────────────────────────────────────
// We parse exact verse ids from markers like:
//   <b class="verse-num" id="v43011035-1">35 </b>
// This avoids reconstructing chapters from ambiguous plain-text markers.

function parseVersesFromHTML(html: string): VerseData[] {
  const markers = extractVerseMarkers(html)
  const verses: VerseData[] = []

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i]
    const next = markers[i + 1]

    const rawSlice = html.slice(current.end, next ? next.index : html.length)
    const verseRef = osisToVerseRef(current.code)
    const text = normalizeVerseText(rawSlice)

    if (!verseRef || !text) continue

    const parsed = parseVerseRef(verseRef)
    if (!parsed) continue

    verses.push({
      verse_ref: verseRef,
      verse_num: parsed.verse,
      text,
=======
// ── parseESVText ───────────────────────────────────────────────────────────────
// The ESV API returns a plain text block with inline verse numbers like:
//   [1] In the beginning was the Word, [2] and the Word was with God,
// We split on verse markers and reconstruct individual verses.

function parseESVText(text: string, canonicalRef: string): VerseData[] {
  // Extract book+chapter from canonical ref e.g. "John 3:1-21" → "John 3"
  const bookChapterMatch = canonicalRef.match(/^(.+?)\s+(\d+)(?::\d+)?/)
  const bookChapter = bookChapterMatch
    ? `${bookChapterMatch[1]} ${bookChapterMatch[2]}`
    : canonicalRef

  // Split on verse number markers [N]
  // Some passages span chapters so markers may be [chapter:verse] or just [verse]
  const versePattern = /\[(\d+(?::\d+)?)\]/g
  const parts: { marker: string; start: number }[] = []
  let match: RegExpExecArray | null

  while ((match = versePattern.exec(text)) !== null) {
    parts.push({ marker: match[1], start: match.index + match[0].length })
  }

  if (parts.length === 0) {
    // Fallback: return the whole passage as a single "verse"
    return [{
      verse_ref: canonicalRef,
      verse_num: 1,
      text: text.trim(),
    }]
  }

  const verses: VerseData[] = []
  for (let i = 0; i < parts.length; i++) {
    const start = parts[i].start
    const end = i + 1 < parts.length ? parts[i + 1].start - parts[i + 1].marker.length - 2 : text.length
    const verseText = text.slice(start, end).trim().replace(/\s+/g, ' ')

    if (!verseText) continue

    // marker is either "16" or "3:16"
    const marker = parts[i].marker
    const isChapterVerse = marker.includes(':')
    const verseNum = isChapterVerse
      ? parseInt(marker.split(':')[1], 10)
      : parseInt(marker, 10)

    const verseRef = isChapterVerse
      ? `${bookChapterMatch?.[1] ?? ''} ${marker}`
      : `${bookChapter}:${marker}`

    verses.push({
      verse_ref: verseRef.trim(),
      verse_num: verseNum,
      text: verseText,
>>>>>>> f06f0a0aaec959e258a7d2c1d063c274c314df2e
    })
  }

  return verses
}
<<<<<<< HEAD

// ── Heading parsing from HTML ─────────────────────────────────────────────────
// For headings like:
//   <h3 id="p01025018_30-1">The Birth of Esau and Jacob</h3>
// the boundary id points at the verse boundary just before the section start,
// except chapter-opening headings where the exact verse 1 is the section start.

type HeaderToken = {
  type: 'header'
  pos: number
  label: string
  boundaryCode?: string
}

type VerseToken = {
  type: 'verse'
  pos: number
  code: string
}

type Token = HeaderToken | VerseToken

function parseHeadersFromHTML(html: string, verses: VerseData[]): SectionHeader[] {
  const tokens = tokenizeHeadingHtml(html)

  const verseIndexByRef = new Map<string, number>()
  const verseCodes = verses.map((verse, idx) => {
    verseIndexByRef.set(verse.verse_ref, idx)
    return verseRefToOsisCode(verse.verse_ref)
  })

  const sections: SectionHeader[] = []
  let cursor = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'header') continue

    let matchedIdx = -1

    const nextVerse = findNextVerseToken(tokens, i + 1)

if (token.boundaryCode) {
  matchedIdx = matchHeaderBoundaryToIndex(
    token.boundaryCode,
    verseCodes,
    verses,
    cursor,
    nextVerse?.code
  )
}

if (matchedIdx === -1 && nextVerse) {
  const ref = osisToVerseRef(nextVerse.code)
  if (ref) {
    const idx = verseIndexByRef.get(ref)
    if (idx !== undefined && idx >= cursor) {
      matchedIdx = idx
    }
  }
}

    if (matchedIdx === -1) continue

    const startVerse = verses[matchedIdx]?.verse_ref
    if (!startVerse) continue

    const prev = sections[sections.length - 1]
    if (prev && prev.label === token.label && prev.startVerse === startVerse) {
      cursor = matchedIdx + 1
      continue
    }

    sections.push({
      label: token.label,
      startVerse,
    })

    cursor = matchedIdx + 1
  }

  const seen = new Set<string>()
  return sections
    .sort((a, b) => {
      const ai = verseIndexByRef.get(a.startVerse) ?? 999999
      const bi = verseIndexByRef.get(b.startVerse) ?? 999999
      return ai - bi
    })
    .filter(section => {
      const key = `${section.label}__${section.startVerse}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function tokenizeHeadingHtml(html: string): Token[] {
  const tokens: Token[] = []

  const headerPattern = /<h3\b([^>]*)>([\s\S]*?)<\/h3>/gi
  let match: RegExpExecArray | null

  while ((match = headerPattern.exec(html)) !== null) {
    const attrs = match[1] ?? ''
    const label = decodeHtml(stripTags(match[2])).trim()
    if (!label) continue

    const idMatch = attrs.match(/\bid="p(\d{8})[^"]*"/i)

    tokens.push({
      type: 'header',
      pos: match.index,
      label,
      boundaryCode: idMatch?.[1],
    })
  }

  for (const marker of extractVerseMarkers(html)) {
    tokens.push({
      type: 'verse',
      pos: marker.index,
      code: marker.code,
    })
  }

  return tokens.sort((a, b) => a.pos - b.pos)
}

function findNextVerseToken(tokens: Token[], startIdx: number): VerseToken | null {
  for (let i = startIdx; i < tokens.length; i++) {
    if (tokens[i].type === 'verse') {
      return tokens[i] as VerseToken
    }
  }
  return null
}

function matchHeaderBoundaryToIndex(
  boundaryCode: string,
  verseCodes: number[],
  verses: VerseData[],
  cursor: number,
  nextVerseCode?: string
): number {
  const boundaryNum = Number(boundaryCode)
  if (Number.isNaN(boundaryNum)) return -1

  const exactIdx = verseCodes.findIndex((code, idx) => idx >= cursor && code === boundaryNum)

  // If the heading boundary directly matches a verse in our list:
  if (exactIdx !== -1) {
    // Chapter-opening headings should start on verse 1 itself.
    if (verses[exactIdx].verse_num === 1) {
      return exactIdx
    }

    // Otherwise headings usually point to the verse just before the section start.
    return Math.min(exactIdx + 1, verses.length - 1)
  }

  // Otherwise, take the first verse after the boundary.
  const firstAfterIdx = verseCodes.findIndex((code, idx) => idx >= cursor && code > boundaryNum)
  if (firstAfterIdx === -1) return -1

  // Special case:
  // If the next visible verse token is verse 2 in the same chapter, the section
  // almost certainly starts at verse 1, which may not have shown up as the "next"
  // verse token after the heading.
  if (nextVerseCode && Number(nextVerseCode) === verseCodes[firstAfterIdx]) {
    const nextParsed = parseVerseRef(verses[firstAfterIdx].verse_ref)
    if (nextParsed && nextParsed.verse === 2) {
      const verse1Idx = verses.findIndex((v, idx) => {
        if (idx < cursor) return false
        const parsed = parseVerseRef(v.verse_ref)
        return !!parsed &&
          parsed.book === nextParsed.book &&
          parsed.chapter === nextParsed.chapter &&
          parsed.verse === 1
      })

      if (verse1Idx !== -1) {
        return verse1Idx
      }
    }
  }

  return firstAfterIdx
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function osisToVerseRef(code: string): string | null {
  if (!/^\d{8}$/.test(code)) return null

  const bookNum = Number(code.slice(0, 2))
  const chapter = Number(code.slice(2, 5))
  const verse = Number(code.slice(5, 8))
  const book = BOOKS_BY_NUMBER[bookNum]

  if (!book || !chapter || !verse) return null
  return `${book} ${chapter}:${verse}`
}

function verseRefToOsisCode(ref: string): number {
  const parsed = parseVerseRef(ref)
  if (!parsed) return 0

  const bookNum = BOOKS_BY_NUMBER.indexOf(parsed.book as typeof BOOKS_BY_NUMBER[number])
  if (bookNum <= 0) return 0

  return Number(
    `${String(bookNum).padStart(2, '0')}` +
    `${String(parsed.chapter).padStart(3, '0')}` +
    `${String(parsed.verse).padStart(3, '0')}`
  )
}

function parseVerseRef(ref: string): { book: string; chapter: number; verse: number } | null {
  const m = ref.match(/^(.+)\s(\d+):(\d+)$/)
  if (!m) return null

  return {
    book: m[1],
    chapter: Number(m[2]),
    verse: Number(m[3]),
  }
}

function normalizeVerseText(htmlSlice: string): string {
  return decodeHtml(stripTags(htmlSlice))
    .replace(/\s+/g, ' ')
    .replace(/^(\d+:\d+|\d+)\s+/, '')
    .replace(/\(ESV\)\s*$/i, '')
    .trim()
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, ' ')
}

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractVerseMarkers(html: string): Array<{ code: string; index: number; end: number }> {
  const markers: Array<{ code: string; index: number; end: number }> = []

  const markerPattern =
    /<([a-z0-9]+)\b[^>]*id="v(\d{8})[^"]*"[^>]*>(?:[\s\S]*?<\/\1>)?/gi

  let match: RegExpExecArray | null

  while ((match = markerPattern.exec(html)) !== null) {
    const marker = {
      code: match[2],
      index: match.index,
      end: match.index + match[0].length,
    }

    // If the same verse appears twice in a row, keep the later one.
    // This helps when ESV emits an anchor and then a visible verse-num wrapper.
    if (markers.length && markers[markers.length - 1].code === marker.code) {
      markers[markers.length - 1] = marker
    } else {
      markers.push(marker)
    }
  }

  return markers
}
=======
>>>>>>> f06f0a0aaec959e258a7d2c1d063c274c314df2e
