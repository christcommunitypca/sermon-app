import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowRowActions } from '@/components/flows/FlowRowActions'
import { Flow, SessionType } from '@/types/database'
import { ChevronLeft, Plus } from 'lucide-react'
import { listPersonalFlows } from '@/lib/flow-library'

interface Props { params: { churchSlug: string } }

const TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

export default async function MyFlowsSettingsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()
  if (!member) redirect('/sign-in?error=not_a_member')

  const flows = await listPersonalFlows(church.id, session.user.id)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/my-setup/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />My Flows
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Flows</h1>
        {!flows.length && <p className="text-sm text-slate-500 mt-1">Flows give the outline generator a sermon movement to follow. Create your first one to make lesson setup easier.</p>}
      </div>

      <div className="flex justify-end mb-6">
        <Link href={`/${churchSlug}/flows/new?scope=personal`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />Create flow
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {flows.map((flow: Flow) => (
          <div key={flow.id} className="relative group">
            <Link href={`/${churchSlug}/flows/${flow.id}?scope=personal`} className="block bg-white border border-slate-100 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-2 pr-6 gap-2">
                <h3 className="font-semibold text-slate-900">{flow.name}</h3>
                {flow.is_default_for && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Default for {TYPE_LABELS[flow.is_default_for]}</span>
                )}
              </div>
              {flow.description && <p className="text-sm text-slate-500">{flow.description}</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {flow.steps.slice(0, 5).map((step: { id?: string; title: string }, i: number) => (
                  <span key={step.id ?? i} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{step.title}</span>
                ))}
              </div>
            </Link>
            <div className="absolute top-3 right-3">
              <FlowRowActions flowId={flow.id} churchId={church.id} churchSlug={churchSlug} isArchived={false} />
            </div>
          </div>
        ))}
      </div>

      {!flows.length && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">
          No personal flows yet. Create one and it will show up here.
        </div>
      )}
    </div>
  )
}
