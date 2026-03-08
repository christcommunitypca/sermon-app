import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateExistingKey } from '@/lib/ai/key'
import { supabaseAdmin } from '@/lib/supabase/admin'

// POST /api/settings/ai-key/validate
// Re-validates the stored encrypted key on demand. No body needed.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await validateExistingKey(user.id)

  const { data: statusRow } = await supabaseAdmin
    .from('user_ai_keys')
    .select('validation_status, validated_at, validation_error, model_preference, updated_at')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ status: statusRow, result })
}
