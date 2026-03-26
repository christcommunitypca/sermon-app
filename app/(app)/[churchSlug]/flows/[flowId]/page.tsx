import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowEditor } from '@/components/flows/FlowEditor'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'

interface Props { params: { churchSlug: string; flowId: string } }

export default async function FlowDetailPage({ params }: Props) {
  const { churchSlug, flowId } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('is_archived', false)
    .order('name')

  const flow = (flows ?? []).find(f => f.id === flowId)
  if (!flow) return notFound()

  return (
    <FlowLibraryShell churchSlug={churchSlug} flows={flows ?? []} selectedFlowId={flowId} createHref={`/${churchSlug}/flows/new`}>
      <FlowEditor
        flowId={flow.id}
        churchSlug={churchSlug}
        initialName={flow.name}
        initialDescription={flow.description}
        initialExplanation={flow.explanation ?? null}
        initialSteps={flow.steps ?? []}
        initialDefaultFor={flow.is_default_for}
      />
    </FlowLibraryShell>
  )
}
