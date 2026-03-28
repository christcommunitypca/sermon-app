import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'
import {
  canManageSharedFlows,
  getMemberRole,
  listPersonalFlows,
  listSharedFlows,
  normalizeFlowScope,
} from '@/lib/flow-library'

interface Props {
  params: { churchSlug: string }
  searchParams?: { scope?: string }
}

export default async function FlowsPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const role = await getMemberRole(church.id, user.id)
  if (!role) redirect('/sign-in?error=not_a_member')

  const requestedScope = normalizeFlowScope(searchParams?.scope)
  const scope = requestedScope === 'church' && canManageSharedFlows(role) ? 'church' : 'personal'

  const flows = scope === 'church'
    ? await listSharedFlows(church.id)
    : await listPersonalFlows(church.id, user.id)

  const title = scope === 'church' ? 'Shared Flows' : 'My Flows'
  const description = scope === 'church'
    ? 'Shared flows are available across the church. Keep them clear, reusable, and simple.'
    : 'Personal flows are just for you. Use them when you want your own preferred movement.'

  return (
    <FlowLibraryShell
      churchSlug={churchSlug}
      flows={flows}
      createHref={`/${churchSlug}/flows/new?scope=${scope}`}
      createLabel={scope === 'church' ? 'Create shared flow' : 'Create flow'}
      flowHrefSuffix={`?scope=${scope}`}
      title={title}
      description={description}
    >
      <div className="bg-white border border-slate-200 rounded-2xl p-8">
        <h2 className="text-lg font-semibold text-slate-900">Choose or create a flow</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl">
          Existing flows stay on the left. Open one to edit it, or create a new one when you need a different sermon movement.
        </p>
      </div>
    </FlowLibraryShell>
  )
}
