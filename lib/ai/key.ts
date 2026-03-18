// ── lib/ai/key.ts ─────────────────────────────────────────────────────────────
// Credential management for the AI layer.
//
// TABLE: user_ai_credentials (user_id, provider) PRIMARY KEY
// One row per user per provider. Adding a new provider = zero schema changes.
//
// RUNTIME RESOLUTION ORDER (for every AI call):
//   1. AI_PROVIDER env var → selects active provider (default: 'openai')
//   2. Look up user_ai_credentials WHERE (user_id, provider) = (userId, activeProvider)
//   3. Require validation_status = 'valid'
//   4. Decrypt api_key_enc → plain API key
//   5. Pass to provider.complete()
//
// There is no env-based key fallback. All keys are user-stored.
// This keeps per-user credentials clean — each teacher owns their own key.
//
// MOCK VALIDATION:
//   Set AI_MOCK_VALIDATION=true to skip real API validation calls.
//   This replaces the old per-provider OPENAI_MOCK_VALIDATION / ANTHROPIC_MOCK_VALIDATION.
//   Useful for local dev without real API keys.

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ValidationStatus } from '@/types/database'
import type { SupportedProvider } from '@/lib/ai/providers/resolver'

// ── Encryption ────────────────────────────────────────────────────────────────
// AES-256-GCM. Key derived from ENCRYPTION_SECRET env var via PBKDF2.
// Stored as base64(iv[12] + ciphertext). Raw key never returned to client.

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET
if (!ENCRYPTION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_SECRET is required in production')
}

async function getDerivedKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const secret = ENCRYPTION_SECRET ?? 'dev-secret-do-not-use-in-production'
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('church-platform-v1'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  )
}

export async function encryptKey(plaintext: string): Promise<string> {
  const key = await getDerivedKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const cipherBytes = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + cipherBytes.length)
  combined.set(iv)
  combined.set(cipherBytes, iv.length)
  return btoa(Array.from(combined, b => String.fromCharCode(b)).join(''))
}

export async function decryptKey(stored: string): Promise<string> {
  const key = await getDerivedKey()
  const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

// ── Provider validation ───────────────────────────────────────────────────────
// Each provider validates differently. All return the same ValidationResult shape.
// A single AI_MOCK_VALIDATION=true env var skips all real calls for local dev.

interface ValidationResult {
  status: 'valid' | 'invalid' | 'expired'
  error: string | null
}

function isMockValidation(): boolean {
  return process.env.AI_MOCK_VALIDATION === 'true'
}

async function validatePlainKey(
  plainKey: string,
  provider: SupportedProvider
): Promise<ValidationResult> {
  if (isMockValidation()) {
    console.warn(`[ai-key] Mock validation active (AI_MOCK_VALIDATION=true) — skipping real ${provider} call`)
    return { status: 'valid', error: null }
  }

  switch (provider) {
    case 'openai':    return validateOpenAIPlainKey(plainKey)
    case 'anthropic': return validateAnthropicPlainKey(plainKey)
    default:
      return { status: 'invalid', error: `No validator implemented for provider: ${provider}` }
  }
}

async function validateOpenAIPlainKey(plainKey: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${plainKey}` },
    })
    if (res.ok) return { status: 'valid', error: null }
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const message = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401) return { status: 'invalid', error: `Invalid API key: ${message}` }
    if (res.status === 429) return { status: 'valid', error: null }
    return { status: 'invalid', error: message }
  } catch (err) {
    return { status: 'invalid', error: err instanceof Error ? err.message : 'Network error' }
  }
}

async function validateAnthropicPlainKey(plainKey: string): Promise<ValidationResult> {
  try {
    // Anthropic has no models-list endpoint. Validate via a minimal 1-token completion.
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': plainKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.ok) return { status: 'valid', error: null }
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const message = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401) return { status: 'invalid', error: `Invalid API key: ${message}` }
    if (res.status === 429) return { status: 'valid', error: null }
    return { status: 'invalid', error: message }
  } catch (err) {
    return { status: 'invalid', error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ── Default models per provider ───────────────────────────────────────────────

export const PROVIDER_DEFAULT_MODEL: Record<SupportedProvider, string> = {
  openai:    'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
}

// Max output tokens per known model.
// Used by providers to cap requests correctly without hard-coding values in prompts.
// When a model isn't listed here, the provider falls back to its own safe default.
// Update this table when adding new models — don't change prompt maxTokens values.
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-6':          8192,
  'claude-opus-4-6':            8192,
  'claude-haiku-4-5-20251001':  8192,
  // OpenAI
  'gpt-4o':                    16384,
  'gpt-4o-mini':               16384,
  'gpt-4-turbo':                4096,
}

// Returns the max output tokens for a given model, with a conservative fallback.
export function getModelMaxOutputTokens(model: string): number {
  return MODEL_MAX_OUTPUT_TOKENS[model] ?? 4096
}

// ── Database helpers ──────────────────────────────────────────────────────────
// All credential DB access goes through these. No other file queries
// user_ai_credentials for key material.

type CredentialRow = {
  api_key_enc: string | null
  model_preference: string | null
  validation_status: string
  validated_at: string | null
  validation_error: string | null
  updated_at: string
}

async function getCredentialRow(
  userId: string,
  provider: SupportedProvider
): Promise<CredentialRow | null> {
  const { data } = await supabaseAdmin
    .from('user_ai_credentials')
    .select('api_key_enc, model_preference, validation_status, validated_at, validation_error, updated_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()
  return data ?? null
}

async function upsertCredentialStatus(
  userId: string,
  provider: SupportedProvider,
  status: 'valid' | 'invalid' | 'expired' | 'untested',
  error: string | null
): Promise<void> {
  await supabaseAdmin
    .from('user_ai_credentials')
    .update({
      validation_status: status,
      validated_at: status === 'valid' ? new Date().toISOString() : null,
      validation_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', provider)
}

// ── Public API ────────────────────────────────────────────────────────────────

// saveAndValidateKey
// Full flow: encrypt → upsert as untested → validate → update status.
// Upsert is keyed on (user_id, provider) — safe to call repeatedly.
export async function saveAndValidateKey(
  userId: string,
  plainKey: string,
  modelPreference: string,
  provider: SupportedProvider
): Promise<{ status: ValidationStatus; error: string | null }> {
  let encrypted: string
  try {
    encrypted = await encryptKey(plainKey)
  } catch {
    return { status: 'invalid', error: 'Encryption failed' }
  }

  const { error: upsertError } = await supabaseAdmin
    .from('user_ai_credentials')
    .upsert({
      user_id: userId,
      provider,
      api_key_enc: encrypted,
      model_preference: modelPreference,
      validation_status: 'untested',
      validated_at: null,
      validation_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

  if (upsertError) {
    return { status: 'untested', error: 'Failed to save key' }
  }

  const result = await validatePlainKey(plainKey, provider)
  await upsertCredentialStatus(userId, provider, result.status, result.error)
  return result
}

// validateExistingKey
// Re-validates the stored encrypted key on demand.
export async function validateExistingKey(
  userId: string,
  provider: SupportedProvider
): Promise<{ status: ValidationStatus; error: string | null }> {
  const row = await getCredentialRow(userId, provider)

  if (!row?.api_key_enc) {
    return { status: 'invalid', error: 'No API key found' }
  }

  let plainKey: string
  try {
    plainKey = await decryptKey(row.api_key_enc)
  } catch {
    return { status: 'invalid', error: 'Failed to decrypt stored key' }
  }

  const result = await validatePlainKey(plainKey, provider)
  await upsertCredentialStatus(userId, provider, result.status, result.error)
  return result
}

// getKeyStatus
// Returns the non-sensitive status row for the active provider.
// Never returns api_key_enc.
export async function getKeyStatus(userId: string, provider: SupportedProvider) {
  const { data } = await supabaseAdmin
    .from('user_ai_credentials')
    .select('validation_status, validated_at, validation_error, model_preference, updated_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()
  return data ?? null
}

// hasValidKey
// Returns true if the user has a valid key for the given provider.
// Used for feature gating in page components.
export async function hasValidKey(userId: string, provider: SupportedProvider): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_ai_credentials')
    .select('validation_status')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()
  return data?.validation_status === 'valid'
}

// getDecryptedKey
// Returns the decrypted API key for the active provider.
// Called only by service.ts — never exposed to client code.
export async function getDecryptedKey(
  userId: string,
  provider: SupportedProvider
): Promise<{ apiKey: string; model: string } | null> {
  const row = await getCredentialRow(userId, provider)
  if (!row?.api_key_enc || row.validation_status !== 'valid') return null

  try {
    const apiKey = await decryptKey(row.api_key_enc)
    const model = pickModel(row.model_preference, provider)
    return { apiKey, model }
  } catch {
    return null
  }
}

// pickModel
// Returns the model to use: stored preference if it matches the provider,
// otherwise the provider default.
function pickModel(stored: string | null, provider: SupportedProvider): string {
  if (!stored) return PROVIDER_DEFAULT_MODEL[provider]
  const providerPrefixes: Record<SupportedProvider, string[]> = {
    openai:    ['gpt-', 'o1', 'o3'],
    anthropic: ['claude-'],
  }
  const prefixes = providerPrefixes[provider] ?? []
  return prefixes.some(p => stored.startsWith(p)) ? stored : PROVIDER_DEFAULT_MODEL[provider]
}
