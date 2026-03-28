import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowLibraryShell } from '@/components/flows/FlowLibraryShell'
import { FlowCreateForm } from '@/components/flows/FlowCreateForm'
import { listSystemFlowTemplates } from '@/lib/system-templates'

interface Props { params: { churchSlug: string } }

export default async function NewFlowPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user

  const { data: church } = await supabaseAdmin.from('churches').select('id').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const [flowsResult, systemTemplates] = await Promise.all([
    supabaseAdmin
      .from('flows')
      .select('*')
      .eq('church_id', church.id)
      .eq('teacher_id', user.id)
      .eq('is_archived', false)
      .order('name'),
    listSystemFlowTemplates(false),
  ])

  const templates = systemTemplates.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description,
    explanation: template.explanation,
    steps: template.steps.map((step, index) => ({
      id: step.id ?? `system-step-${index + 1}`,
      title: step.title,
      prompt_hint: step.prompt_hint ?? null,
      suggested_block_type: step.suggested_block_type ?? null,
    })),
    source: 'system' as const,
  }))

  return (
    <FlowLibraryShell churchSlug={churchSlug} flows={flowsResult.data ?? []} createHref={`/${churchSlug}/flows/new`}>
      <FlowCreateForm churchId={church.id} churchSlug={churchSlug} templates={templates} />
    </FlowLibraryShell>
  )
}
