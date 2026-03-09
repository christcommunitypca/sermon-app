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
} from '@/lib/ai/types'

import * as OutlinePrompt  from '@/lib/ai/prompts/outline'
import * as ResearchPrompt from '@/lib/ai/prompts/research'
import * as SeriesPrompt   from '@/lib/ai/prompts/series'
import * as TagsPrompt     from '@/lib/ai/prompts/tags'

import type { OutlineBlock, ResearchCategory, ProposedWeek } from '@/types/database'

// ── Re-export types so callers only need one import ───────────────────────────
export type {
  OutlineInput, OutlineResult,
  ResearchInput, ResearchResult, ResearchItemPayload,
  SeriesInput, SeriesResult,
  TagInput, TagResult,
} from '@/lib/ai/types'
export { AIError } from '@/lib/ai/types'
export type { AIErrorCode } from '@/lib/ai/types'

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
