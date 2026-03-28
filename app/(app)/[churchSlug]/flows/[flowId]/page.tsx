import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowEditor } from '@/components/flows/FlowEditor'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'
import { canManageSharedFlows, getMemberRole, listPersonalFlows, listSharedFlows } from '@/lib/flow-library'
import type { Flow } from '@/types/database'

interface Props { params: { churchSlug: string; flowId: string } }

export default async function FlowDetailPage({ params }: Props) {
  const { churchSlug, flowId } = params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: flowData } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', flowId)
    .eq('church_id', church.id)
    .eq('is_archived', false)
    .single()

  const flow = flowData as Flow | null
  if (!flow) return notFound()

  const role = await getMemberRole(church.id, user.id)
  if (!role) redirect('/sign-in?error=not_a_member')

  const isShared = flow.owner_user_id === null
  if (isShared && !canManageSharedFlows(role)) {
    redirect(`/${churchSlug}/settings/my-setup/flows`)
  }
  if (!isShared && flow.owner_user_id !== user.id) {
    return notFound()
  }

  const flows = isShared
    ? await listSharedFlows(church.id)
    : await listPersonalFlows(church.id, user.id)

  const scope = isShared ? 'church' : 'personal'

  return (
    <FlowLibraryShell
      churchSlug={churchSlug}
      flows={flows}
      selectedFlowId={flowId}
      createHref={`/${churchSlug}/flows/new?scope=${scope}`}
      createLabel={isShared ? 'Create shared flow' : 'Create flow'}
      flowHrefSuffix={`?scope=${scope}`}
      title={isShared ? 'Shared Flows' : 'My Flows'}
      description={isShared
        ? 'Shared flows help keep lesson setup consistent across the church.'
        : 'Personal flows give you your own starting points without changing church-wide defaults.'}
    >
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
