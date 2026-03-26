'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { FlowStep } from '@/types/database'

export async function createSystemTemplateAction(formData: FormData) {
  const user = await getActionUser()
  if (!user) redirect('/sign-in')

  const churchSlug = formData.get('churchSlug') as string
  const name = String(formData.get('name') || '').trim()
  const description = String(formData.get('description') || '').trim() || null
  const explanation = String(formData.get('explanation') || '').trim() || null
  const stepsRaw = String(formData.get('steps') || '[]')

  let steps: FlowStep[] = []
  try {
    steps = JSON.parse(stepsRaw)
  } catch {
    steps = []
  }

  if (!name) redirect(`/${churchSlug}/settings/system-setup/templates/new?error=name`)

  const { error } = await supabaseAdmin.from('flows').insert({
    church_id: null,
    teacher_id: user.id,
    owner_user_id: null,
    name,
    description,
    explanation,
    steps,
    recommended_for: [],
    is_default_for: null,
    is_archived: false,
  })

  if (error) redirect(`/${churchSlug}/settings/system-setup/templates/new?error=create`)

  revalidatePath(`/${churchSlug}/settings/system-setup/templates`)
  redirect(`/${churchSlug}/settings/system-setup/templates`)
}
