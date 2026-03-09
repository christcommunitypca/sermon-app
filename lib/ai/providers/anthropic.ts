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
          max_tokens: prompt.maxTokens ?? 2000,
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

    // Strip markdown fences if the model wraps its JSON response
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new AIError(
        'malformed_response',
        `Could not parse Anthropic response as JSON. Raw: ${cleaned.slice(0, 200)}`
      )
    }

    return {
      parsed,
      model: data.model ?? creds.model,
      provider: 'anthropic',
      duration_ms: Date.now() - start,
    }
  }
}
