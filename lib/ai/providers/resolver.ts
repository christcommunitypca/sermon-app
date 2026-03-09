// ── lib/ai/providers/resolver.ts ─────────────────────────────────────────────
// Returns the active AI provider instance.
// This is the single place to change providers in the future.
//
// To add a new provider later:
// 1. Implement the AIProvider interface in a new provider file
// 2. Import it here
// 3. Change the return statement (or add env-based logic)
//
// No caller outside lib/ai/ should ever import a provider directly.

import type { AIProvider } from '@/lib/ai/types'
import { OpenAIProvider } from './openai'

// ── Active provider ───────────────────────────────────────────────────────────
// Singleton — instantiated once, reused across requests.
const openai = new OpenAIProvider()

export function getProvider(): AIProvider {
  // TODO: When multi-provider support is added, resolve from config or env here.
  // e.g. process.env.AI_PROVIDER === 'anthropic' ? anthropic : openai
  return openai
}
