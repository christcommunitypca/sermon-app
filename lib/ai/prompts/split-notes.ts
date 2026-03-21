import type { PromptPayload, SplitNotesInput } from '@/lib/ai/types'

export const VERSION = 'v1.0'

export function buildPrompt(input: SplitNotesInput): PromptPayload {
  const noteText = input.notes
    .map(note => `NOTE ${note.id}:\n${note.content.trim()}`)
    .join('\n\n---\n\n')

  return {
    system: `You are an assistant that restructures sermon study notes into atomic note cards.

Rules:
- Return ONLY valid JSON, no markdown.
- Return a JSON array.
- Each item must be { sourceId, content, category }.
- sourceId must match one of the note ids provided.
- Split overloaded notes into short standalone cards.
- Preserve the pastor's wording as much as possible while making each card usable on its own.
- Do not invent content.
- Prefer categories from this set: observation, interpretation, theology, application, illustration, question, cross_reference.
- Omit empty or duplicate cards.
- Keep each card to one idea.`,
    user: `Split these study notes into atomic note cards:\n\n${noteText}`,
    version: VERSION,
    temperature: 0.2,
  }
}
