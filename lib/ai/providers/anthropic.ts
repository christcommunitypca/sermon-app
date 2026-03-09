// ── lib/ai/providers/anthropic.ts ────────────────────────────────────────────
// Anthropic (Claude) provider — STUB.
// TODO: Implement when Anthropic support is added.
//
// Implementation notes for when this is built:
// - API base: https://api.anthropic.com/v1/messages
// - Auth header: x-api-key (not Authorization: Bearer)
// - Requires: anthropic-version header (e.g. "2023-06-01")
// - System prompt: top-level `system` field, not in messages array
// - Response: content[0].type === 'text', content[0].text
// - Model names: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5, etc.
// - Rate limit errors: 429 with retry-after header
// - Key validation endpoint: GET /v1/models or attempt a minimal completion

import type { AIProvider, PromptPayload, ProviderCredentials, ProviderCompletion } from '@/lib/ai/types'
import { AIError } from '@/lib/ai/types'

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const

  async complete(
    _prompt: PromptPayload,
    _creds: ProviderCredentials
  ): Promise<ProviderCompletion> {
    throw new AIError(
      'provider_unavailable',
      'Anthropic provider is not yet implemented. Set provider to "openai" in resolver.ts.'
    )
  }
}
