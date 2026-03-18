// ── lib/ai/providers/resolver.ts ─────────────────────────────────────────────
// Returns the active AI provider instance.
// Provider is selected via AI_PROVIDER environment variable.
//
// Valid values: "openai" | "anthropic"
// Default: "openai"
//
// To switch providers:
//   In .env.local: AI_PROVIDER=anthropic
//   No code changes needed. No callers change.
//
// To add a new provider:
//   1. Implement AIProvider in a new file under providers/
//   2. Import and instantiate it here
//   3. Add it to the switch statement
//
// No caller outside lib/ai/ should ever import a provider directly.

import type { AIProvider } from '@/lib/ai/types'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'

// ── Singletons — instantiated once, reused across requests ────────────────────
const openai = new OpenAIProvider()
const anthropic = new AnthropicProvider()

export type SupportedProvider = 'openai' | 'anthropic'

export function getActiveProviderName(): SupportedProvider {
  const configured = process.env.AI_PROVIDER?.toLowerCase()
  if (configured === 'anthropic') return 'anthropic'
  return 'openai' // default
}

export function getProvider(): AIProvider {
  const name = getActiveProviderName()
  switch (name) {
    case 'anthropic': return anthropic
    case 'openai':    return openai
  }
}
