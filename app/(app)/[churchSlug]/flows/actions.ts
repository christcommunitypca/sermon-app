'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Flow, FlowStep, Role, SessionType } from '@/types/database'
import { canManageSharedFlows, normalizeFlowScope } from '@/lib/flow-library'

async function getFlowContextForUser(flowId: string, userId: string) {
  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', flowId)
    .single()

  if (!flow) return { flow: null, role: null as Role | null }

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', flow.church_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  return {
    flow: flow as Flow,
    role: (member?.role as Role | undefined) ?? null,
  }
}

function canManageFlow(flow: Pick<Flow, 'owner_user_id'>, userId: string, role: Role | null) {
  if (flow.owner_user_id === null) return canManageSharedFlows(role)
  return flow.owner_user_id === userId
}

export async function createFlowAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) return redirect('/sign-in')

  const churchId = formData.get('churchId') as string
  const churchSlug = formData.get('churchSlug') as string
  const scope = normalizeFlowScope(formData.get('scope'))
  const stepsRaw = formData.get('steps') as string

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const role = (member?.role as Role | undefined) ?? null
  if (!role) return redirect('/sign-in?error=not_a_member')
  if (scope === 'church' && !canManageSharedFlows(role)) {
    return redirect(`/${churchSlug}/settings/my-setup/flows`)
  }

  let steps: FlowStep[] = []
  try {
    steps = JSON.parse(stepsRaw)
  } catch {}

  const { data, error } = await supabaseAdmin
    .from('flows')
    .insert({
      church_id: churchId,
      teacher_id: user.id,
      owner_user_id: scope === 'church' ? null : user.id,
      name: (formData.get('name') as string).trim(),
      description: (formData.get('description') as string)?.trim() || null,
      explanation: (formData.get('explanation') as string)?.trim() || null,
      steps,
      recommended_for: [],
      is_default_for: (formData.get('is_default_for') as SessionType) || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  const scopeQuery = `?scope=${scope}`
  revalidatePath(`/${churchSlug}/flows`)
  revalidatePath(`/${churchSlug}/settings/my-setup/flows`)
  revalidatePath(`/${churchSlug}/settings/church-setup/flows`)
  redirect(`/${churchSlug}/flows/${data.id}${scopeQuery}`)
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

  const { flow, role } = await getFlowContextForUser(flowId, user.id)
  if (!flow || !canManageFlow(flow, user.id, role)) {
    return { error: 'You do not have permission to edit this flow.' }
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', flowId)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/flows/${flowId}`)
  revalidatePath(`/${churchSlug}/flows`)
  revalidatePath(`/${churchSlug}/settings/my-setup/flows`)
  revalidatePath(`/${churchSlug}/settings/church-setup/flows`)
  return {}
}

export async function archiveFlowAction(flowId: string, churchSlug: string): Promise<{ error?: string; scope?: 'personal' | 'church' }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { flow, role } = await getFlowContextForUser(flowId, user.id)
  if (!flow || !canManageFlow(flow, user.id, role)) {
    return { error: 'You do not have permission to archive this flow.' }
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ is_archived: true, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', flowId)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/flows`)
  revalidatePath(`/${churchSlug}/settings/my-setup/flows`)
  revalidatePath(`/${churchSlug}/settings/church-setup/flows`)
  return { scope: flow.owner_user_id === null ? 'church' : 'personal' }
}

export async function unarchiveFlowAction(flowId: string, churchSlug: string): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { flow, role } = await getFlowContextForUser(flowId, user.id)
  if (!flow || !canManageFlow(flow, user.id, role)) {
    return { error: 'You do not have permission to restore this flow.' }
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ is_archived: false, archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', flowId)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/flows`)
  revalidatePath(`/${churchSlug}/settings/my-setup/flows`)
  revalidatePath(`/${churchSlug}/settings/church-setup/flows`)
  return {}
}

export async function deleteFlowAction(flowId: string, churchSlug: string): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh the page.' }

  const { flow, role } = await getFlowContextForUser(flowId, user.id)
  if (!flow || !canManageFlow(flow, user.id, role)) {
    return { error: 'You do not have permission to delete this flow.' }
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .delete()
    .eq('id', flowId)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/flows`)
  revalidatePath(`/${churchSlug}/settings/my-setup/flows`)
  revalidatePath(`/${churchSlug}/settings/church-setup/flows`)
  return {}
}
