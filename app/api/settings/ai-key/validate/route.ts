import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateExistingKey, getKeyStatus } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'

// POST /api/settings/ai-key/validate
// Re-validates the stored key for the active provider. No body needed.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  const user = authSession?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const provider = getActiveProviderName()
  const result = await validateExistingKey(user.id, provider)
  const statusRow = await getKeyStatus(user.id, provider)

  return NextResponse.json({ status: statusRow, result })
}
