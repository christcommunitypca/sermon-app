'use server'

import { getActionUser } from '@/lib/supabase/auth-context'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createChurchInvitationAction(args: {
  churchId: string
  churchSlug: string
  email: string
  role: 'admin' | 'teacher'
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.' }

  const { churchId, churchSlug, email, role } = args

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member || !['owner', 'admin'].includes(member.role)) return { error: 'Not allowed.' }

  const { data: invitation, error } = await supabaseAdmin
    .from('user_invitations')
    .insert({
      email: email.trim().toLowerCase(),
      invited_by_user_id: user.id,
      church_id: churchId,
      target_role: role,
      metadata: { scope: 'church' },
    })
    .select('id')
    .single()

  if (error || !invitation) return { error: error?.message ?? 'Could not create invitation.' }

  await supabaseAdmin
    .from('invitation_church_assignments')
    .insert({ invitation_id: invitation.id, church_id: churchId, role })

  revalidatePath(`/${churchSlug}/settings/church-setup`)
  revalidatePath(`/${churchSlug}/settings/church-setup/users`)
  revalidatePath(`/${churchSlug}/settings/church-setup/invitations`)
  return {}
}

export async function revokeInvitationAction(args: {
  invitationId: string
  churchId: string
  churchSlug: string
}): Promise<{ error?: string }> {
  const user = await getActionUser()
  if (!user) return { error: 'Session expired — please refresh.' }

  const { churchId, churchSlug, invitationId } = args

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member || !['owner', 'admin'].includes(member.role)) return { error: 'Not allowed.' }

  const { error } = await supabaseAdmin
    .from('user_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', invitationId)

  if (error) return { error: error.message }

  revalidatePath(`/${churchSlug}/settings/church-setup/invitations`)
  return {}
}
