'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FlowBlock, SessionType } from '@/types/database'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')
  return user!
}

export async function createFlowAction(formData: FormData) {
  const user = await getAuthUser()

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
    description?: string
    structure?: FlowBlock[]
    is_default_for?: SessionType | null
  }
): Promise<{ error?: string }> {
  const user = await getAuthUser()

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

export async function deleteFlowAction(flowId: string, churchId: string, churchSlug: string) {
  const user = await getAuthUser()

  await supabaseAdmin
    .from('flows')
    .delete()
    .eq('id', flowId)
    .eq('teacher_id', user.id)

  redirect(`/${churchSlug}/flows`)
}
