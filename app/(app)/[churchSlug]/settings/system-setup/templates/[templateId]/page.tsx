import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SystemTemplateForm } from '@/components/settings/SystemTemplateForm'
import { getSystemFlowTemplate } from '@/lib/system-templates'
import { archiveSystemTemplateAction, updateSystemTemplateAction } from '../actions'

interface Props { params: { churchSlug: string; templateId: string } }

export default async function EditSystemTemplatePage({ params }: Props) {
  const { churchSlug, templateId } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()
  const { data: globalAdmin } = await supabaseAdmin.from('global_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!globalAdmin) redirect(`/${churchSlug}/settings/church-setup/flows`)
  const template = await getSystemFlowTemplate(templateId)
  if (!template) return notFound()
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/system-setup/templates`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" />System Flow Templates</Link>
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Edit System Template</h1>
          {!template.is_archived && <form action={archiveSystemTemplateAction.bind(null, templateId, churchSlug)}><button type="submit" className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">Archive</button></form>}
        </div>
        <SystemTemplateForm action={updateSystemTemplateAction.bind(null, templateId)} churchSlug={churchSlug} initialName={template.name} initialDescription={template.description ?? ''} initialExplanation={template.explanation ?? ''} initialSteps={template.steps ?? []} submitLabel="Save changes" />
      </div>
    </div>
  )
}
