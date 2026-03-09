import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserTradition } from '@/lib/research'
import { NewSeriesForm } from '@/components/series/NewSeriesForm'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'

interface Props { params: { churchSlug: string } }

export default async function NewSeriesPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const hasValidAIKey = await hasValidKey(user.id, getActiveProviderName())
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
