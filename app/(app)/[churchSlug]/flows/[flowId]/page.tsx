import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowEditor } from '@/components/flows/FlowEditor'
import { ChevronLeft } from 'lucide-react'

interface Props { params: { churchSlug: string; flowId: string } }

export default async function FlowDetailPage({ params }: Props) {
  const { churchSlug, flowId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: flow } = await supabaseAdmin
    .from('flows').select('*').eq('id', flowId).eq('teacher_id', user.id).single()
  if (!flow) return notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Flows
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">{flow.name}</h1>
      <FlowEditor
        flowId={flow.id}
        churchSlug={churchSlug}
        initialName={flow.name}
        initialDescription={flow.description}
        initialStructure={flow.structure ?? []}
        initialDefaultFor={flow.is_default_for}
      />
    </div>
  )
}
