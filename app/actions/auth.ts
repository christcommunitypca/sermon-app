'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { CookieOptions } from '@supabase/ssr'

export async function signOutAction() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.signOut()
  redirect('/sign-in')
}

// ── Notification actions ────────────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function markAllNotificationsReadAction(userId: string) {
  await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
}

// ── Profile update ───────────────────────────────────────────────────────────
export async function updateProfileAction(input: {
  userId: string
  fullName: string | null
  bio: string | null
  avatarUrl: string | null
}) {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: input.userId,
      full_name: input.fullName,
      bio: input.bio,
      avatar_url: input.avatarUrl,
      updated_at: new Date().toISOString(),
    })
  return { error: error?.message ?? null }
}
