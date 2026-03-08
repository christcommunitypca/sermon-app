import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ValidationStatus } from '@/types/database'

// ── Encryption ────────────────────────────────────────────────────────────────
// AES-256-GCM. Key derived from ENCRYPTION_SECRET env var via PBKDF2.
// The encrypted value is stored as base64(iv + authTag + ciphertext).
// The raw key is never returned to the client after being saved.

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET
if (!ENCRYPTION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_SECRET is required in production')
}

async function getDerivedKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const secret = ENCRYPTION_SECRET ?? 'dev-secret-do-not-use-in-production'
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('church-platform-v1'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptKey(plaintext: string): Promise<string> {
  const key = await getDerivedKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const cipherBytes = new Uint8Array(encrypted)
  // Store as: base64(iv[12] + ciphertext)
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

// ── Validation ────────────────────────────────────────────────────────────────
// Validates an OpenAI API key by calling the models list endpoint.
// If OPENAI_MOCK_VALIDATION=true, skips the real call (for local dev without a real key).

interface ValidationResult {
  status: 'valid' | 'invalid' | 'expired'
  error: string | null
}

export async function validateOpenAIKey(encryptedKey: string): Promise<ValidationResult> {
  if (process.env.OPENAI_MOCK_VALIDATION === 'true') {
    // Stub for local dev. Swap OPENAI_MOCK_VALIDATION=false when using real keys.
    console.warn('[ai-key] Mock validation active — always returns valid')
    return { status: 'valid', error: null }
  }

  let plainKey: string
  try {
    plainKey = await decryptKey(encryptedKey)
  } catch {
    return { status: 'invalid', error: 'Failed to decrypt key for validation' }
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${plainKey}` },
    })

    if (res.ok) {
      return { status: 'valid', error: null }
    }

    const body = await res.json().catch(() => ({}))
    const message = body?.error?.message ?? `HTTP ${res.status}`

    if (res.status === 401) {
      return { status: 'invalid', error: `Invalid API key: ${message}` }
    }
    if (res.status === 429) {
      // Rate limited but key is valid
      return { status: 'valid', error: null }
    }

    return { status: 'invalid', error: message }
  } catch (err) {
    return { status: 'invalid', error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ── saveAndValidateKey ────────────────────────────────────────────────────────
// Full flow: encrypt → store as untested → validate → update status.
// Returns the final validation status.
export async function saveAndValidateKey(
  userId: string,
  plainKey: string,
  modelPreference: string
): Promise<{ status: ValidationStatus; error: string | null }> {
  // 1. Encrypt
  let encrypted: string
  try {
    encrypted = await encryptKey(plainKey)
  } catch {
    return { status: 'invalid', error: 'Encryption failed' }
  }

  // 2. Upsert as untested
  const { error: upsertError } = await supabaseAdmin
    .from('user_ai_keys')
    .upsert({
      user_id: userId,
      openai_key_enc: encrypted,
      model_preference: modelPreference,
      validation_status: 'untested',
      validated_at: null,
      validation_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (upsertError) {
    return { status: 'untested', error: 'Failed to save key' }
  }

  // 3. Validate immediately
  const result = await validateOpenAIKey(encrypted)

  // 4. Update validation status
  await supabaseAdmin
    .from('user_ai_keys')
    .update({
      validation_status: result.status,
      validated_at: result.status === 'valid' ? new Date().toISOString() : null,
      validation_error: result.error,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return result
}

// ── validateExistingKey ───────────────────────────────────────────────────────
// Re-validate the stored (encrypted) key on demand.
export async function validateExistingKey(
  userId: string
): Promise<{ status: ValidationStatus; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('user_ai_keys')
    .select('openai_key_enc')
    .eq('user_id', userId)
    .single()

  if (error || !data?.openai_key_enc) {
    return { status: 'invalid', error: 'No API key found' }
  }

  const result = await validateOpenAIKey(data.openai_key_enc)

  await supabaseAdmin
    .from('user_ai_keys')
    .update({
      validation_status: result.status,
      validated_at: result.status === 'valid' ? new Date().toISOString() : null,
      validation_error: result.error,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return result
}

// ── getKeyStatus ──────────────────────────────────────────────────────────────
// Returns the non-sensitive status row for display in settings UI.
// Never returns the encrypted key.
export async function getKeyStatus(userId: string) {
  const { data } = await supabaseAdmin
    .from('user_ai_keys')
    .select('validation_status, validated_at, validation_error, model_preference, updated_at')
    .eq('user_id', userId)
    .single()

  return data ?? null
}

// ── hasValidKey ───────────────────────────────────────────────────────────────
// Quick check for gating AI features.
export async function hasValidKey(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_ai_keys')
    .select('validation_status')
    .eq('user_id', userId)
    .single()

  return data?.validation_status === 'valid'
}