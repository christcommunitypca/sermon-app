import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Plus, LayoutList, Archive } from 'lucide-react'
import { Flow, SessionType } from '@/types/database'
import { FlowRowActions } from '@/components/flows/FlowRowActions'

interface Props {
  params: { churchSlug: string }
  searchParams: { show?: string }
}

const TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

function flowBadges(flow: Flow) {
  const badges: Array<{ label: string; tone: 'violet' | 'sky' }> = []
  if (flow.is_default_for) badges.push({ label: `Default for ${TYPE_LABELS[flow.is_default_for]}`, tone: 'violet' })
  for (const type of flow.recommended_for ?? []) {
    badges.push({ label: `Recommended for ${TYPE_LABELS[type]}`, tone: 'sky' })
  }
  return badges
}

export default async function FlowsPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const showArchived = searchParams.show === 'archived'

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
    .eq('is_archived', showArchived)
    .order('name')

  const { count: archivedCount } = await supabaseAdmin
    .from('flows')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('is_archived', true)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flows</h1>
          <p className="text-sm text-slate-500 mt-1">Reusable sermon and lesson movements</p>
        </div>
        {!showArchived && (
          <Link href={`/${churchSlug}/flows/new`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />New flow
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Link href={`/${churchSlug}/flows`}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${!showArchived ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
          Active
        </Link>
        <Link href={`/${churchSlug}/flows?show=archived`}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${showArchived ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
          <Archive className="w-3.5 h-3.5" />
          Archived
          {(archivedCount ?? 0) > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${showArchived ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {archivedCount}
            </span>
          )}
        </Link>
      </div>

      {!flows?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            {showArchived ? <Archive className="w-8 h-8 text-slate-300" /> : <LayoutList className="w-8 h-8 text-slate-300" />}
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {showArchived ? 'No archived flows' : 'No flows yet'}
          </h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            {showArchived
              ? 'Archived flows appear here. Archive a flow from its detail page or the actions menu.'
              : 'Flows define a reusable sermon movement for your sermons and lessons. Create one and apply it when starting new sessions.'}
          </p>
          {!showArchived && (
            <Link href={`/${churchSlug}/flows/new`} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
              <Plus className="w-4 h-4" />Create first flow
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {flows.map((flow: Flow) => {
            const badges = flowBadges(flow)
            return (
              <div key={flow.id} className="relative group">
                <Link href={`/${churchSlug}/flows/${flow.id}`}
                  className={`block bg-white border rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all ${showArchived ? 'border-stone-200 opacity-75' : 'border-slate-200'}`}>
                  <div className="pr-8">
                    <h3 className="font-semibold text-slate-900 text-lg">{flow.name}</h3>
                    {flow.description && <p className="text-sm text-slate-500 mt-1">{flow.description}</p>}
                  </div>

                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {badges.map((badge, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.tone === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {flow.explanation && (
                    <p className="text-sm text-slate-600 mt-4 line-clamp-2">{flow.explanation}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {flow.steps.slice(0, 6).map((step, i) => (
                      <span key={step.id ?? i} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {step.title}
                      </span>
                    ))}
                    {flow.steps.length > 6 && (
                      <span className="text-xs text-slate-400">+{flow.steps.length - 6} more</span>
                    )}
                  </div>
                </Link>
                <div className="absolute top-3 right-3">
                  <FlowRowActions
                    flowId={flow.id}
                    churchId={church.id}
                    churchSlug={churchSlug}
                    isArchived={showArchived}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
