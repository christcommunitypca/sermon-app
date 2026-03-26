import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChevronLeft, MailPlus } from 'lucide-react'
import { Role } from '@/types/database'
import { ChurchInviteForm } from '@/components/settings/ChurchInviteForm'
import { createChurchInvitationAction, revokeInvitationAction } from './actions'

interface Props { params: { churchSlug: string } }

type InviteRow = {
  id: string
  email: string
  status: string
  expires_at: string
  created_at: string
  assign_system_admin: boolean
  invitation_church_assignments: Array<{ role: 'admin' | 'teacher' }> | null
}

export default async function ChurchInvitationsPage({ params }: Props) {
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
  if (!(member.role === 'owner' || member.role === 'admin')) redirect(`/${churchSlug}/settings/my-setup`)

  const { data: globalAdmin } = await supabaseAdmin.from('global_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
  const isSystemAdmin = !!globalAdmin

  const { data: invites } = await supabaseAdmin
    .from('user_invitations')
    .select('id, email, status, expires_at, created_at, assign_system_admin, invitation_church_assignments(role)')
    .eq('church_id', church.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false }) as { data: InviteRow[] | null }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/church-setup`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" />Church Defaults</Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Church Invitations</h1>
        <p className="text-sm text-slate-500 mt-1">Invite someone into this church only. Church admins can grant Church Admin or Church User access here.</p>
      </div>


      <div className="grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
        <form
          action={async (formData) => {
            'use server'
            await createChurchInvitationAction({
              churchId: church.id,
              churchSlug,
              email: String(formData.get('email') ?? ''),
              role: String(formData.get('role') ?? 'teacher') as 'admin' | 'teacher',
            })
          }}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2"><MailPlus className="w-4 h-4 text-slate-500" /><h2 className="font-semibold text-slate-900">Invite into {church.name}</h2></div>
          <p className="text-sm text-slate-500">This invitation only grants access to the current church.</p>
          <ChurchInviteForm />
          <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">Send invite</button>
        </form>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Pending invites</h2>
              <p className="text-sm text-slate-500">Church-scoped invitations waiting to be accepted.</p>
            </div>
            <span className="text-sm text-slate-400">{invites?.length ?? 0}</span>
          </div>
          <div className="space-y-3">
            {(invites ?? []).map(invite => {
              const role = invite.invitation_church_assignments?.[0]?.role ?? 'teacher'
              return (
                <div key={invite.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{invite.email}</div>
                      <div className="text-sm text-slate-500 mt-1">{role === 'admin' ? 'Church Admin' : 'Church User'} · expires {new Date(invite.expires_at).toLocaleDateString()}</div>
                    </div>
                    <form action={async () => { 'use server'; await revokeInvitationAction({ invitationId: invite.id, churchId: church.id, churchSlug }) }}>
                      <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">Revoke</button>
                    </form>
                  </div>
                </div>
              )
            })}
            {!invites?.length && <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl p-4">No pending church invites.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}