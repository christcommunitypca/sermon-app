import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChevronLeft } from 'lucide-react'
import { FlowCreateForm } from '@/components/flows/FlowCreateForm'

interface Props { params: { churchSlug: string } }

export default async function NewFlowPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Flows
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New flow</h1>
        <p className="text-sm text-slate-500 mt-1">Build a reusable sermon movement you can attach to future lessons.</p>
      </div>
      <FlowCreateForm churchId={church.id} churchSlug={churchSlug} />
    </div>
  )
}
