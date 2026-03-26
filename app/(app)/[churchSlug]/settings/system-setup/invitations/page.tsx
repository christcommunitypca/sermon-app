import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChevronLeft, MailPlus } from 'lucide-react'
import { Role } from '@/types/database'
import { SystemInviteForm } from '@/components/settings/SystemInviteForm'
import { createSystemInvitationAction, revokeSystemInvitationAction } from './actions'

interface Props { params: { churchSlug: string } }

type InviteBase = {
  id: string
  email: string
  status: string
  expires_at: string
  created_at: string
  assign_system_admin: boolean
}

type AssignmentRow = {
  invitation_id: string
  role: 'admin' | 'teacher'
  churches: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null
}

export default async function SystemInvitationsPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin.from('churches').select('id, name').eq('slug', churchSlug).single()
  if (!church) return notFound()

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()

  if (!member) redirect('/sign-in?error=not_a_member')

  const { data: globalAdmin } = await supabaseAdmin
    .from('global_admins')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const isSystemAdmin = !!globalAdmin
  if (!isSystemAdmin) redirect(`/${churchSlug}/settings/church-setup`)

  const [churchesResult, invitationsResult, assignmentsResult] = await Promise.all([
    supabaseAdmin.from('churches').select('id, name, slug').order('name'),
    supabaseAdmin
      .from('user_invitations')
      .select('id, email, status, expires_at, created_at, assign_system_admin')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('invitation_church_assignments')
      .select('invitation_id, role, churches(name, slug)'),
  ])

  const churches = churchesResult.data
  const invitations = invitationsResult.data
  const assignments = assignmentsResult.data as AssignmentRow[] | null

  const assignmentMap = new Map<string, AssignmentRow[]>()
  for (const row of assignments ?? []) {
    const arr = assignmentMap.get(row.invitation_id) ?? []
    arr.push(row)
    assignmentMap.set(row.invitation_id, arr)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/system-setup`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" />System Admin</Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">System Invitations</h1>
        <p className="text-sm text-slate-500 mt-1">Invite people into one or many churches in one pass, and optionally grant system-wide access.</p>
      </div>


      <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
        <form
          action={async (formData) => {
            'use server'
            let assignments: Array<{ churchId: string; role: 'admin' | 'teacher' }> = []
            try {
              const parsed = JSON.parse(String(formData.get('assignments') ?? '[]'))
              assignments = Array.isArray(parsed) ? parsed : []
            } catch {}
            await createSystemInvitationAction({
              churchSlug,
              email: String(formData.get('email') ?? ''),
              assignSystemAdmin: String(formData.get('assignSystemAdmin') ?? '') === 'on',
              assignments,
            })
          }}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2"><MailPlus className="w-4 h-4 text-slate-500" /><h2 className="font-semibold text-slate-900">Invite across churches</h2></div>
          <p className="text-sm text-slate-500">System admins can grant church access across multiple churches in a single invitation.</p>
          <SystemInviteForm churches={(churches ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))} />
          <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">Create invitation</button>
        </form>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Pending platform invites</h2>
              <p className="text-sm text-slate-500">These invitations may span multiple churches.</p>
            </div>
            <span className="text-sm text-slate-400">{invitations?.length ?? 0}</span>
          </div>
          <div className="space-y-3">
            {((invitations as InviteBase[] | null) ?? []).map(invite => {
              const inviteAssignments = assignmentMap.get(invite.id) ?? []
              return (
                <div key={invite.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{invite.email}</div>
                      <div className="text-sm text-slate-500 mt-1">{invite.assign_system_admin ? 'System Admin · ' : ''}expires {new Date(invite.expires_at).toLocaleDateString()}</div>
                    </div>
                    <form action={async () => { 'use server'; await revokeSystemInvitationAction({ invitationId: invite.id, churchSlug }) }}>
                      <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">Revoke</button>
                    </form>
                  </div>
                  {inviteAssignments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {inviteAssignments.map((row, index) => {
                        const churchInfo = Array.isArray(row.churches) ? row.churches[0] : row.churches
                        return (
                          <span key={index} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                            {churchInfo?.name ?? 'Church'} · {row.role === 'admin' ? 'Church Admin' : 'Church User'}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {!invitations?.length && <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl p-4">No pending platform invites.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}