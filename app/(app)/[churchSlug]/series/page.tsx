import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Plus, BookOpen, Calendar, Archive } from 'lucide-react'
import { Series, SeriesStatus } from '@/types/database'
import { SeriesRowActions } from '@/components/series/SeriesRowActions'

interface Props {
  params: { churchSlug: string }
  searchParams: { show?: string }
}

const STATUS_STYLES: Record<SeriesStatus, string> = {
  planning: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-stone-100 text-stone-500',
}

const ACTIVE_STATUSES: SeriesStatus[] = ['planning', 'active', 'completed']

export default async function SeriesListPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const showArchived = searchParams.show === 'archived'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const query = supabaseAdmin
    .from('series')
    .select('*')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .order('updated_at', { ascending: false })

  const { data: series } = showArchived
    ? await query.eq('status', 'archived')
    : await query.in('status', ACTIVE_STATUSES)

  const { count: archivedCount } = await supabaseAdmin
    .from('series')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('status', 'archived')

  const allSeries = series ?? []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Series</h1>
          <p className="text-sm text-slate-500 mt-1">Multi-week teaching plans</p>
        </div>
        {!showArchived && (
          <Link href={`/${churchSlug}/series/new`}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />New series
          </Link>
        )}
      </div>

      {/* Archive toggle */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/${churchSlug}/series`}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${!showArchived ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
          Active
        </Link>
        <Link href={`/${churchSlug}/series?show=archived`}
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

      {!allSeries.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            {showArchived ? <Archive className="w-8 h-8 text-slate-300" /> : <BookOpen className="w-8 h-8 text-slate-300" />}
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {showArchived ? 'No archived series' : 'No series yet'}
          </h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            {showArchived
              ? 'Archived series will appear here.'
              : 'Plan a multi-week teaching series through a scripture section. AI helps break it into individual sessions.'}
          </p>
          {!showArchived && (
            <Link href={`/${churchSlug}/series/new`}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
              <Plus className="w-4 h-4" />Plan first series
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {allSeries.map((s: Series) => (
            <div key={s.id} className="flex items-center gap-2">
              <Link href={`/${churchSlug}/series/${s.id}`}
                className={`flex-1 flex items-start gap-4 bg-white border rounded-xl px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all min-w-0 ${s.status === 'archived' ? 'border-stone-200 opacity-75' : 'border-slate-100'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900 truncate">{s.title}</span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status]}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {s.scripture_section && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{s.scripture_section}</span>}
                    {s.total_weeks && <span>{s.total_weeks} weeks</span>}
                    {s.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.start_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-300 shrink-0 mt-0.5">{new Date(s.updated_at).toLocaleDateString()}</span>
              </Link>
              <SeriesRowActions
                seriesId={s.id}
                churchSlug={churchSlug}
                isArchived={s.status === 'archived'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
