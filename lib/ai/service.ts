// ── lib/ai/service.ts ─────────────────────────────────────────────────────────
// The ONLY import target for AI features in the rest of the app.
// App code imports from here — never from providers/, prompts/, or generate.ts.
//
// Responsibilities:
// 1. Resolve user credentials (key decryption, validation check)
// 2. Build prompt via appropriate prompt module
// 3. Call provider.complete()
// 4. Map raw parsed response to typed app-level result
// 5. Normalize all errors to AIError
//
// Logging hooks are in place (console.info) for easy upgrade to a real
// observability system later without changing callers.

import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { decryptKey } from '@/lib/ai/key'
import { getProvider } from '@/lib/ai/providers/resolver'
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

// ── Re-export types so callers only need one import ──────────────────────────
export type {
  OutlineInput, OutlineResult,
  ResearchInput, ResearchResult, ResearchItemPayload,
  SeriesInput, SeriesResult,
  TagInput, TagResult,
} from '@/lib/ai/types'
export { AIError } from '@/lib/ai/types'
export type { AIErrorCode } from '@/lib/ai/types'

// ── Credential resolution ─────────────────────────────────────────────────────
// Shared by all service functions. Throws AIError, never returns null.

async function resolveCredentials(userId: string): Promise<ProviderCredentials> {
  const { data } = await supabaseAdmin
    .from('user_ai_keys')
    .select('openai_key_enc, model_preference, validation_status')
    .eq('user_id', userId)
    .single()

  if (!data || !data.openai_key_enc) {
    throw new AIError('key_missing', 'No AI key found. Add one in Settings → AI.')
  }
  if (data.validation_status !== 'valid') {
    throw new AIError('key_invalid', 'AI key is not validated. Check Settings → AI.')
  }

  let apiKey: string
  try {
    apiKey = await decryptKey(data.openai_key_enc)
  } catch {
    throw new AIError('key_invalid', 'Failed to decrypt AI key. Re-save your key in Settings → AI.')
  }

  return { apiKey, model: data.model_preference ?? 'gpt-4o' }
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

  // Map raw parsed JSON to OutlineBlock[]
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
  // Guard stubbed categories before making any API call
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
    subcategory?: string
    confidence?: 'high' | 'medium' | 'low'
    metadata?: Record<string, unknown>
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

// Theological items get a tradition-specific source label.
// Uses the same RawItem shape as generateResearch.
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

  // Build liturgical context if not pre-computed by caller
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

  // Accept either string[] or array of { label } objects
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
