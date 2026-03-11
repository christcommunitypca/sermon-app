// ── lib/esv.ts ─────────────────────────────────────────────────────────────────
// Fetches ESV passage text from api.esv.org.
// Caches results in scripture_cache table — never re-fetches the same ref.
// Returns a flat array of VerseData objects, one per verse.

import { supabaseAdmin } from '@/lib/supabase/admin'

export interface VerseData {
  verse_ref: string   // "John 3:16"
  verse_num: number   // 16
  text: string        // "For God so loved the world..."
}

const ESV_API_BASE = 'https://api.esv.org/v3/passage/text'

// Cache TTL — re-fetch after 90 days (scripture text doesn't change, but belt+suspenders)
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export async function fetchPassage(ref: string): Promise<VerseData[]> {
  const normalizedRef = ref.trim()

  // ── Check cache first ───────────────────────────────────────────────────────
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
    })
  }

  return verses
}
