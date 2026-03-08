import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getResearchItemsForSession, getUserTradition } from '@/lib/research'
import { ResearchWorkspace } from '@/components/research/ResearchWorkspace'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function ResearchPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

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

  const { data: aiKey } = await supabaseAdmin
    .from('user_ai_keys').select('validation_status').eq('user_id', user.id).single()
  const hasValidAIKey = aiKey?.validation_status === 'valid'

  const items = await getResearchItemsForSession(sessionId, user.id)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching/${sessionId}`}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />{session.title}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">Research</h1>
      <p className="text-sm text-slate-400 mb-8">
        AI-assisted tools to deepen your understanding. Results are saved and can be pushed to your outline.
      </p>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
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
