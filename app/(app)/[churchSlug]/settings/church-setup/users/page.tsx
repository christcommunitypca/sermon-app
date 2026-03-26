import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChevronLeft, Plus } from 'lucide-react'

interface Props { params: { churchSlug: string } }

type MemberRow = {
  user_id: string
  role: 'owner' | 'admin' | 'teacher'
}

export default async function ChurchUsersPage({ params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id, name')
    .eq('slug', churchSlug)
    .single()

  if (!church) return notFound()

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('role')
    .eq('church_id', church.id)
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .single()

  if (!member) redirect('/sign-in?error=not_a_member')
  if (!(member.role === 'owner' || member.role === 'admin')) redirect(`/${churchSlug}/settings/my-setup/flows`)

  const { data: members } = await supabaseAdmin
    .from('church_members')
    .select('user_id, role')
    .eq('church_id', church.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true }) as { data: MemberRow[] | null }

  const userIds = Array.from(new Set((members ?? []).map(m => m.user_id)))
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const people = (members ?? []).map(m => ({
    id: m.user_id,
    name: profileMap.get(m.user_id)?.full_name ?? m.user_id,
    isAdmin: m.role === 'admin' || m.role === 'owner',
  }))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/${churchSlug}/settings/church-setup/flows`} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />Church Setup
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{church.name} User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage who can access this church and which users are church admins.</p>
        </div>
        <Link href={`/${churchSlug}/settings/church-setup/invitations`} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors">
          <Plus className="w-4 h-4" />Invite User
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <span className="px-3 py-1 rounded-full bg-slate-900 text-white">All</span>
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">Admins</span>
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">Non-Admins</span>
      </div>

      <div className="space-y-3">
        {people.map(person => (
          <div key={person.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900">{person.name}</div>
              {person.isAdmin && <div className="mt-2"><span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Church Admin</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
