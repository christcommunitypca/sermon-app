import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChurchProvider } from '@/components/layout/ChurchProvider'
import { AppNav } from '@/components/layout/AppNav'
import { ChurchContextClient } from '@/types/app'

interface Props {
  children: React.ReactNode
  params: { churchSlug: string }
}

export default async function AppLayout({ children, params }: Props) {
  const { churchSlug } = params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect(`/sign-in?returnTo=/${churchSlug}/dashboard`)
  }
  const user = session.user

  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id, name, slug')
    .eq('slug', churchSlug)
    .single()

  if (!church) notFound()

  const { data: member } = await supabaseAdmin
    .from('church_members')
    .select('id, role, is_active')
    .eq('church_id', church.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) {
    redirect('/sign-in?error=not_a_member')
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  const { count: unreadCount } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  const { data: globalAdmin } = await supabaseAdmin
    .from('global_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: memberships } = await supabaseAdmin
    .from('church_members')
    .select('role, churches(name, slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const isSystemAdmin = !!globalAdmin

  const churchOptions = (memberships ?? []).map((row: any) => {
    const info = Array.isArray(row.churches) ? row.churches[0] : row.churches
    return {
      name: info?.name ?? 'Church',
      slug: info?.slug ?? '',
      role: row.role as 'owner' | 'admin' | 'teacher',
    }
  }).filter((row: any) => !!row.slug)

  const churchContext: ChurchContextClient = {
    churchId: church.id,
    churchSlug: church.slug,
    churchName: church.name,
    userId: user.id,
    userRole: member.role as 'owner' | 'admin' | 'teacher',
    isSystemAdmin,
    userName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  }

  return (
    <ChurchProvider value={churchContext}>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <AppNav
          churchSlug={church.slug}
          churchName={church.name}
          userRole={member.role as 'owner' | 'admin' | 'teacher'}
          isSystemAdmin={isSystemAdmin}
          userName={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          unreadCount={unreadCount ?? 0}
          churchOptions={churchOptions}
        />
        <main className="flex-1 md:ml-56">
          {children}
        </main>
      </div>
    </ChurchProvider>
  )
}
