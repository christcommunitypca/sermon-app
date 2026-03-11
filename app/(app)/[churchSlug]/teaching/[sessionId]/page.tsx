import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSessionWithOutline, ensureOutline } from '@/lib/teaching'
import { SessionDetailActions } from '@/components/teaching/SessionDetailActions'
import { TeachingWorkspace } from '@/components/teaching/TeachingWorkspace'
import { SessionStatus } from '@/types/database'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { fetchPassage } from '@/lib/esv'
import {
  ChevronLeft, Edit, Tag, Clock, FileText,
  Presentation, FlaskConical
} from 'lucide-react'
import { updateSessionStatusAction } from '../actions'
import type { TeachingMode } from '@/components/teaching/TeachingWorkspace'

interface Props { params: { churchSlug: string; sessionId: string } }

const STATUS_NEXT: Partial<Record<SessionStatus, { label: string; next: SessionStatus }>> = {
  draft: { label: 'Publish', next: 'published' },
  published: { label: 'Mark delivered', next: 'delivered' },
}

export default async function SessionDetailPage({ params }: Props) {
  const { churchSlug, sessionId } = params

  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')
  const user = authSession.user

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const data = await getSessionWithOutline(sessionId, user.id)
  if (!data) return notFound()

  const { session, blocks } = data
  let { outline } = data
  if (!outline) outline = await ensureOutline(sessionId, church.id)

  const hasValidAIKey = await hasValidKey(user.id, getActiveProviderName())

  const { data: flows } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', church.id)
    .eq('teacher_id', user.id)
    .eq('is_archived', false)

  const matchingFlow = flows?.find(f => f.is_default_for === session.type)
  const nextStatus = STATUS_NEXT[session.status as SessionStatus]
  const isArchived = session.status === 'archived'

  // Pre-load verse data server-side for fast initial render
  let initialVerses = null
  let initialInsights: Record<string, Record<string, { title: string; content: string }[]>> = {}
  let initialVerseNotes: Record<string, import('@/types/database').VerseNote[]> = {}

  if (session.scripture_ref) {
    try {
      initialVerses = await fetchPassage(session.scripture_ref)
    } catch {
      // ESV key not set or network issue — client handles gracefully
    }

    const [{ data: insightRows }, { data: noteRows }] = await Promise.all([
      supabaseAdmin
        .from('verse_insights')
        .select('verse_ref, category, items')
        .eq('session_id', sessionId)
        .eq('teacher_id', user.id),
      supabaseAdmin
        .from('verse_notes')
        .select('*')
        .eq('session_id', sessionId)
        .eq('teacher_id', user.id)
        .order('verse_ref')
        .order('position'),
    ])

    for (const row of insightRows ?? []) {
      if (!initialInsights[row.verse_ref]) initialInsights[row.verse_ref] = {}
      initialInsights[row.verse_ref][row.category] = row.items as { title: string; content: string }[]
    }
    for (const row of noteRows ?? []) {
      if (!initialVerseNotes[row.verse_ref]) initialVerseNotes[row.verse_ref] = []
      initialVerseNotes[row.verse_ref].push(row as import('@/types/database').VerseNote)
    }
  }

  const initialMode: TeachingMode = (session as any).teaching_mode ?? 'verse_by_verse'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/${churchSlug}/teaching`}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="w-4 h-4" />Teaching
        </Link>
        <div className="flex items-center gap-2">
          {nextStatus && !isArchived && (
            <form action={updateSessionStatusAction.bind(null, sessionId, church.id, churchSlug, nextStatus.next)}>
              <button type="submit"
                className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                {nextStatus.label}
              </button>
            </form>
          )}
          {!isArchived && (
            <Link href={`/${churchSlug}/deliver/${sessionId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors">
              <Presentation className="w-3.5 h-3.5" />Deliver
            </Link>
          )}
          <SessionDetailActions sessionId={sessionId} churchId={church.id} churchSlug={churchSlug} isArchived={isArchived} />
        </div>
      </div>

      {isArchived && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-600">
          <span>This session is archived.</span>
          <span className="text-stone-400">It won't appear in your active session list.</span>
        </div>
      )}

      {/* Session info card */}
      <div className={`bg-white border rounded-2xl p-6 mb-6 ${isArchived ? 'border-stone-200 opacity-80' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{session.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{session.type.replace('_', ' ')}</span>
              {session.scripture_ref && <span>· {session.scripture_ref}</span>}
              {session.estimated_duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />{session.estimated_duration}m
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                session.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                session.status === 'published' ? 'bg-blue-100 text-blue-700' :
                session.status === 'archived' ? 'bg-stone-100 text-stone-500' :
                'bg-slate-100 text-slate-600'
              }`}>{session.status}</span>
            </div>
            {session.notes && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{session.notes}</p>
            )}
          </div>
          {!isArchived && (
            <Link href={`/${churchSlug}/teaching/${sessionId}/edit`}
              className="shrink-0 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <Edit className="w-4 h-4" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1 mt-5 pt-4 border-t border-slate-100 overflow-x-auto">
          {[
            { href: `/${churchSlug}/teaching/${sessionId}/research`, label: 'Research', icon: FlaskConical },
            { href: `/${churchSlug}/teaching/${sessionId}/thoughts`, label: 'Thoughts', icon: FileText },
            { href: `/${churchSlug}/teaching/${sessionId}/tags`, label: 'Tags', icon: Tag },
            { href: `/${churchSlug}/teaching/${sessionId}/history`, label: 'History', icon: Clock },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0">
              <Icon className="w-3.5 h-3.5" />{label}
            </Link>
          ))}
        </div>
      </div>

      {/* Teaching workspace */}
      <div className={isArchived ? 'opacity-70 pointer-events-none' : ''}>
        <TeachingWorkspace
          sessionId={sessionId}
          churchId={church.id}
          churchSlug={churchSlug}
          outlineId={outline.id}
          initialBlocks={blocks}
          flowStructure={matchingFlow?.structure}
          hasValidAIKey={hasValidAIKey}
          scriptureRef={session.scripture_ref ?? null}
          initialMode={initialMode}
          estimatedDuration={session.estimated_duration ?? null}
          initialVerses={initialVerses}
          initialInsights={initialInsights}
          initialVerseNotes={initialVerseNotes}
        />
      </div>
    </div>
  )
}