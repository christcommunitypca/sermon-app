import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SessionForm } from '@/components/teaching/SessionForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getEnabledChurchLessonTypes } from '@/lib/lesson-types'

interface Props { params: { churchSlug: string } }

export default async function NewSessionPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const [flowsResult, lessonTypes] = await Promise.all([
    supabaseAdmin.from('flows').select('*').eq('church_id', church.id).eq('teacher_id', user.id).order('name'),
    getEnabledChurchLessonTypes(church.id),
  ])

  const flows = flowsResult.data ?? []
  const firstType = lessonTypes[0]
  const defaultFlowId = firstType?.default_flow_id ?? undefined

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/teaching`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Teaching
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">New session</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <SessionForm
          churchId={church.id}
          churchSlug={churchSlug}
          flows={flows}
          lessonTypes={lessonTypes}
          selectedFlowId={defaultFlowId}
        />
      </div>
    </div>
  )
}
