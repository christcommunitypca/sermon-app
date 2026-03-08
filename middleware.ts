import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// ─────────────────────────────────────────────────────────────────────────────
// Middleware responsibility: session cookie refresh ONLY.
// Auth gating and church membership checks are handled in:
//   app/(app)/[churchSlug]/layout.tsx  — for app routes
//   lib/auth.ts requireUser()          — for API routes
//
// This follows the Supabase SSR recommended pattern: middleware must not be
// relied upon for security — it runs on the edge and cannot import server-only
// modules. The layout server components are the authoritative auth gate.
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Refresh the session cookie on every request so it doesn't expire
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Required: refreshes the session and rotates the cookie if needed.
  // Must be called on every request — do not remove.
  await supabase.auth.getUser()

  // ── Root redirect ──────────────────────────────────────────────────────────
  // NEXT_PUBLIC_CHURCH_SLUG is used ONLY here as a convenience redirect for /.
  // All real auth gating happens in the layout.
  if (request.nextUrl.pathname === '/') {
    const slug = process.env.NEXT_PUBLIC_CHURCH_SLUG
    const dest = slug ? `/${slug}/dashboard` : '/sign-in'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
