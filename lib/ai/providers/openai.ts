// ── lib/ai/providers/openai.ts ────────────────────────────────────────────────
// OpenAI implementation of AIProvider.
// Responsibility: HTTP call to OpenAI chat completions, JSON extraction,
// and error normalization into AIError.
// No business logic. No prompt construction. No result mapping.

import type { AIProvider, PromptPayload, ProviderCredentials, ProviderCompletion } from '@/lib/ai/types'
import { AIError } from '@/lib/ai/types'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const

  async complete(
    prompt: PromptPayload,
    creds: ProviderCredentials
  ): Promise<ProviderCompletion> {
    const start = Date.now()

    let res: Response
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: prompt.maxTokens ?? 2000,
          temperature: prompt.temperature ?? 0.4,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user',   content: prompt.user   },
          ],
        }),
      })
    } catch (err) {
      throw new AIError(
        'provider_unavailable',
        `OpenAI request failed: ${err instanceof Error ? err.message : 'Network error'}`
      )
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
      const msg = body?.error?.message ?? `HTTP ${res.status}`

      if (res.status === 401) {
        throw new AIError('key_invalid', `OpenAI rejected the API key: ${msg}`)
      }
      if (res.status === 429) {
        throw new AIError('provider_unavailable', `OpenAI rate limit reached: ${msg}`)
      }
      throw new AIError('generation_failed', `OpenAI error: ${msg}`)
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content ?? ''

    // Strip markdown fences if the model wraps its JSON response
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new AIError(
        'malformed_response',
        `Could not parse OpenAI response as JSON. Raw: ${cleaned.slice(0, 200)}`
      )
    }

    return {
      parsed,
      model: creds.model,
      provider: 'openai',
      duration_ms: Date.now() - start,
    }
  }
}
