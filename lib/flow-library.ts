import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Flow, Role, SessionType } from '@/types/database'
import { groupFlowsForSessionType } from '@/lib/flow-groups'

export async function listAccessibleFlows(churchId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', churchId)
    .eq('is_archived', false)
    .or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
    .order('updated_at', { ascending: false })

  return (data ?? []) as Flow[]
}

export async function getFlowGroupsForUser(args: { churchId: string; userId: string; sessionType: SessionType }) {
  const flows = await listAccessibleFlows(args.churchId, args.userId)
  return {
    flows,
    groups: groupFlowsForSessionType(flows, args.sessionType, args.userId),
  }
}

export async function listSharedFlows(churchId: string) {
  const { data } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', churchId)
    .is('owner_user_id', null)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  return (data ?? []) as Flow[]
}

export async function listPersonalFlows(churchId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('church_id', churchId)
    .eq('owner_user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  return (data ?? []) as Flow[]
}

export async function getMemberRole(churchId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', churchId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  return (data?.role as Role | undefined) ?? null
}

export function canManageSharedFlows(role: Role | null) {
  return role === 'owner' || role === 'admin'
}
