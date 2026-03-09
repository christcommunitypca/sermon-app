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

  // ── 1. Require authenticated user ─────────────────────────────────────────
  // getSession() reads the cookie directly — no network call, no token rotation.
  // This is safe because:
  //   a) The sign-in server action wrote the cookie server-side (httpOnly).
  //   b) Pages only use session.user.id to scope their own DB queries.
  //   c) All writes go through route handlers which validate via Bearer token.
  // We intentionally do NOT call getUser() here — that triggers token rotation
  // which invalidates the cookie before the browser receives the new one,
  // causing the next navigation to lose the session.
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect(`/sign-in?returnTo=/${churchSlug}/dashboard`)
  }
  const user = session.user

  // ── 2. Resolve church by slug ──────────────────────────────────────────────
  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('id, name, slug')
    .eq('slug', churchSlug)
    .single()

  if (!church) notFound()

  // ── 3. Verify active membership ────────────────────────────────────────────
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

  // ── 4. Fetch profile for nav display ──────────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // ── 5. Get unread notification count for bell badge ───────────────────────
  const { count: unreadCount } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  // ── 6. Build context ───────────────────────────────────────────────────────
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