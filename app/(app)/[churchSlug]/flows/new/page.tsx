import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'
import { FlowCreateForm } from '@/components/flows/FlowCreateForm'

interface Props { params: { churchSlug: string } }

export default async function NewFlowPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('is_archived', false)
    .order('name')

  return (
    <FlowLibraryShell churchSlug={churchSlug} flows={flows ?? []} createHref={`/${churchSlug}/flows/new`}>
      <FlowCreateForm churchId={church.id} churchSlug={churchSlug} />
    </FlowLibraryShell>
  )
}
