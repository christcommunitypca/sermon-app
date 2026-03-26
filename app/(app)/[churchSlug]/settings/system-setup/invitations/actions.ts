'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createSystemInvitationAction(args: {
  churchSlug: string
  email: string
  assignSystemAdmin: boolean
  assignments: Array<{ churchId: string; role: 'admin' | 'teacher' }>
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.' }

  const { data: globalAdmin } = await supabaseAdmin
    .from('global_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!globalAdmin) return { error: 'Not allowed.' }

  const { churchSlug, email, assignSystemAdmin, assignments } = args
  const cleaned = assignments.filter(a => a.churchId && a.role)

  const { data: invitation, error } = await supabaseAdmin
    .from('user_invitations')
    .insert({
      email: email.trim().toLowerCase(),
      invited_by_user_id: user.id,
      assign_system_admin: assignSystemAdmin,
      metadata: { scope: 'system' },
    })
    .select('id')
    .single()

  if (error || !invitation) return { error: error?.message ?? 'Could not create invitation.' }

  if (cleaned.length) {
    await supabaseAdmin.from('invitation_church_assignments').insert(
      cleaned.map(row => ({ invitation_id: invitation.id, church_id: row.churchId, role: row.role }))
    )
  }

  revalidatePath(`/${churchSlug}/settings/system-setup`)
  revalidatePath(`/${churchSlug}/settings/system-setup/invitations`)
  revalidatePath(`/${churchSlug}/settings/system-setup/users`)
  return {}
}

export async function revokeSystemInvitationAction(args: {
  invitationId: string
  churchSlug: string
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.' }

  const { data: globalAdmin } = await supabaseAdmin
    .from('global_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!globalAdmin) return { error: 'Not allowed.' }

  const { error } = await supabaseAdmin
    .from('user_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', args.invitationId)

  if (error) return { error: error.message }

  revalidatePath(`/${args.churchSlug}/settings/system-setup/invitations`)
  return {}
}
