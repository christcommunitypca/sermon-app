import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ArrowRight, Building2, Shield, Sparkles } from 'lucide-react'

interface Props { params: { token: string } }

type Invite = {
  id: string
  email: string
  status: string
  expires_at: string
  assign_system_admin: boolean
}

type Assignment = {
  church_id: string
  role: 'owner' | 'admin' | 'teacher'
  churches: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null
}

export default async function AcceptInvitationPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { data: invitation } = await supabaseAdmin
    .from('user_invitations')
    .select('id, email, status, expires_at, assign_system_admin')
    .eq('token', params.token)
    .maybeSingle() as { data: Invite | null }

  if (!invitation || invitation.status !== 'pending') return notFound()

  const { data: assignments } = await supabaseAdmin
    .from('invitation_church_assignments')
    .select('church_id, role, churches(name, slug)')
    .eq('invitation_id', invitation.id) as { data: Assignment[] | null }

  async function acceptInvite() {
    'use server'
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) redirect(`/sign-in?next=/invitations/${params.token}`)
    if (!invitation) return notFound()

    if (invitation.assign_system_admin) {
      await supabaseAdmin.from('global_admins').upsert({ user_id: session.user.id })
    }

    for (const row of assignments ?? []) {
      await supabaseAdmin.from('church_members').upsert({
        church_id: row.church_id,
        user_id: session.user.id,
        role: row.role,
        is_active: true,
      }, { onConflict: 'church_id,user_id' })
    }

    await supabaseAdmin
      .from('user_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)

    const firstAssignment = assignments?.[0]
    const churchInfo = firstAssignment ? (Array.isArray(firstAssignment.churches) ? firstAssignment.churches[0] : firstAssignment.churches) : null
    redirect(churchInfo?.slug ? `/${churchInfo.slug}/settings/my-setup` : '/')
  }

  const firstChurch = assignments?.[0] ? (Array.isArray(assignments[0].churches) ? assignments[0].churches[0] : assignments[0].churches) : null

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-3xl p-8">
        <div className="text-sm uppercase tracking-[0.16em] text-slate-400 font-semibold">Invitation</div>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">You were invited to join the platform</h1>
        <p className="text-sm text-slate-500 mt-2">This invitation is for <span className="font-medium text-slate-900">{invitation.email}</span> and expires on {new Date(invitation.expires_at).toLocaleDateString()}.</p>

        <section className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-slate-600 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">What will happen when you accept</h2>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>• Your access will be added automatically.</li>
                <li>• You will land in <span className="font-medium text-slate-900">My Prep</span> so you can start with your own setup first.</li>
                <li>• If you were invited to multiple churches, you can switch churches from the app navigation afterward.</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-3">
          {(assignments ?? []).map((row, index) => {
            const churchInfo = Array.isArray(row.churches) ? row.churches[0] : row.churches
            return (
              <div key={index} className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 font-medium text-slate-900"><Building2 className="w-4 h-4 text-slate-400" />{churchInfo?.name ?? row.church_id}</div>
                <div className="text-sm text-slate-500 mt-1">{row.role === 'admin' || row.role === 'owner' ? 'Church Admin' : 'Church User'}</div>
              </div>
            )
          })}
          {invitation.assign_system_admin && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900 flex items-start gap-2"><Shield className="w-4 h-4 mt-0.5" />This invitation also grants System Admin access.</div>
          )}
        </div>

        {firstChurch?.slug && (
          <div className="mt-6 text-sm text-slate-500">
            Your first stop after accepting will be <span className="font-medium text-slate-900">{firstChurch.name}</span> <ArrowRight className="w-4 h-4 inline-block mx-1 text-slate-400" /> <span className="font-medium text-slate-900">My Prep</span>.
          </div>
        )}

        {!session ? (
          <a href={`/sign-in?next=/invitations/${params.token}`} className="inline-flex mt-6 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">Sign in to accept</a>
        ) : (
          <form action={acceptInvite} className="mt-6">
            <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">Accept and go to My Prep</button>
          </form>
        )}
      </div>
    </div>
  )
}
