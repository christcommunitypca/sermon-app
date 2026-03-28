import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChevronLeft, Plus } from 'lucide-react'

interface Props {
  params: { churchSlug: string }
  searchParams?: { filter?: string }
}

type MemberRow = {
  user_id: string
  role: 'owner' | 'admin' | 'teacher'
}

type FilterKey = 'all' | 'admins' | 'non-admins'

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'admins', label: 'Admins' },
  { key: 'non-admins', label: 'Non-Admins' },
]

function normalizeFilter(value: string | undefined): FilterKey {
  if (value === 'admins' || value === 'non-admins') return value
  return 'all'
}

export default async function ChurchUsersPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const filter = normalizeFilter(searchParams?.filter)
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

  const { data: globalAdmins } = userIds.length
    ? await supabaseAdmin.from('global_admins').select('user_id').in('user_id', userIds)
    : { data: [] as Array<{ user_id: string }> }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const globalAdminSet = new Set((globalAdmins ?? []).map(a => a.user_id))

  const people = (members ?? []).map(m => ({
    id: m.user_id,
    name: profileMap.get(m.user_id)?.full_name ?? m.user_id,
    churchRole: m.role,
    isChurchAdmin: m.role === 'admin' || m.role === 'owner',
    isSystemAdmin: globalAdminSet.has(m.user_id),
  }))

  const filteredPeople = people.filter(person => {
    if (filter === 'admins') return person.isChurchAdmin
    if (filter === 'non-admins') return !person.isChurchAdmin
    return true
  })

  const counts = {
    all: people.length,
    admins: people.filter(person => person.isChurchAdmin).length,
    'non-admins': people.filter(person => !person.isChurchAdmin).length,
  } satisfies Record<FilterKey, number>

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
        {FILTER_OPTIONS.map(option => {
          const active = option.key === filter
          const href = option.key === 'all'
            ? `/${churchSlug}/settings/church-setup/users`
            : `/${churchSlug}/settings/church-setup/users?filter=${option.key}`
          return (
            <Link
              key={option.key}
              href={href}
              className={`px-3 py-1 rounded-full transition-colors ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {option.label} <span className={`ml-1 text-xs ${active ? 'text-slate-200' : 'text-slate-400'}`}>{counts[option.key]}</span>
            </Link>
          )
        })}
      </div>

      <div className="space-y-3">
        {filteredPeople.length > 0 ? filteredPeople.map(person => (
          <div key={person.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900">{person.name}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {person.isChurchAdmin ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Church Admin</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Church User</span>
                )}
                {person.isSystemAdmin && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">System Admin</span>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-400 text-right uppercase tracking-wide">
              {person.churchRole === 'owner' ? 'Owner' : person.churchRole === 'admin' ? 'Admin' : 'User'}
            </div>
          </div>
        )) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-sm text-slate-500">
            No users match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
