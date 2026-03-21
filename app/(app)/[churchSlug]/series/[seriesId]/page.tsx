import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSeriesWithSessions } from '@/lib/series'
import { ChevronLeft, BookOpen, Calendar, Plus } from 'lucide-react'
import { createSessionFromSeriesWeekAction } from '../actions'
import { backfillScheduledDateAction } from '../../teaching/actions'
import { SeriesWeekList } from '@/components/series/SeriesWeekList'

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

  // Backfill scheduled_date for any linked sessions that are missing it
  // This handles old data created before scheduled_date was tracked
  for (const ss of sessions) {
    const linked = (ss as any).teaching_sessions
    if (linked && !linked.scheduled_date && series.start_date) {
      const d = new Date(series.start_date + 'T00:00:00')
      d.setDate(d.getDate() + (ss.week_number - 1) * 7)
      const isoDate = d.toISOString().split('T')[0]
      await backfillScheduledDateAction(ss.session_id!, isoDate)
      // Patch local data so conflict detection sees the correct date this render
      linked.scheduled_date = isoDate
    }
  }

  async function createWeekSession(seriesSessionId: string): Promise<void> {
    'use server'
    await createSessionFromSeriesWeekAction(seriesSessionId, seriesId, '', churchSlug)
  }

  // Compute date range from start_date + total_weeks
  function computeWeekDate(weekNumber: number): string | null {
    if (!series.start_date) return null
    const d = new Date(series.start_date + 'T00:00:00')
    d.setDate(d.getDate() + (weekNumber - 1) * 7)
    return d.toISOString().split('T')[0]
  }

  const endDate = series.start_date && sessions.length > 0
    ? (() => {
        const maxWeek = Math.max(...sessions.map(s => s.week_number))
        const d = new Date(series.start_date + 'T00:00:00')
        d.setDate(d.getDate() + (maxWeek - 1) * 7)
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })()
    : null

  const startLabel = series.start_date
    ? new Date(series.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  // Auto-derive status from sessions — no manual status needed
  const deliveredCount = sessions.filter(s => s.status === 'delivered').length
  const createdCount   = sessions.filter(s => s.session_id).length
  const derivedStatus =
    series.status === 'archived'         ? 'archived' :
    deliveredCount === sessions.length   ? 'completed' :
    createdCount > 0                     ? 'active' :
    'planning'

  const statusStyle =
    derivedStatus === 'active'     ? 'bg-emerald-100 text-emerald-700' :
    derivedStatus === 'completed'  ? 'bg-blue-100 text-blue-700' :
    derivedStatus === 'archived'   ? 'bg-stone-100 text-stone-500' :
    'bg-slate-100 text-slate-500'

  const nextWeek = sessions.find(s => s.status !== 'delivered' && s.week_type === 'normal')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/series`}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Series
      </Link>

      {/* Series header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-xl font-bold text-slate-900">{series.title}</h1>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
            {derivedStatus}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
          {series.scripture_section && (
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />{series.scripture_section}
            </span>
          )}
          {series.total_weeks && <span>{series.total_weeks} weeks</span>}
          {startLabel && endDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {startLabel} — {endDate}
            </span>
          )}
          {startLabel && !endDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />{startLabel}
            </span>
          )}
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
            <Link href={`/${churchSlug}/teaching/${nextWeek.session_id}`}
              className="text-sm font-semibold text-blue-900 hover:text-blue-700 truncate block transition-colors">
              {(nextWeek as any).teaching_sessions?.title ?? nextWeek.proposed_title}
            </Link>
          </div>
          <Link href={`/${churchSlug}/teaching/${nextWeek.session_id}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0">
            Open
          </Link>
        </div>
      )}

      {/* Week list */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        {sessions.length} week{sessions.length !== 1 ? 's' : ''}
      </h2>

      <SeriesWeekList
        sessions={sessions as any}
        seriesId={seriesId}
        churchSlug={churchSlug}
        startDate={series.start_date ?? null}
        createWeekSession={createWeekSession}
      />
    </div>
  )
}
