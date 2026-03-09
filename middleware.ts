import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Middleware runs on every request and does two things:
// 1. Calls supabase.auth.getUser() to verify the session token against the
//    Supabase Auth server and refresh it if expiring. This is the ONLY place
//    in the app that calls getUser() — one network round-trip per request.
//    The refreshed token is written to the response cookie so all downstream
//    code (pages, actions, layouts) sees a fresh, valid session.
// 2. Redirects unauthenticated requests to /sign-in.
//
// Pages and server actions call getSession() which reads the already-verified
// cookie written here — no extra network call, no rotation race.

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Write to both request (for downstream middleware) and response (for browser)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verify + refresh the session. Must be called before any redirect checks
  // so the refreshed cookie is available to the page/action that runs next.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const slug = process.env.NEXT_PUBLIC_CHURCH_SLUG

  // Root redirect
  if (pathname === '/') {
    const dest = slug ? `/${slug}/dashboard` : '/sign-in'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Protect app routes — redirect unauthenticated users to sign-in
  const isAppRoute = pathname.startsWith(`/${slug}/`) || pathname === `/${slug}`
  if (isAppRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL(`/${slug}/dashboard`, request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
