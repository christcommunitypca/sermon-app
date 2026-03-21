// ── lib/ai/service.ts ─────────────────────────────────────────────────────────
// The ONLY import target for AI features in the rest of the app.
// App code imports from here — never from providers/, prompts/, or key.ts.
//
// Responsibilities:
// 1. Resolve user credentials via key.ts (decryption, validation check)
// 2. Build prompt via appropriate prompt module
// 3. Call provider.complete()
// 4. Map raw parsed response to typed app-level result
// 5. Normalize all errors to AIError
//
// CREDENTIAL RESOLUTION ORDER:
//   1. AI_PROVIDER env var → selects active provider (default: 'openai')
//   2. user_ai_credentials WHERE (user_id, provider) = (userId, activeProvider)
//   3. Require validation_status = 'valid'
//   4. Decrypt api_key_enc
//   5. Pass { apiKey, model } to provider.complete()

import 'server-only'

import { getDecryptedKey } from '@/lib/ai/key'
import { getProvider, getActiveProviderName } from '@/lib/ai/providers/resolver'
import { createLocalBlock } from '@/lib/outline'
import { matchObservancesToWeeks, formatObservancesForPrompt } from '@/lib/liturgical'
import { buildOutlinePromptParts, renderOutlinePromptForLLM } from '@/lib/outlinePrompt'
import {
  AIError,
  type ProviderCredentials,
  type OutlineInput,
  type OutlineResult,
  type ResearchInput,
  type ResearchResult,
  type ResearchItemPayload,
  type SeriesInput,
  type SeriesResult,
  type TagInput,
  type TagResult,
  type SplitNotesInput,
  type SplitNotesResult,
} from '@/lib/ai/types'

import * as OutlinePrompt from '@/lib/ai/prompts/outline'
import * as ResearchPrompt from '@/lib/ai/prompts/research'
import * as SeriesPrompt from '@/lib/ai/prompts/series'
import * as TagsPrompt from '@/lib/ai/prompts/tags'
import * as VerseInsightsPrompt from '@/lib/ai/prompts/verse-insights'
import type { InsightCategory } from '@/lib/ai/prompts/verse-insights'
import * as LessonSummaryPrompt from '@/lib/ai/prompts/lesson-summary'
import * as SplitNotesPrompt from '@/lib/ai/prompts/split-notes'

import type { OutlineBlock, ResearchCategory, ProposedWeek } from '@/types/database'
import type { VerseData } from '@/lib/esv'
import type {
  VerseInsightInput,
  VerseInsightResult,
  RawVerseInsight,
  LessonSummaryInput,
  LessonSummaryResult,
  ProviderName,
} from '@/lib/ai/types'

// ── Re-export types so callers only need one import ───────────────────────────
export type {
  OutlineInput,
  OutlineResult,
  ResearchInput,
  ResearchResult,
  ResearchItemPayload,
  SeriesInput,
  SeriesResult,
  TagInput,
  TagResult,
  SplitNotesInput,
  SplitNotesResult,
} from '@/lib/ai/types'
export { AIError } from '@/lib/ai/types'
export type { AIErrorCode } from '@/lib/ai/types'

type AIInsightItem = {
  title?: string
  content?: string
  source_label?: string
  source_url?: string
}
// ── Credential resolution ─────────────────────────────────────────────────────
// Single function. Reads from user_ai_credentials via key.ts.
// Throws AIError on any failure — callers do not need to handle nulls.

async function resolveCredentials(userId: string): Promise<ProviderCredentials> {
  const provider = getActiveProviderName()
  const creds = await getDecryptedKey(userId, provider)

  if (!creds) {
    // Distinguish missing key vs invalid key for better error messages
    const { data } = await import('@/lib/supabase/admin').then(m =>
      m.supabaseAdmin
        .from('user_ai_credentials')
        .select('validation_status')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single()
    )
    if (!data) {
      throw new AIError('key_missing', 'No AI key found. Add one in Settings → AI.')
    }
    throw new AIError('key_invalid', 'AI key is not validated. Check Settings → AI.')
  }

  return creds
}

// ── Logging helper ────────────────────────────────────────────────────────────

function logTask(task: string, meta: { provider: string; model: string; prompt_version: string; duration_ms: number }) {
  console.info(`[ai] task=${task} provider=${meta.provider} model=${meta.model} version=${meta.prompt_version} duration=${meta.duration_ms}ms`)
}

// ── generateOutline ───────────────────────────────────────────────────────────

export async function generateOutline(
  userId: string,
  input: OutlineInput
): Promise<OutlineResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()
  const prompt = OutlinePrompt.buildPrompt(input)

  const completion = await provider.complete(prompt, creds)

  type RawBlock = { type?: string; content?: string; parent_index?: number | null; estimated_minutes?: number | null; confidence?: 'high' | 'medium' | 'low' }
  const raw = completion.parsed as RawBlock[]

  if (!Array.isArray(raw)) {
    throw new AIError('malformed_response', 'Expected JSON array of outline blocks.')
  }

  const tempIds = raw.map((_, i) => `ai-${i}-${Date.now()}`)

  const blocks: OutlineBlock[] = raw.map((item, i) => ({
    ...createLocalBlock(
      input.outlineId,
      item.parent_index != null ? tempIds[item.parent_index] : null,
      (item.type as OutlineBlock['type']) ?? 'point',
      i
    ),
    id: tempIds[i],
    content: item.content ?? '',
    estimated_minutes: item.estimated_minutes ?? null,
    ai_source: {
      model: completion.model,
      prompt_version: prompt.version,
      confidence: item.confidence ?? 'medium',
    },
    ai_edited: false,
  }))

  // Scale estimated_minutes to match target duration if AI ignored the constraint.
  // Only scales if a target was given and the total is off by more than 15%.
  if (input.session.estimatedDuration && blocks.length > 0) {
    const target = input.session.estimatedDuration
    const total = blocks.reduce((sum, b) => sum + (b.estimated_minutes ?? 0), 0)
    if (total > 0 && Math.abs(total - target) / target > 0.15) {
      const scale = target / total
      blocks.forEach(b => {
        if (b.estimated_minutes) {
          b.estimated_minutes = Math.round(b.estimated_minutes * scale * 2) / 2 // round to 0.5
        }
      })
    }
  }

  const result: OutlineResult = {
    blocks,
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('generateOutline', result)
  return result
}

// ── splitStudyNotes ───────────────────────────────────────────────────────────

export async function splitStudyNotes(
  userId: string,
  input: SplitNotesInput
): Promise<SplitNotesResult> {
  const trimmed = input.notes
    .map(note => ({ ...note, content: note.content.trim() }))
    .filter(note => note.content)

  if (!trimmed.length) {
    throw new AIError('generation_failed', 'Select at least one note with text to split.')
  }

  const creds = await resolveCredentials(userId)
  const provider = getProvider()
  const prompt = SplitNotesPrompt.buildPrompt({ notes: trimmed })
  const completion = await provider.complete(prompt, creds)

  type RawCard = { sourceId?: string; content?: string; category?: string }
  const raw = completion.parsed as RawCard[]

  if (!Array.isArray(raw)) {
    throw new AIError('malformed_response', 'Expected JSON array of split notes.')
  }

  const validIds = new Set(trimmed.map(note => note.id))
  const seen = new Set<string>()
  const cards = raw
    .map(card => ({
      sourceId: card.sourceId ?? '',
      content: (card.content ?? '').trim(),
      category: (card.category ?? 'observation').trim() || 'observation',
    }))
    .filter(card => validIds.has(card.sourceId) && card.content)
    .filter(card => {
      const key = `${card.sourceId}__${card.content.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const result: SplitNotesResult = {
    cards,
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('splitStudyNotes', result)
  return result
}

// ── generateResearch ──────────────────────────────────────────────────────────

export async function generateResearch(
  userId: string,
  input: ResearchInput
): Promise<ResearchResult> {
  if (input.category === 'denominational' || input.category === 'current_topic') {
    throw new AIError('generation_failed', `Research category "${input.category}" is not yet available.`)
  }

  const creds = await resolveCredentials(userId)
  const provider = getProvider()
  const prompt = ResearchPrompt.buildPrompt(input)

  const completion = await provider.complete(prompt, creds)

  type RawItem = {
    title?: string
    content?: string
    subcategory?: string | null
    confidence?: 'high' | 'medium' | 'low'
    metadata?: Record<string, unknown> | null
  }
  const raw = completion.parsed as RawItem[]

  if (!Array.isArray(raw)) {
    throw new AIError('malformed_response', 'Expected JSON array of research items.')
  }

  const sourceLabel = ResearchPrompt.CATEGORY_SOURCE_LABEL[input.category]

  const items: ResearchItemPayload[] = raw.map((item, i) => ({
    category: input.category,
    subcategory: item.subcategory ?? null,
    title: item.title ?? '',
    content: item.content ?? '',
    source_label: buildSourceLabel(input, item, sourceLabel),
    source_type: 'ai_synthesis',
    confidence: item.confidence ?? 'medium',
    is_pinned: false,
    is_dismissed: false,
    metadata: (item.metadata ?? {}) as import('@/types/database').Json,
    position: i,
  }))

  const result: ResearchResult = {
    items,
    category: input.category,
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('generateResearch', result)
  return result
}

function buildSourceLabel(
  input: ResearchInput,
  item: { subcategory?: string | null; metadata?: Record<string, unknown> | null },
  defaultLabel: string
): string {
  if (input.category === 'theological') {
    const isCross = item.metadata?.is_cross_tradition
    const tradition = item.metadata?.tradition as string | undefined
    if (isCross && tradition) return `AI synthesis · ${tradition} perspective`
    return `AI synthesis · ${input.tradition} interpretation`
  }
  return defaultLabel
}

// ── generateSeries ────────────────────────────────────────────────────────────

export async function generateSeries(
  userId: string,
  input: Omit<SeriesInput, 'liturgicalContext'> & { liturgicalContext?: string }
): Promise<SeriesResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()

  const liturgicalContext = input.liturgicalContext ?? buildLiturgicalContext(
    input.startDate,
    input.totalWeeks,
    input.tradition
  )

  const fullInput: SeriesInput = { ...input, liturgicalContext }
  const prompt = SeriesPrompt.buildPrompt(fullInput)

  const completion = await provider.complete(prompt, creds)

  const raw = completion.parsed as ProposedWeek[]

  if (!Array.isArray(raw)) {
    throw new AIError('malformed_response', 'Expected JSON array of series weeks.')
  }

  const result: SeriesResult = {
    weeks: raw,
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('generateSeries', result)
  return result
}

function buildLiturgicalContext(
  startDate: string | null,
  totalWeeks: number,
  tradition: string
): string {
  if (!startDate) return 'No start date provided — omit liturgical notes.'
  const observances = matchObservancesToWeeks(new Date(startDate), totalWeeks, tradition)
  return formatObservancesForPrompt(observances)
}

// ── suggestTags ───────────────────────────────────────────────────────────────

export async function suggestTags(
  userId: string,
  input: TagInput
): Promise<TagResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()
  const prompt = TagsPrompt.buildPrompt(input)

  const completion = await provider.complete(prompt, creds)

  const raw = completion.parsed

  let suggestions: string[]
  if (Array.isArray(raw)) {
    suggestions = raw
      .map((item: unknown) =>
        typeof item === 'string' ? item : (item as { label?: string })?.label ?? ''
      )
      .filter(Boolean)
  } else {
    throw new AIError('malformed_response', 'Expected JSON array of tag suggestions.')
  }

  const result: TagResult = {
    suggestions,
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('suggestTags', result)
  return result
}

// ── generateVerseInsights ──────────────────────────────────────────────────────
// For short passages (≤4 verses): 2 parallel calls, 3 categories each.
// For long passages (>4 verses): split into per-verse calls to avoid token truncation.
// Each per-verse call covers 3 categories and needs ~1500 tokens max.

const VERSE_SPLIT_THRESHOLD = 4

export async function generateVerseInsights(
  userId: string,
  input: VerseInsightInput
): Promise<VerseInsightResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()

  type RawBatchItem = {
    verse_ref?: string
    category?: string
    items?: {
      title?: string
      content?: string
      source_label?: string
      source_url?: string
    }[]
  }

  // Long passage: split into per-verse × per-batch calls (avoids JSON truncation)
  if (input.verses.length > VERSE_SPLIT_THRESHOLD) {
    return generateVerseInsightsSplit(userId, input, creds, provider)
  }

  const batchResults = await Promise.allSettled(
    VerseInsightsPrompt.CATEGORY_BATCHES.map(async (categories, batchIndex) => {
      const prompt = VerseInsightsPrompt.buildBatchPrompt(input, categories)
      const completion = await provider.complete(prompt, creds)

      if (!Array.isArray(completion.parsed)) {
        throw new AIError('malformed_response',
          `Batch ${batchIndex + 1} (${categories.join(',')}) — expected JSON array`)
      }

      const rows: RawVerseInsight[] = (completion.parsed as RawBatchItem[])
        .filter(item =>
          item &&
          typeof item.verse_ref === 'string' &&
          typeof item.category === 'string' &&
          Array.isArray(item.items)
        )
        .map(item => ({
          verse_ref: item.verse_ref as string,
          category: item.category as string,
            items: (item.items ?? []).slice(0, 2).map(i => ({
            title: i.title ?? '',
            content: i.content ?? '',
          })),
        }))

      return { rows, model: completion.model, provider: completion.provider, duration_ms: completion.duration_ms }
    })
  )

  const allInsights: RawVerseInsight[] = []
  let model = ''
  let providerName: ProviderName = 'anthropic'
  let totalDuration = 0

  for (let i = 0; i < batchResults.length; i++) {
    const r = batchResults[i]
    if (r.status === 'fulfilled') {
      allInsights.push(...r.value.rows)
      model = r.value.model
      providerName = r.value.provider
      totalDuration = Math.max(totalDuration, r.value.duration_ms)
    } else {
      console.warn(
        `[generateVerseInsights] batch ${i + 1} (${VerseInsightsPrompt.CATEGORY_BATCHES[i].join(',')}) failed:`,
        r.reason
      )
    }
  }

  if (allInsights.length === 0) {
    throw new AIError('generation_failed', 'All batches failed. Check your API key and try again.')
  }

  const result: VerseInsightResult = {
    insights: allInsights,
    model,
    provider: providerName,
    prompt_version: VerseInsightsPrompt.VERSION,
    duration_ms: totalDuration,
  }

  logTask('generateVerseInsights', result)
  return result
}

// ── Split path: one call per verse × batch (for long passages) ────────────────
async function generateVerseInsightsSplit(
  _userId: string,
  input: VerseInsightInput,
  creds: Awaited<ReturnType<typeof resolveCredentials>>,
  provider: ReturnType<typeof getProvider>
): Promise<VerseInsightResult> {
  type RawBatchItem = {
    verse_ref?: string
    category?: string
    items?: { title?: string; content?: string; source_label?: string; source_url?: string }[]
  }

  // Build all tasks: each verse × each batch = verses.length × 2 calls
  // Run with concurrency limit of 4 to avoid rate limits
  const tasks: { verse: typeof input.verses[0]; categories: InsightCategory[]; batchIdx: number }[] = []
  for (const verse of input.verses) {
    for (let b = 0; b < VerseInsightsPrompt.CATEGORY_BATCHES.length; b++) {
      tasks.push({ verse, categories: VerseInsightsPrompt.CATEGORY_BATCHES[b], batchIdx: b })
    }
  }

  const CONCURRENCY = 4
  const results: RawVerseInsight[] = []
  let model = ''
  let providerName: ProviderName = 'anthropic'
  let failCount = 0

  // Process in chunks
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = tasks.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(chunk.map(async task => {
      const singleVerseInput: VerseInsightInput = {
        ...input,
        verses: [task.verse],
        pastorNotes: input.pastorNotes
          ? { [task.verse.verse_ref]: input.pastorNotes[task.verse.verse_ref] ?? [] }
          : undefined,
        selectedWords: input.selectedWords
          ? { [task.verse.verse_ref]: input.selectedWords[task.verse.verse_ref] ?? [] }
          : undefined,
      }
      const prompt = VerseInsightsPrompt.buildBatchPrompt(singleVerseInput, task.categories)
      // Single verse needs far fewer tokens
      const cappedPrompt = { ...prompt, maxTokens: 1200 }
      const completion = await provider.complete(cappedPrompt, creds)

      if (!Array.isArray(completion.parsed)) {
        throw new AIError('malformed_response',
          `${task.verse.verse_ref} batch ${task.batchIdx + 1} — expected JSON array`)
      }

      model = completion.model
      providerName = completion.provider

      return (completion.parsed as RawBatchItem[])
        .filter(item =>
          item &&
          typeof item.verse_ref === 'string' &&
          typeof item.category === 'string' &&
          Array.isArray(item.items)
        )
.map(item => ({
  verse_ref: item.verse_ref as string,
  category: item.category as string,
  items: (item.items ?? []).slice(0, 2).map(i => ({
    title: i.title ?? '',
    content: i.content ?? '',
    source_label: i.source_label ?? undefined,
    source_url: i.source_url ?? undefined,
  })),
}))
    }))

    for (const r of settled) {
      if (r.status === 'fulfilled') {
        results.push(...r.value)
      } else {
        failCount++
        console.warn('[generateVerseInsightsSplit] task failed:', r.reason)
      }
    }
  }

  if (results.length === 0) {
    throw new AIError('generation_failed', 'All per-verse calls failed. Check your API key and try again.')
  }

  if (failCount > 0) {
    console.warn(`[generateVerseInsightsSplit] ${failCount}/${tasks.length} tasks failed — partial results returned`)
  }

  return {
    insights: results,
    model,
    provider: providerName,
    prompt_version: VerseInsightsPrompt.VERSION,
    duration_ms: 0,
  }
}

// ── generateLessonSummary ──────────────────────────────────────────────────────

export async function generateLessonSummary(
  userId: string,
  input: LessonSummaryInput
): Promise<LessonSummaryResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()
  const prompt = LessonSummaryPrompt.buildPrompt(input)

  const completion = await provider.complete(prompt, creds)

  const raw = completion.parsed as {
    estimated_minutes?: number
    key_theme?: string
    titles?: string[]
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AIError('malformed_response', 'Expected JSON object for lesson summary.')
  }

  const result: LessonSummaryResult = {
    estimated_minutes: typeof raw.estimated_minutes === 'number' ? raw.estimated_minutes : 0,
    key_theme: raw.key_theme ?? '',
    titles: Array.isArray(raw.titles) ? raw.titles.slice(0, 10) : [],
    model: completion.model,
    provider: completion.provider,
    prompt_version: prompt.version,
    duration_ms: completion.duration_ms,
  }

  logTask('generateLessonSummary', result)
  return result
}

// Re-export copyable prompt builder for use in server actions
export { buildCopyablePrompt } from '@/lib/ai/prompts/lesson-summary'

// ── generatePericopeInsights ────────────────────────────────────────────────
// Uses the same VerseInsights prompt as VBV, but treats the section as a single
// unit keyed by a stable pericope reference.

export interface PericopeSection {
  label: string
  startVerse: string
  verses: import('@/lib/esv').VerseData[]
  selectedWords?: string[]
}

export async function generatePericopeInsights(
  userId: string,
  input: {
    section: PericopeSection
    sessionTitle: string
    sessionType: string
    tradition: string
    pastorNotes?: string[]
    selectedWords?: string[]
  }
): Promise<VerseInsightResult> {
  const creds = await resolveCredentials(userId)
  const provider = getProvider()

  const pericopeKey = `pericope:${input.section.startVerse}`
  const chosenWords = input.selectedWords?.length
    ? input.selectedWords
    : (input.section.selectedWords ?? [])

  const combinedVerseData: VerseData = {
    verse_ref: pericopeKey,
    verse_num: 1,
    text: input.section.verses.map(v => `[${v.verse_ref}] ${v.text}`).join(' '),
  }

  const sectionInput: VerseInsightInput = {
    verses: [combinedVerseData],
    sessionTitle: input.sessionTitle,
    sessionType: input.sessionType,
    tradition: input.tradition,
    pastorNotes: input.pastorNotes?.length
      ? { [pericopeKey]: input.pastorNotes }
      : {},
      selectedWords: input.selectedWords?.length
  ? { [pericopeKey]: input.selectedWords }
  : {},
  }

  const batchResults = await Promise.allSettled(
    VerseInsightsPrompt.CATEGORY_BATCHES.map(async categories => {
      const prompt = VerseInsightsPrompt.buildBatchPrompt(sectionInput, categories)
      const completion = await provider.complete(prompt, creds)

      type RawBatchItem = {
        verse_ref?: string
        category?: string
        items?: { title?: string; content?: string; source_label?: string; source_url?: string }[]
      }

      if (!Array.isArray(completion.parsed)) {
        throw new AIError('malformed_response', 'Expected JSON array')
      }

      const rows: RawVerseInsight[] = (completion.parsed as RawBatchItem[])
        .filter(item =>
          item &&
          typeof item.verse_ref === 'string' &&
          typeof item.category === 'string' &&
          Array.isArray(item.items)
        )
        .map(item => ({
          verse_ref: item.verse_ref as string,
          category: item.category as string,
          items: (item.items ?? []).slice(0, 2).map(i => ({
            title: i.title ?? '',
            content: i.content ?? '',
            source_label: i.source_label ?? undefined,
            source_url: i.source_url ?? undefined,
          })),
        }))

      return {
        rows,
        model: completion.model,
        provider: completion.provider,
        duration_ms: completion.duration_ms,
      }
    })
  )

  const allInsights: RawVerseInsight[] = []
  let model = ''
  let totalDuration = 0
  let providerName: ProviderName = 'anthropic'

  for (const r of batchResults) {
    if (r.status === 'fulfilled') {
      allInsights.push(...r.value.rows)
      model = r.value.model
      providerName = r.value.provider
      totalDuration = Math.max(totalDuration, r.value.duration_ms)
    }
  }

  if (allInsights.length === 0) {
    throw new AIError('generation_failed', 'All batches failed. Check your API key and try again.')
  }

  const result: VerseInsightResult = {
    insights: allInsights,
    model,
    provider: providerName,
    prompt_version: VerseInsightsPrompt.VERSION,
    duration_ms: totalDuration,
  }

  logTask('generatePericopeInsights', result)
  return result
}
