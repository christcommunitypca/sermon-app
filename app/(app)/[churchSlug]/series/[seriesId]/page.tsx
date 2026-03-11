import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSeriesWithSessions } from '@/lib/series'
import { ChevronLeft, BookOpen, Calendar, ExternalLink, Plus } from 'lucide-react'
import { createSessionFromSeriesWeekAction, insertGapAfterWeekAction } from '../actions'
import { SeriesWeekExpander } from '@/components/series/SeriesWeekExpander'

interface Props { params: { churchSlug: string; seriesId: string } }

export default async function SeriesDetailPage({ params }: Props) {
  const { churchSlug, seriesId } = params
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')
  const user = authSession.user

  const data = await getSeriesWithSessions(seriesId, user.id)
  if (!data) return notFound()

  const { series, sessions } = data

  async function createWeekSession(seriesSessionId: string): Promise<void> {
    'use server'
    // createSessionFromSeriesWeekAction now calls redirect() internally
    await createSessionFromSeriesWeekAction(seriesSessionId, seriesId, '', churchSlug)
  }

  const nextWeek = sessions.find(s => s.status !== 'delivered')

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
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <h1 className="text-xl font-bold text-slate-900 mb-2">{series.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
          {series.scripture_section && (
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />{series.scripture_section}
            </span>
          )}
          {series.total_weeks && <span>{series.total_weeks} weeks</span>}
          {startLabel && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />{startLabel}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            series.status === 'active'    ? 'bg-emerald-100 text-emerald-700' :
            series.status === 'completed' ? 'bg-blue-100 text-blue-700' :
            series.status === 'archived'  ? 'bg-stone-100 text-stone-500' :
            'bg-slate-100 text-slate-600'
          }`}>{series.status}</span>
        </div>
        {series.description && (
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{series.description}</p>
        )}
      </div>

      {/* Next up banner */}
      {nextWeek?.status === 'planned' && (
        <div className="mb-5 px-4 py-3.5 bg-violet-50 border border-violet-200 rounded-xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-violet-600 font-medium mb-0.5">Next up — Week {nextWeek.week_number}</p>
            <p className="text-sm font-semibold text-violet-900 truncate">{nextWeek.proposed_title}</p>
            {nextWeek.proposed_scripture && (
              <p className="text-xs text-violet-600 mt-0.5">{nextWeek.proposed_scripture}</p>
            )}
          </div>
          <form action={createWeekSession.bind(null, nextWeek.id)} className="shrink-0">
            <button type="submit"
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />Create session
            </button>
          </form>
        </div>
      )}

      {nextWeek?.status === 'created' && nextWeek.session_id && (
        <div className="mb-5 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-blue-600 font-medium mb-0.5">In progress — Week {nextWeek.week_number}</p>
            <p className="text-sm font-semibold text-blue-900 truncate">
              {(nextWeek as any).teaching_sessions?.title ?? nextWeek.proposed_title}
            </p>
          </div>
          <Link href={`/${churchSlug}/teaching/${nextWeek.session_id}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />Open
          </Link>
        </div>
      )}

      {/* Week list */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        {sessions.length} week{sessions.length !== 1 ? 's' : ''}
      </h2>

      <div className="space-y-2">
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
            <SeriesWeekExpander
              key={ss.id}
              ss={ss}
              linkedSession={linkedSession}
              weekDate={weekDate}
              churchSlug={churchSlug}
              seriesId={seriesId}
              createWeekSession={createWeekSession}
            />
          )
        })}

        {sessions.length === 0 && (
          <p className="text-center py-10 text-slate-400 text-sm">No weeks planned yet.</p>
        )}
      </div>
    </div>
  )
}