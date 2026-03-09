import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

// getRouteUser — reads the session cookie directly (no network call, no token rotation).
// Safe for route handlers because:
// - The sign-in server action wrote an httpOnly cookie we can trust
// - We only use user.id to scope DB queries through supabaseAdmin (service role)
// - No security-sensitive decisions are made based on this identity alone;
//   all data access is scoped to church_id + user_id pairs validated at the DB level
export async function getRouteUser(req: NextRequest): Promise<User | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll() {
          // Route handlers can't set cookies on the request object after the fact.
          // Cookie refresh is not needed here — we're just reading identity.
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
