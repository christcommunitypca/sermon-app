import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSessionWithOutline, ensureOutline } from '@/lib/teaching'
import { SessionDetailActions } from '@/components/teaching/SessionDetailActions'
import { TeachingWorkspace } from '@/components/teaching/TeachingWorkspace'
import { SessionHeader } from '@/components/teaching/SessionHeader'
import { SessionStatus } from '@/types/database'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import {
  ChevronLeft,
  Presentation
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
  // If scripture_ref exists and is cached, load immediately — skip ESV API call
  let initialVerses = null
  if (session.scripture_ref) {
    try {
      const { data: cached } = await supabaseAdmin
        .from('scripture_cache')
        .select('passages')
        .eq('ref', session.scripture_ref.trim())
        .single()
      if (cached) initialVerses = cached.passages
    } catch { /* not cached yet — user will click Load Text */ }
  }

  let initialInsights: Record<string, Record<string, { title: string; content: string }[]>> = {}
  let initialVerseNotes: Record<string, import('@/types/database').VerseNote[]> = {}

  if (session.scripture_ref) {
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
    <div className="px-3 py-3">
      {/* Header — 3 col grid: back | session info center | actions */}
      <div className="flex items-center justify-between gap-3 mb-2">
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
            session.status === 'published' ? (
              <Link href={`/${churchSlug}/deliver/${sessionId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors">
                <Presentation className="w-3.5 h-3.5" />Deliver
              </Link>
            ) : session.status !== 'delivered' ? (
              <span title="Publish this session before delivering"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed select-none">
                <Presentation className="w-3.5 h-3.5" />Deliver
              </span>
            ) : null
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

      {/* ── Compact session header ────────────────────────────────────────── */}
      <SessionHeader
        title={session.title}
        type={session.type}
        scriptureRef={session.scripture_ref ?? null}
        scheduledDate={(session as any).scheduled_date ?? null}
        estimatedDuration={session.estimated_duration ?? null}
        status={session.status}
        notes={session.notes ?? null}
        visibility={(session as any).visibility ?? null}
        createdAt={session.created_at}
        isArchived={isArchived}
        editHref={`/${churchSlug}/teaching/${sessionId}/edit`}
        tagsHref={`/${churchSlug}/teaching/${sessionId}/tags`}
        historyHref={`/${churchSlug}/teaching/${sessionId}/history`}
      />

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
          initialMode={(session as any).teaching_mode ?? 'verse_by_verse'}
          estimatedDuration={session.estimated_duration ?? null}
          initialVerses={initialVerses}
          initialInsights={initialInsights}
          initialVerseNotes={initialVerseNotes}
          isPublished={session.status === 'published' || session.status === 'delivered'}
        />
      </div>
    </div>
  )
}
