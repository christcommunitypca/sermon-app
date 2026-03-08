import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveAndValidateKey } from '@/lib/ai/key'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

// POST /api/settings/ai-key
// Body: { key: string, modelPreference: string }
// Flow: encrypt → store as untested → validate → update status → return status
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const key: string = body.key?.trim()
  const modelPreference: string = body.modelPreference ?? 'gpt-4o'

  if (!key || !key.startsWith('sk-')) {
    return NextResponse.json({ error: 'Invalid key format. OpenAI keys start with sk-' }, { status: 400 })
  }

  const result = await saveAndValidateKey(user.id, key, modelPreference)

  // Fetch the updated status row to return to the client (never returns the encrypted key)
  const { data: statusRow } = await supabaseAdmin
    .from('user_ai_keys')
    .select('validation_status, validated_at, validation_error, model_preference, updated_at')
    .eq('user_id', user.id)
    .single()

  // Audit
  void writeAuditLog({
    churchId: body.churchId ?? 'unknown', // passed from client context in real usage
    actorUserId: user.id,
    action: AUDIT_ACTIONS.AI_KEY_SAVED,
    metadata: { validation_status: result.status },
  })

  return NextResponse.json({ status: statusRow })
}

// DELETE /api/settings/ai-key
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabaseAdmin
    .from('user_ai_keys')
    .delete()
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
