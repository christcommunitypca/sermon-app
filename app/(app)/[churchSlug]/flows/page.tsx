import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Plus, LayoutList } from 'lucide-react'
import { Flow, SessionType } from '@/types/database'

interface Props { params: { churchSlug: string } }

const TYPE_LABELS: Record<SessionType, string> = {
  sermon: 'Sermon',
  sunday_school: 'Sunday School',
  bible_study: 'Bible Study',
}

export default async function FlowsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: flows } = await supabaseAdmin
    .from('flows').select('*').eq('church_id', church.id).eq('teacher_id', user.id).order('name')

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flows</h1>
          <p className="text-sm text-slate-500 mt-1">Reusable sermon and lesson structures</p>
        </div>
        <Link href={`/${churchSlug}/flows/new`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />New flow
        </Link>
      </div>

      {!flows?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <LayoutList className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No flows yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">Flows define a reusable block structure for your sermons. Create one and apply it when starting new sessions.</p>
          <Link href={`/${churchSlug}/flows/new`} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />Create first flow
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {flows.map((flow: Flow) => (
            <Link key={flow.id} href={`/${churchSlug}/flows/${flow.id}`}
              className="bg-white border border-slate-100 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-slate-900">{flow.name}</h3>
                {flow.is_default_for && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                    Default for {TYPE_LABELS[flow.is_default_for]}
                  </span>
                )}
              </div>
              {flow.description && <p className="text-sm text-slate-500 mb-3">{flow.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {flow.structure.slice(0, 6).map((block, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{block.label}</span>
                ))}
                {flow.structure.length > 6 && (
                  <span className="text-xs text-slate-400">+{flow.structure.length - 6} more</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
