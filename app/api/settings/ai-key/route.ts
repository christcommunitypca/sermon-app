import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveAndValidateKey, getKeyStatus, PROVIDER_DEFAULT_MODEL } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { writeAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

// POST /api/settings/ai-key
// Body: { key: string, modelPreference?: string }
// Flow: encrypt → upsert (user_id, provider) → validate → update status → return status
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  const user = authSession?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { key?: string; modelPreference?: string; churchId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const key = body.key?.trim() ?? ''
  const provider = getActiveProviderName()

  if (!key) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 })
  }

  // Provider-specific key format check
  const formatHints: Record<string, { prefix: string; hint: string }> = {
    openai:    { prefix: 'sk-',     hint: 'OpenAI keys start with sk-' },
    anthropic: { prefix: 'sk-ant-', hint: 'Anthropic keys start with sk-ant-' },
  }
  const fmt = formatHints[provider]
  if (fmt && !key.startsWith(fmt.prefix)) {
    return NextResponse.json({ error: `Invalid key format. ${fmt.hint}` }, { status: 400 })
  }

  const modelPreference = body.modelPreference ?? PROVIDER_DEFAULT_MODEL[provider]

  const result = await saveAndValidateKey(user.id, key, modelPreference, provider)

  if (result.error && result.status !== 'valid') {
    // Save itself failed (e.g. DB error) — surface it
    return NextResponse.json(
      { error: result.error },
      { status: result.status === 'untested' ? 503 : 400 }
    )
  }

  const statusRow = await getKeyStatus(user.id, provider)

  void writeAuditLog({
    churchId: body.churchId ?? 'unknown',
    actorUserId: user.id,
    action: AUDIT_ACTIONS.AI_KEY_SAVED,
    metadata: { validation_status: result.status, provider },
  })

  return NextResponse.json({ status: statusRow })
}

// DELETE /api/settings/ai-key
// Removes the credential row for the active provider only.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  const user = authSession?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const provider = getActiveProviderName()
  const { supabaseAdmin } = await import('@/lib/supabase/admin')

  await supabaseAdmin
    .from('user_ai_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  return NextResponse.json({ success: true })
}
