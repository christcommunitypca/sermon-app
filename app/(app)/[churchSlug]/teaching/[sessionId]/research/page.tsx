import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getResearchItemsForSession } from '@/lib/research'
import { ResearchWorkspace } from '@/components/research/ResearchWorkspace'
import { hasValidKey } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function ResearchPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')
  const user = authSession.user

  const { data: church } = await supabaseAdmin
    .from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, scripture_ref, type, notes')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()
  if (!session) return notFound()

  const hasValidAIKey = await hasValidKey(user.id, getActiveProviderName())

  const items = await getResearchItemsForSession(sessionId, user.id)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/${churchSlug}/teaching/${sessionId}`}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="w-4 h-4" />{session.title}
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <ResearchWorkspace
          sessionId={sessionId}
          churchId={church.id}
          churchSlug={churchSlug}
          scriptureRef={session.scripture_ref}
          sessionTitle={session.title}
          hasValidAIKey={hasValidAIKey}
          initialItems={items}
        />
      </div>
    </div>
  )
}
