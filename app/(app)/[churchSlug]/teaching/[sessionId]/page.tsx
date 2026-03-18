import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSessionWithOutline, ensureOutline } from '@/lib/teaching'
import { SessionDetailActions } from '@/components/teaching/SessionDetailActions'
import { TeachingWorkspace } from '@/components/teaching/TeachingWorkspace'
import { PageStepIndicator } from '@/components/teaching/PageStepIndicator'
import { SessionHeader } from '@/components/teaching/SessionHeader'
import { SessionStatus } from '@/types/database'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import {
  ChevronLeft,
  Presentation
} from 'lucide-react'
import { updateSessionStatusAction } from '../actions'
import { fetchPassageWithHeaders } from '@/lib/esv'
import type { TeachingMode } from '@/components/teaching/TeachingWorkspace'

interface Props { params: { churchSlug: string; sessionId: string }}

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

  // Fetch pericope section headers (for narrative passages)
  let initialPericSections: Array<{label: string; startVerse: string}> = []
  let initialHasSectionHeaders = false
  let initialPericopeSetupComplete = false

  // Check if session has user-saved sections first
  const savedSections = (session as any).pericope_sections as Array<{label:string;startVerse:string}> | null
  if (savedSections?.length) {
    initialPericSections    = savedSections
    initialHasSectionHeaders = true
    initialPericopeSetupComplete = true
  } else if (session.scripture_ref) {
    try {
      const { sections } = await fetchPassageWithHeaders(session.scripture_ref)
      initialPericSections    = sections
      initialHasSectionHeaders = sections.length > 0
    } catch { /* non-fatal — pericope detection best-effort */ }
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

  const rawTeachingMode = (session as any).teaching_mode
  const rawStudyMode = (session as any).study_mode
  
  const initialMode: TeachingMode =
    rawTeachingMode === 'outline' ? 'outline' : 'verse_by_verse'
  
  const initialStudyMode: 'vbv' | 'pericope' =
    rawStudyMode === 'pericope' ? 'pericope' : 'vbv'

  // Step indicator state (server-computed for page header)
  const stepHasVerses   = !!initialVerses?.length
  const stepHasNotes    = Object.values(initialVerseNotes).some(arr => arr.some((n: any) => n.content?.trim()))
  const stepHasResearch = Object.keys(initialInsights).length > 0
  const stepHasBlocks   = blocks.length > 0
  const stepIsPublished = session.status === 'published' || session.status === 'delivered'

  return (
    <div className="px-4 py-3">
      {/* Header — 3-col: back link | step indicator centered | actions */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-2">
        <Link href={`/${churchSlug}/teaching`}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="w-4 h-4" />Teaching
        </Link>
        <div className="flex justify-center">
          <PageStepIndicator
            hasVerses={stepHasVerses}
            hasNotes={stepHasNotes}
            hasResearch={stepHasResearch}
            hasBlocks={stepHasBlocks}
            isPublished={stepIsPublished}
          />
        </div>
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
          initialMode={initialMode}
          initialStudyMode={initialStudyMode}
          estimatedDuration={session.estimated_duration ?? null}
          initialVerses={initialVerses}
          initialInsights={initialInsights}
          initialVerseNotes={initialVerseNotes}
          isPublished={session.status === 'published' || session.status === 'delivered'}
          sessionTitle={session.title}
          scheduledDate={(session as any).scheduled_date ?? null}
          initialPericSections={initialPericSections}
          initialHasSectionHeaders={initialHasSectionHeaders}
          initialPericopeSetupComplete={initialPericopeSetupComplete}
        />
      </div>
    </div>
  )
}
