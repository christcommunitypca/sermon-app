'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { saveAndValidateKey, getKeyStatus, validateExistingKey, PROVIDER_DEFAULT_MODEL } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

// ── Save & validate key ─────────────────────────────────────────────────────
export async function saveAIKeyAction(input: {
  key: string
  modelPreference?: string
}) {
  const user = await getActionUser()
  if (!user) return { status: null, error: 'Session expired — please refresh the page.' }
  const provider = getActiveProviderName()
  const key = input.key.trim()

  if (!key) return { status: null, error: 'API key is required' }

  const formatHints: Record<string, { prefix: string; hint: string }> = {
    openai:    { prefix: 'sk-',     hint: 'OpenAI keys start with sk-' },
    anthropic: { prefix: 'sk-ant-', hint: 'Anthropic keys start with sk-ant-' },
  }
  const fmt = formatHints[provider]
  if (fmt && !key.startsWith(fmt.prefix)) {
    return { status: null, error: `Invalid key format. ${fmt.hint}` }
  }

  const modelPreference = input.modelPreference ?? PROVIDER_DEFAULT_MODEL[provider]
  const result = await saveAndValidateKey(user.id, key, modelPreference, provider)

  if (result.error && result.status !== 'valid') {
    return { status: null, error: result.error }
  }

  const statusRow = await getKeyStatus(user.id, provider)

  void writeAuditLog({
    churchId: 'unknown',
    actorUserId: user.id,
    action: AUDIT_ACTIONS.AI_KEY_SAVED,
    metadata: { validation_status: result.status, provider },
  })

  return { status: statusRow, error: null }
}

// ── Validate existing key ────────────────────────────────────────────────────
export async function validateAIKeyAction() {
  const user = await getActionUser()
  if (!user) return { status: null, error: 'Session expired — please refresh the page.' }
  const provider = getActiveProviderName()
  const result = await validateExistingKey(user.id, provider)
  const statusRow = await getKeyStatus(user.id, provider)
  return { status: statusRow, result, error: null }
}

// ── Remove key ───────────────────────────────────────────────────────────────
export async function removeAIKeyAction() {
  const user = await getActionUser()
  if (!user) return { status: null, error: 'Session expired — please refresh the page.' }
  const provider = getActiveProviderName()
  await supabaseAdmin
    .from('user_ai_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)
  return { success: true }
}
