import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserTradition } from '@/lib/research'
import { NewSeriesForm } from '@/components/series/NewSeriesForm'

interface Props { params: { churchSlug: string } }

export default async function NewSeriesPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: aiKey } = await supabaseAdmin
    .from('user_ai_keys').select('validation_status').eq('user_id', user.id).single()
  const hasValidAIKey = aiKey?.validation_status === 'valid'

  const tradition = await getUserTradition(user.id)

  return (
    <NewSeriesForm
      churchId={church.id}
      churchSlug={churchSlug}
      hasValidAIKey={hasValidAIKey}
      tradition={tradition}
    />
  )
}
