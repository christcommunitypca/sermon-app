// ── lib/ai/prompts/outline.ts ─────────────────────────────────────────────────
// Builds the prompt payload for outline generation.
// No imports from providers or service — pure prompt construction.

import type { PromptPayload, OutlineInput } from '@/lib/ai/types'
import {
  buildOutlinePromptParts,
  renderOutlinePromptForLLM,
} from '@/lib/outlinePrompt'

export const VERSION = 'v1.1'

export function buildPrompt(input: OutlineInput): PromptPayload {
  const { session, thoughts, selectedFlow } = input

  const parts = buildOutlinePromptParts({
    selectedFlow,
    selectedInsights: input.selectedInsights,
    verseNotesForAI: input.verseNotes,
    thoughts,
    sessionEstimatedDuration: session.estimatedDuration,
  })

  return renderOutlinePromptForLLM({
    session: {
      title: session.title,
      type: session.type,
      scriptureRef: session.scriptureRef,
      notes: session.notes,
      estimatedDuration: session.estimatedDuration,
    },
    parts,
    version: VERSION,
  })
}