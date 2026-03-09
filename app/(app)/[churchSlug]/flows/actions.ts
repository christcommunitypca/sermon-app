'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowBlock, SessionType } from '@/types/database'

export async function createFlowAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const churchId = formData.get('churchId') as string
  const churchSlug = formData.get('churchSlug') as string
  const structureRaw = formData.get('structure') as string

  let structure: FlowBlock[] = []
  try {
    structure = JSON.parse(structureRaw)
  } catch {}

  const { data, error } = await supabaseAdmin
    .from('flows')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      name: (formData.get('name') as string).trim(),
      description: (formData.get('description') as string)?.trim() || null,
      structure,
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
    structure?: FlowBlock[]
    is_default_for?: SessionType | null
  }
): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ ...updates, updated_at: new Date().toISOString() })
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

  // Verify flow is archived before allowing deletion
  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('is_archived, teacher_id')
    .eq('id', flowId)
    .single()

  if (!flow || flow.teacher_id !== user.id) return
  if (!flow.is_archived) return  // silent guard — UI should only call this on archived flows

  await supabaseAdmin
    .from('flows')
    .delete()
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  redirect(`/${churchSlug}/flows`)
}
