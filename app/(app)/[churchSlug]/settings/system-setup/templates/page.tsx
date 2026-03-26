import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { listSystemFlowTemplates } from '@/lib/system-templates'

interface Props { params: { churchSlug: string } }

export default async function SystemTemplatesPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()
  const { data: globalAdmin } = await supabaseAdmin.from('global_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!globalAdmin) redirect(`/${churchSlug}/settings/church-setup/flows`)
  const templates = await listSystemFlowTemplates(true)
  const active = templates.filter(t => !t.is_archived)
  const archived = templates.filter(t => t.is_archived)
  const renderCard = (template: (typeof templates)[number], muted = false) => (
    <Link key={template.id} href={`/${churchSlug}/settings/system-setup/templates/${template.id}`} className={`block border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors ${muted ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
      <div className="font-medium text-slate-900">{template.name}</div>
      {template.description && <div className="text-sm text-slate-500 mt-1">{template.description}</div>}
      {!!template.steps?.length && <div className="flex flex-wrap gap-1.5 mt-3">{template.steps.slice(0,5).map((step,index)=><span key={step.id ?? index} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{step.title}</span>)}</div>}
    </Link>
  )
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/system-setup/users`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" />System Setup</Link>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold text-slate-900">System Flow Templates</h1><p className="text-sm text-slate-500 mt-1">Manage the starter flow templates churches can copy and adapt.</p></div>
        <Link href={`/${churchSlug}/settings/system-setup/templates/new`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"><Plus className="w-4 h-4" />Create Template</Link>
      </div>
      <div className="space-y-3">{active.map(t => renderCard(t))}</div>
      {archived.length > 0 && <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Archived templates ({archived.length})</summary><div className="mt-3 space-y-3">{archived.map(t => renderCard(t, true))}</div></details>}
    </div>
  )
}
