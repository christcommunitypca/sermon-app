'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

function safeJsonArray<T>(value: string): T[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
async function requireSystemAdmin(userId: string) { const { data } = await supabaseAdmin.from('global_admins').select('user_id').eq('user_id', userId).maybeSingle(); return !!data }

export async function createSystemTemplateAction(formData: FormData): Promise<void> {
  const user = await getActionUser(); if (!user || !(await requireSystemAdmin(user.id))) return
  const churchSlug = String(formData.get('churchSlug') ?? '')
  await supabaseAdmin.from('system_flow_templates').insert({
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim() || null,
    explanation: String(formData.get('explanation') ?? '').trim() || null,
    steps: safeJsonArray(formData.get('steps') as string),
    recommended_for: [],
    is_archived: false,
    created_by_user_id: user.id,
  })
  revalidatePath(`/${churchSlug}/settings/system-setup/templates`)
}

export async function updateSystemTemplateAction(templateId: string, formData: FormData): Promise<void> {
  const user = await getActionUser(); if (!user || !(await requireSystemAdmin(user.id))) return
  const churchSlug = String(formData.get('churchSlug') ?? '')
  await supabaseAdmin.from('system_flow_templates').update({
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim() || null,
    explanation: String(formData.get('explanation') ?? '').trim() || null,
    steps: safeJsonArray(formData.get('steps') as string),
    updated_at: new Date().toISOString(),
  }).eq('id', templateId)
  revalidatePath(`/${churchSlug}/settings/system-setup/templates`)
  revalidatePath(`/${churchSlug}/settings/system-setup/templates/${templateId}`)
}

export async function archiveSystemTemplateAction(templateId: string, churchSlug: string): Promise<void> {
  const user = await getActionUser(); if (!user || !(await requireSystemAdmin(user.id))) return
  await supabaseAdmin.from('system_flow_templates').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('id', templateId)
  revalidatePath(`/${churchSlug}/settings/system-setup/templates`)
}
