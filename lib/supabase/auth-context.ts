'use server'

import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

// getActionUser — get the authenticated user in a server action.
//
// Security model:
// - Middleware calls supabase.auth.getUser() on EVERY request, which verifies
//   the JWT against the Supabase Auth server and refreshes it if needed.
//   The verified, refreshed token is written back to the response cookie.
// - By the time any server action runs, the cookie has already been verified
//   by middleware. getSession() here reads that already-verified cookie —
//   it's safe because the verification already happened this request.
// - This is the official Supabase + Next.js pattern:
//   verify once in middleware, trust getSession() downstream.
//
// Returns null (instead of redirecting) so the caller can return a typed
// error to the client rather than triggering a hard navigation mid-flow.
export async function getActionUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user ?? null
  } catch {
    return null
  }
}
