import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Shield, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

interface Props {
  params: { churchSlug: string }
  searchParams?: { filter?: string }
}

type ChurchInfo = {
  id: string | null
  name: string | null
  slug: string | null
}

type MemberAssignmentRow = {
  user_id: string
  role: 'owner' | 'admin' | 'teacher'
  churches: ChurchInfo | ChurchInfo[] | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

type GlobalAdminRow = {
  user_id: string
}

type MembershipBadge = {
  churchId: string
  churchName: string
  churchSlug: string | null
  role: 'owner' | 'admin' | 'teacher'
}

type DirectoryPerson = {
  id: string
  name: string
  avatarUrl: string | null
  isSystemAdmin: boolean
  memberships: MembershipBadge[]
}

function firstChurch(value: ChurchInfo | ChurchInfo[] | null): ChurchInfo | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function roleLabel(role: 'owner' | 'admin' | 'teacher') {
  return role === 'owner' || role === 'admin' ? 'Church Admin' : 'Church User'
}

export default async function SystemUsersPage({ params, searchParams }: Props) {
  const { churchSlug } = params
  const filter = searchParams?.filter ?? 'all'

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')

  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id')
    .eq('slug', churchSlug)
    .single()

  if (!church) return notFound()

  const { data: globalAdmin } = await supabaseAdmin
    .from('global_admins')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!globalAdmin) redirect(`/${churchSlug}/settings/church-setup/flows`)

  const [{ data: memberAssignments }, { data: globalAdmins }] = await Promise.all([
    supabaseAdmin
      .from('church_members')
      .select('user_id, role, churches(id, name, slug)')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('global_admins')
      .select('user_id')
      .order('created_at', { ascending: true }),
  ])

  const assignmentRows = (memberAssignments ?? []) as MemberAssignmentRow[]
  const globalAdminRows = (globalAdmins ?? []) as GlobalAdminRow[]

  const userIds = Array.from(
    new Set([
      ...assignmentRows.map(row => row.user_id),
      ...globalAdminRows.map(row => row.user_id),
    ])
  )

  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [] as ProfileRow[] }

  const profileMap = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const globalAdminSet = new Set(globalAdminRows.map(row => row.user_id))
  const peopleMap = new Map<string, DirectoryPerson>()

  for (const userId of userIds) {
    const profile = profileMap.get(userId)
    peopleMap.set(userId, {
      id: userId,
      name: profile?.full_name ?? userId,
      avatarUrl: profile?.avatar_url ?? null,
      isSystemAdmin: globalAdminSet.has(userId),
      memberships: [],
    })
  }

  for (const row of assignmentRows) {
    const churchInfo = firstChurch(row.churches)
    if (!churchInfo?.id || !churchInfo?.name) continue
    const person = peopleMap.get(row.user_id)
    if (!person) continue

    if (!person.memberships.some(m => m.churchId === churchInfo.id && m.role === row.role)) {
      person.memberships.push({
        churchId: churchInfo.id,
        churchName: churchInfo.name,
        churchSlug: churchInfo.slug,
        role: row.role,
      })
    }
  }

  const people = Array.from(peopleMap.values())
    .map(person => ({
      ...person,
      memberships: [...person.memberships].sort((a, b) => a.churchName.localeCompare(b.churchName)),
    }))
    .sort((a, b) => {
      if (a.isSystemAdmin !== b.isSystemAdmin) return a.isSystemAdmin ? -1 : 1
      const aHasChurchAdmin = a.memberships.some(m => m.role === 'owner' || m.role === 'admin')
      const bHasChurchAdmin = b.memberships.some(m => m.role === 'owner' || m.role === 'admin')
      if (aHasChurchAdmin !== bHasChurchAdmin) return aHasChurchAdmin ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const counts = {
    all: people.length,
    system: people.filter(person => person.isSystemAdmin).length,
    churchAdmins: people.filter(person => person.memberships.some(m => m.role === 'owner' || m.role === 'admin')).length,
    churchUsers: people.filter(person => person.memberships.some(m => m.role === 'teacher')).length,
  }

  const filteredPeople = people.filter(person => {
    if (filter === 'system') return person.isSystemAdmin
    if (filter === 'church-admins') return person.memberships.some(m => m.role === 'owner' || m.role === 'admin')
    if (filter === 'church-users') return person.memberships.some(m => m.role === 'teacher')
    return true
  })

  const chipClass = (active: boolean) =>
    active
      ? 'px-3 py-1 rounded-full bg-slate-900 text-white'
      : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href={`/${churchSlug}/settings/system-setup/templates`}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        System Setup
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users Across Churches</h1>
        <p className="text-sm text-slate-500 mt-1">
          View everyone with platform access, the churches they belong to, and which users also have system-wide authority.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        <Link href={`/${churchSlug}/settings/system-setup/users`} className={chipClass(filter === 'all')}>
          All ({counts.all})
        </Link>
        <Link href={`/${churchSlug}/settings/system-setup/users?filter=system`} className={chipClass(filter === 'system')}>
          System Admins ({counts.system})
        </Link>
        <Link href={`/${churchSlug}/settings/system-setup/users?filter=church-admins`} className={chipClass(filter === 'church-admins')}>
          Church Admins ({counts.churchAdmins})
        </Link>
        <Link href={`/${churchSlug}/settings/system-setup/users?filter=church-users`} className={chipClass(filter === 'church-users')}>
          Church Users ({counts.churchUsers})
        </Link>
      </div>

      <div className="space-y-3">
        {filteredPeople.map(person => {
          const hasChurchAdminRole = person.memberships.some(m => m.role === 'owner' || m.role === 'admin')
          const hasChurchUserRole = person.memberships.some(m => m.role === 'teacher')

          return (
            <div
              key={person.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 break-words">{person.name}</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {person.isSystemAdmin && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      <Shield className="w-3 h-3" />
                      System Admin
                    </span>
                  )}
                  {hasChurchAdminRole && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      Church Admin
                    </span>
                  )}
                  {!hasChurchAdminRole && hasChurchUserRole && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      Church User
                    </span>
                  )}
                </div>

                {person.memberships.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {person.memberships.map(membership => (
                      <span
                        key={`${person.id}-${membership.churchId}-${membership.role}`}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200"
                      >
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {membership.churchName} · {roleLabel(membership.role)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-slate-500">No church membership assigned.</div>
                )}
              </div>
            </div>
          )
        })}

        {!filteredPeople.length && (
          <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl p-4 bg-white">
            No users match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
