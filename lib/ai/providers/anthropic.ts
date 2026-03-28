// ── lib/ai/providers/anthropic.ts ─────────────────────────────────────────────
// Anthropic (Claude) implementation of AIProvider.
// Responsibility: HTTP call to Anthropic messages API, JSON extraction,
// and error normalization into AIError.
// No business logic. No prompt construction. No result mapping.
//
// API notes:
// - Base: https://api.anthropic.com/v1/messages
// - Auth: x-api-key header (not Authorization: Bearer)
// - Version header: anthropic-version: 2023-06-01
// - System prompt: top-level `system` field, not inside messages array
// - Response: content[0].type === 'text', content[0].text
// - Key prefix: sk-ant-

import type { AIProvider, PromptPayload, ProviderCredentials, ProviderCompletion } from '@/lib/ai/types'
import { AIError } from '@/lib/ai/types'
import { getModelMaxOutputTokens } from '@/lib/ai/key'

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const

  async complete(
    prompt: PromptPayload,
    creds: ProviderCredentials
  ): Promise<ProviderCompletion> {
    const start = Date.now()

    let res: Response
    try {
      res = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'x-api-key': creds.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: creds.model,
          // Use the lesser of: what this prompt needs vs what this model supports.
          // prompt.maxTokens is a task ceiling (e.g. tags need 300, outlines need more).
          // getModelMaxOutputTokens caps it at the model's actual limit.
          // Neither value is hard-coded in prompt files — add new models to key.ts only.
          max_tokens: Math.min(
            prompt.maxTokens ?? getModelMaxOutputTokens(creds.model),
            getModelMaxOutputTokens(creds.model)
          ),
          temperature: prompt.temperature ?? 0.4,
          system: prompt.system,
          messages: [
            { role: 'user', content: prompt.user },
          ],
        }),
      })
    } catch (err) {
      throw new AIError(
        'provider_unavailable',
        `Anthropic request failed: ${err instanceof Error ? err.message : 'Network error'}`
      )
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as {
        error?: { type?: string; message?: string }
      }
      const msg = body?.error?.message ?? `HTTP ${res.status}`

      if (res.status === 401) {
        throw new AIError('key_invalid', `Anthropic rejected the API key: ${msg}`)
      }
      if (res.status === 429) {
        throw new AIError('provider_unavailable', `Anthropic rate limit reached: ${msg}`)
      }
      if (res.status === 400) {
        throw new AIError('generation_failed', `Anthropic bad request: ${msg}`)
      }
      throw new AIError('generation_failed', `Anthropic error: ${msg}`)
    }

    const data = await res.json() as {
      content?: { type: string; text?: string }[]
      model?: string
    }

    const raw = data.content?.find(b => b.type === 'text')?.text ?? ''

    // Extract JSON from the response, handling:
    // - Markdown fences (```json ... ```)
    // - Preamble text before the JSON ("Here is the outline: [...")
    // - Trailing text after the JSON
    const stripped = raw
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim()

    // Find the outermost [ ] or { } bounds
    const startArr = stripped.indexOf('[')
    const startObj = stripped.indexOf('{')
    let jsonStr = stripped
    if (startArr !== -1 || startObj !== -1) {
      let start: number, endChar: string
      if (startArr === -1) { start = startObj; endChar = '}' }
      else if (startObj === -1) { start = startArr; endChar = ']' }
      else if (startArr < startObj) { start = startArr; endChar = ']' }
      else { start = startObj; endChar = '}' }
      const end = stripped.lastIndexOf(endChar)
      if (end > start) jsonStr = stripped.slice(start, end + 1)
    }

    let parsed: unknown | null = null
    let parse_error: string | undefined
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Detect likely truncation: response doesn't end with ] or }
      const looksLikeTruncated = !jsonStr.trimEnd().match(/[}\]]['"]?\s*$/)
      const hint = looksLikeTruncated
        ? ' (response appears truncated — try again or reduce scope)'
        : ''
      parse_error = `Could not parse AI response as JSON${hint}. Raw: ${jsonStr.slice(0, 300)}`
    }

    return {
      raw_text: raw,
      parsed,
      parse_error,
      model: data.model ?? creds.model,
      provider: 'anthropic',
      duration_ms: Date.now() - start,
    }
  }
}
