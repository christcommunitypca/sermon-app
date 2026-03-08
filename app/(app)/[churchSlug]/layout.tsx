import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
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
  console.log('[layout] ── START churchSlug:', churchSlug)

  // ── 1. Require authenticated user ─────────────────────────────────────────
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  console.log('[layout] cookies present:', allCookies.map(c => c.name))
  const authCookie = allCookies.find(c => c.name.includes('auth-token') && !c.name.includes('verifier'))
  console.log('[layout] auth cookie value (first 80 chars):', authCookie?.value?.slice(0, 80))

  // Parse session directly from cookie — avoids a network round-trip to Supabase
  let userId: string | null = null
  if (authCookie?.value) {
    try {
      const session = JSON.parse(authCookie.value)
      userId = session?.user?.id ?? null
      console.log('[layout] parsed userId from cookie:', userId)
    } catch {
      console.log('[layout] failed to parse auth cookie as JSON')
    }
  }

  if (!userId) {
    console.log('[layout] 1. REDIRECT → no user (cookie missing or unparseable)')
    redirect(`/sign-in?returnTo=/${churchSlug}/dashboard`)
  }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  console.log('[layout] 1. getUser — user:', user?.id ?? null, '| error:', userError?.message ?? null)
  if (userError || !user) {
    console.log('[layout] 1. REDIRECT → no user')
    redirect(`/sign-in?returnTo=/${churchSlug}/dashboard`)
  }

  // ── 2. Resolve church by slug ──────────────────────────────────────────────
  const { data: church, error: churchError } = await supabaseAdmin
    .from('churches')
    .select('id, name, slug')
    .eq('slug', churchSlug)
    .single()
  console.log('[layout] 2. church lookup — found:', church?.id ?? null, '| error:', churchError?.message ?? null)

  if (!church) notFound()

  // ── 3. Verify active membership ────────────────────────────────────────────
  const { data: member, error: memberError } = await supabaseAdmin
    .from('church_members')
    .select('id, role, is_active')
    .eq('church_id', church.id)
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .single()
  console.log('[layout] 3. member lookup — found:', member?.id ?? null, '| role:', member?.role ?? null, '| error:', memberError?.message ?? null)

  if (!member) {
    console.log('[layout] 3. REDIRECT → not_a_member')
    redirect('/sign-in?error=not_a_member')
  }

  // ── 4. Fetch profile for nav display ──────────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // ── 5. Get unread notification count for bell badge ─────────────────────
  const { count: unreadCount } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  // ── 6. Build context — no sensitive data ──────────────────────────────────
  const churchContext: ChurchContextClient = {
    churchId: church.id,
    churchSlug: church.slug,
    churchName: church.name,
    userId: user.id,
    userRole: member.role as 'owner' | 'admin' | 'teacher',
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
          userName={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          unreadCount={unreadCount ?? 0}
        />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </ChurchProvider>
  )
}
