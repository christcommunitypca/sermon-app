import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getThoughtsForSession } from '@/lib/teaching'
import { ThoughtCapture } from '@/components/teaching/ThoughtCapture'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function ThoughtsPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: teachingSession } = await supabaseAdmin
    .from('teaching_sessions').select('title').eq('id', sessionId).eq('teacher_id', user.id).single()
  if (!teachingSession) return notFound()

  const thoughts = await getThoughtsForSession(sessionId)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching/${sessionId}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />{teachingSession.title}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Thought captures</h1>
      <ThoughtCapture
        sessionId={sessionId}
        churchId={church.id}
        churchSlug={churchSlug}
        initialThoughts={thoughts}
      />
    </div>
  )
}
