// ── lib/ai/providers/google.ts ────────────────────────────────────────────────
// Google (Gemini) provider — STUB.
// TODO: Implement when Google support is added.
//
// Implementation notes for when this is built:
// - API base: https://generativelanguage.googleapis.com/v1beta
// - Auth: ?key=API_KEY query param (or Authorization: Bearer for Vertex AI)
// - Endpoint: /models/{model}:generateContent
// - Request shape differs from OpenAI: uses `contents` array with `parts`
// - System instructions: separate `systemInstruction` field
// - Response: candidates[0].content.parts[0].text
// - Model names: gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash, etc.
// - PromptPayload will need a provider-aware adapter or separate buildGooglePrompt()
//   since Gemini's system instruction field is top-level, not in the messages array

import type { AIProvider, PromptPayload, ProviderCredentials, ProviderCompletion } from '@/lib/ai/types'
import { AIError } from '@/lib/ai/types'

export class GoogleProvider implements AIProvider {
  readonly name = 'google' as const

  async complete(
    _prompt: PromptPayload,
    _creds: ProviderCredentials
  ): Promise<ProviderCompletion> {
    throw new AIError(
      'provider_unavailable',
      'Google provider is not yet implemented. Set provider to "openai" in resolver.ts.'
    )
  }
}
