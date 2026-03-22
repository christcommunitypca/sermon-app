'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowStep, SessionType } from '@/types/database'

function parseSteps(raw: FormDataEntryValue | null): FlowStep[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseRecommendedFor(raw: FormDataEntryValue | null): SessionType[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean) as SessionType[] : []
  } catch {
    return []
  }
}

export async function createFlowAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const churchId = formData.get('churchId') as string
  const churchSlug = formData.get('churchSlug') as string
  const steps = parseSteps(formData.get('steps'))
  const recommendedFor = parseRecommendedFor(formData.get('recommended_for'))

  const { data, error } = await supabaseAdmin
    .from('flows')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      name: (formData.get('name') as string).trim(),
      description: (formData.get('description') as string)?.trim() || null,
      explanation: (formData.get('explanation') as string)?.trim() || null,
      steps,
      recommended_for: recommendedFor,
      is_default_for: (formData.get('is_default_for') as SessionType) || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  redirect(`/${churchSlug}/flows/${data.id}`)
}

export async function updateFlowAction(
  flowId: string,
  churchSlug: string,
  updates: {
    name?: string
    description?: string | null
    explanation?: string | null
    steps?: FlowStep[]
    recommended_for?: SessionType[]
    is_default_for?: SessionType | null
  }
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const payload = {
    ...updates,
    name: updates.name?.trim(),
    description: updates.description?.trim() || null,
    explanation: updates.explanation?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .update(payload)
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/flows/${flowId}`)
  revalidatePath(`/${churchSlug}/flows`)
  return {}
}

export async function archiveFlowAction(
  flowId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ is_archived: true, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/flows`)
  return {}
}

export async function unarchiveFlowAction(
  flowId: string,
  churchSlug: string
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ is_archived: false, archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/${churchSlug}/flows`)
  return {}
}

export async function deleteFlowAction(flowId: string, churchId: string, churchSlug: string) {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('is_archived, teacher_id')
    .eq('id', flowId)
    .single()

  if (!flow || flow.teacher_id !== user.id) return
  if (!flow.is_archived) return

  await supabaseAdmin
    .from('flows')
    .delete()
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  redirect(`/${churchSlug}/flows`)
}
