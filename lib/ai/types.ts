// ── lib/ai/types.ts ────────────────────────────────────────────────────────────
// All types for the AI layer. Nothing here imports from providers or service.
// App code should import result/input types from here (via service.ts re-exports).

import type { OutlineBlock, ResearchCategory, ProposedWeek, Json } from '@/types/database'

// ── Provider identity ──────────────────────────────────────────────────────────

export type ProviderName = 'openai' | 'anthropic' | 'google'

// ── Errors ────────────────────────────────────────────────────────────────────

export type AIErrorCode =
  | 'key_missing'
  | 'key_invalid'
  | 'provider_unavailable'
  | 'generation_failed'
  | 'malformed_response'

export class AIError extends Error {
  readonly code: AIErrorCode
  constructor(code: AIErrorCode, message: string) {
    super(message)
    this.name = 'AIError'
    this.code = code
  }
}

// ── Internal: prompt payload sent to provider ─────────────────────────────────
// System + user messages. Provider maps these to its own API format.

export interface PromptPayload {
  system: string
  user: string
  version: string       // prompt version tag, carried through to results
  temperature?: number  // optional override; providers use sensible defaults
  maxTokens?: number    // optional override
}

// ── Internal: provider credentials ───────────────────────────────────────────

export interface ProviderCredentials {
  apiKey: string
  model: string
}

// ── Internal: raw provider completion ────────────────────────────────────────
// What a provider returns after making the API call and parsing JSON.
// `parsed` is the decoded JSON value — service functions cast/validate it.

export interface ProviderCompletion {
  parsed: unknown
  model: string
  provider: ProviderName
  duration_ms: number
}

// ── Provider interface ────────────────────────────────────────────────────────
// Only one method: complete(). All task logic lives in the service + prompts.
// Providers do: HTTP call, JSON extraction, error normalization.

export interface AIProvider {
  readonly name: ProviderName
  complete(prompt: PromptPayload, creds: ProviderCredentials): Promise<ProviderCompletion>
}

// ── Base result (carried on every service result) ─────────────────────────────

export interface AIResultMeta {
  provider: ProviderName
  model: string
  prompt_version: string
  duration_ms: number
}

// ── Outline ───────────────────────────────────────────────────────────────────

export interface OutlineInput {
  session: {
    title: string
    type: string
    scriptureRef: string | null
    notes: string | null
    estimatedDuration?: number | null
  }
  thoughts: { content: string }[]
  flowStructure?: { type: string; label: string }[]
  outlineId: string
  // Optional verse-study context (from Verse by Verse mode)
  verseNotes?: Record<string, string>
  selectedInsights?: { verseRef: string; category: string; title: string; content: string }[]
}

export interface OutlineResult extends AIResultMeta {
  blocks: OutlineBlock[]
}

// ── Research ──────────────────────────────────────────────────────────────────

export interface ResearchInput {
  scriptureRef: string
  sessionTitle: string
  sessionType: string
  sessionNotes?: string | null
  tradition: string
  category: ResearchCategory
}

// Items shaped for direct insertion into research_items via saveResearchItems()
export interface ResearchItemPayload {
  category: ResearchCategory
  subcategory: string | null
  title: string
  content: string
  source_label: string
  source_type: 'ai_synthesis' | 'sourced' | 'user'
  confidence: 'high' | 'medium' | 'low' | null
  is_pinned: boolean
  is_dismissed: boolean
  metadata: Json
  position: number
}

export interface ResearchResult extends AIResultMeta {
  items: ResearchItemPayload[]
  category: ResearchCategory
}

// ── Series ────────────────────────────────────────────────────────────────────

export interface SeriesInput {
  title: string
  scriptureSection: string
  totalWeeks: number
  startDate: string | null
  tradition: string
  description?: string | null
  liturgicalContext: string   // pre-built by service via lib/liturgical
}

export interface SeriesResult extends AIResultMeta {
  weeks: ProposedWeek[]
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface TagInput {
  sessionTitle: string
  scriptureRef: string | null
  sessionType: string
  outlineContent: string      // flattened outline text for context
  existingTags: string[]
}

export interface TagResult extends AIResultMeta {
  suggestions: string[]
}

// ── Verse Insights ────────────────────────────────────────────────────────────

export interface VerseInsightInput {
  verses: import('@/lib/esv').VerseData[]
  sessionTitle: string
  sessionType: string
  tradition: string
  pastorNotes?: Record<string, string[]>  // verse_ref → notes[], sent as context to AI
}

export interface InsightItem {
  title: string
  content: string
}

export interface RawVerseInsight {
  verse_ref: string
  category: string
  items: InsightItem[]
}

export interface VerseInsightResult extends AIResultMeta {
  insights: RawVerseInsight[]
}

// ── Lesson Summary ────────────────────────────────────────────────────────────

export interface LessonSummaryInput {
  outlineText: string
  scriptureRef: string | null
  tradition: string
  targetMinutes: number | null
}

export interface LessonSummaryResult extends AIResultMeta {
  estimated_minutes: number
  key_theme: string
  titles: string[]
}