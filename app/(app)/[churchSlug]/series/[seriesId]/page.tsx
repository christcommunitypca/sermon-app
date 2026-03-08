import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSeriesWithSessions } from '@/lib/series'
import { ChevronLeft, BookOpen, Calendar, ExternalLink, Plus, AlertCircle } from 'lucide-react'
import { SeriesSessionStatus } from '@/types/database'
import { createSessionFromSeriesWeekAction } from '../actions'

interface Props { params: { churchSlug: string; seriesId: string } }

const STATUS_STYLES: Record<SeriesSessionStatus, string> = {
  planned: 'bg-slate-100 text-slate-500',
  created: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

export default async function SeriesDetailPage({ params }: Props) {
  const { churchSlug, seriesId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const data = await getSeriesWithSessions(seriesId, user.id)
  if (!data) return notFound()

  const { series, sessions } = data

  // Void-returning wrapper — form action must return void, not { sessionId, error }
  async function createWeekSession(seriesSessionId: string): Promise<void> {
    'use server'
    await createSessionFromSeriesWeekAction(seriesSessionId, seriesId, '', churchSlug)
  }

  // Find next undelivered week
  const nextWeek = sessions.find(s => s.status !== 'delivered')

  // Format start date
  const startLabel = series.start_date
    ? new Date(series.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/series`}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Series
      </Link>

      {/* Series header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{series.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 mt-2">
              {series.scripture_section && (
                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{series.scripture_section}</span>
              )}
              {series.total_weeks && <span>{series.total_weeks} weeks</span>}
              {startLabel && (
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{startLabel}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                series.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                series.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-600'
              }`}>{series.status}</span>
            </div>
            {series.description && (
              <p className="mt-3 text-sm text-slate-600">{series.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Next up banner */}
      {nextWeek && nextWeek.status === 'planned' && (
        <div className="mb-6 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-violet-600 font-medium mb-0.5">Next up — Week {nextWeek.week_number}</p>
            <p className="text-sm font-semibold text-violet-900">{nextWeek.proposed_title}</p>
            {nextWeek.proposed_scripture && (
              <p className="text-xs text-violet-600 mt-0.5">{nextWeek.proposed_scripture}</p>
            )}
          </div>
          <form action={createWeekSession.bind(null, nextWeek.id)}>
            <button type="submit"
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors shrink-0">
              <Plus className="w-3.5 h-3.5" />Create session
            </button>
          </form>
        </div>
      )}
      {nextWeek && nextWeek.status === 'created' && nextWeek.session_id && (
        <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-medium mb-0.5">In progress — Week {nextWeek.week_number}</p>
            <p className="text-sm font-semibold text-blue-900">{(nextWeek as any).teaching_sessions?.title ?? nextWeek.proposed_title}</p>
          </div>
          <Link href={`/${churchSlug}/teaching/${nextWeek.session_id}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />Open
          </Link>
        </div>
      )}

      {/* Week list */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          {sessions.length} week{sessions.length !== 1 ? 's' : ''}
        </h2>

        {sessions.map(ss => {
          const weekDate = series.start_date
            ? (() => {
                const d = new Date(series.start_date)
                d.setDate(d.getDate() + (ss.week_number - 1) * 7)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()
            : null

          const linkedSession = (ss as any).teaching_sessions

          return (
            <div key={ss.id}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${ss.liturgical_note ? 'border-amber-200' : 'border-slate-100'}`}>
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">
                  {ss.week_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {linkedSession?.title ?? ss.proposed_title ?? `Week ${ss.week_number}`}
                    </span>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[ss.status]}`}>
                      {ss.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {ss.proposed_scripture && (
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{ss.proposed_scripture}</span>
                    )}
                    {weekDate && <span>{weekDate}</span>}
                  </div>
                  {ss.notes && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{ss.notes}</p>}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {ss.liturgical_note && (
                    <span title={ss.liturgical_note}>
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    </span>
                  )}

                  {ss.status === 'planned' && (
                    <form action={createWeekSession.bind(null, ss.id)}>
                      <button type="submit"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <Plus className="w-3 h-3" />Create
                      </button>
                    </form>
                  )}

                  {ss.session_id && (
                    <Link href={`/${churchSlug}/teaching/${ss.session_id}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <ExternalLink className="w-3 h-3" />Open
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            No weeks planned yet.
          </div>
        )}
      </div>
    </div>
  )
}