import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SessionForm } from '@/components/teaching/SessionForm'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; sessionId: string } }

export default async function EditSessionPage({ params }: Props) {
  const { churchSlug, sessionId } = params
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()
  if (!authSession) redirect('/sign-in')
  const user = authSession.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single()
  if (!session) return notFound()

  const { data: flows } = await supabaseAdmin.from('flows').select('*').eq('church_id', church.id).eq('teacher_id', user.id).order('name')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching/${sessionId}`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />{session.title}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Edit session</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <SessionForm churchId={church.id} churchSlug={churchSlug} session={session} flows={flows ?? []} />
      </div>
    </div>
  )
}
