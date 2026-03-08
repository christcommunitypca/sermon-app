'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { CookieOptions } from '@supabase/ssr'

export async function signInAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const returnTo = formData.get('returnTo') as string | null

  const cookieStore = await cookies()

  // Server actions CAN set cookies — no try/catch here unlike server components
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const params = new URLSearchParams({ error: error.message })
    if (returnTo) params.set('returnTo', returnTo)
    redirect(`/sign-in?${params.toString()}`)
  }

  const dest = returnTo?.startsWith('/') ? returnTo : `/${process.env.NEXT_PUBLIC_CHURCH_SLUG}/dashboard`
  redirect(dest)
}
