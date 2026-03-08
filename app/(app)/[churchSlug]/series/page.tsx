import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSeriesForTeacher } from '@/lib/series'
import { Plus, BookOpen, Calendar } from 'lucide-react'
import { Series, SeriesStatus } from '@/types/database'

interface Props { params: { churchSlug: string } }

const STATUS_STYLES: Record<SeriesStatus, string> = {
  planning: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-stone-100 text-stone-500',
}

export default async function SeriesListPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const series = await getSeriesForTeacher(church.id, user.id)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Series</h1>
          <p className="text-sm text-slate-500 mt-1">Multi-week teaching plans</p>
        </div>
        <Link href={`/${churchSlug}/series/new`}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />New series
        </Link>
      </div>

      {!series.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No series yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            Plan a multi-week teaching series through a scripture section. AI helps break it into individual sessions.
          </p>
          <Link href={`/${churchSlug}/series/new`}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
            <Plus className="w-4 h-4" />Plan first series
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {series.map((s: Series) => (
            <Link key={s.id} href={`/${churchSlug}/series/${s.id}`}
              className="flex items-start gap-4 bg-white border border-slate-100 rounded-xl px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{s.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {s.scripture_section && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{s.scripture_section}</span>}
                  {s.total_weeks && <span>{s.total_weeks} weeks</span>}
                  {s.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.start_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <span className="text-xs text-slate-300 shrink-0 mt-0.5">{new Date(s.updated_at).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
