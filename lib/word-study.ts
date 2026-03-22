export type ParsedWordStudyTitle = {
  english: string | null
  original: string | null
  transliteration: string | null
  fallbackTitle: string
}

function stripLanguagePrefix(value: string) {
  return value.replace(/^(greek|hebrew|aramaic)\s+/i, '').trim()
}

export function parseWordStudyTitle(title: string, metadataWord?: string | null): ParsedWordStudyTitle {
  const fallbackTitle = title.trim()
  const hasPipe = fallbackTitle.includes('|')
  const [left, ...rest] = hasPipe ? fallbackTitle.split('|') : [fallbackTitle]
  const english = hasPipe ? left.trim() || null : null
  const right = hasPipe ? rest.join('|').trim() : fallbackTitle

  let original: string | null = null
  let transliteration: string | null = null

  const parenMatch = right.match(/^(.+?)\s+\((.+)\)$/)
  if (parenMatch) {
    original = parenMatch[1].trim() || null
    transliteration = parenMatch[2].trim() || null
  } else if (metadataWord?.trim()) {
    original = metadataWord.trim()
    const stripped = stripLanguagePrefix(right)
    if (stripped && stripped != original) transliteration = stripped
  } else {
    const stripped = stripLanguagePrefix(right)
    if (stripped != right) transliteration = stripped || null
  }

  return { english, original, transliteration, fallbackTitle }
}

export function getPreferredWordStudyPushLabel(title: string, metadataWord?: string | null) {
  const parsed = parseWordStudyTitle(title, metadataWord)
  return parsed.english || parsed.fallbackTitle
}
