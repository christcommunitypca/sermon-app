import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const slug = process.env.NEXT_PUBLIC_CHURCH_SLUG

  // Root redirect — no auth needed
  if (pathname === '/') {
    const dest = slug ? `/${slug}/dashboard` : '/sign-in'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Only run Supabase auth on page navigations (GET requests).
  // Skipping API routes and server actions (POST) prevents the token rotation
  // storm where multiple concurrent requests each rotate the token and
  // invalidate each other's cookies.
  //
  // Security: API routes and server actions use getSession() which reads the
  // cookie written by the most recent page navigation. Token freshness is
  // maintained by refreshing on every page load, which is sufficient.
  const isPageNavigation = request.method === 'GET' &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/')

  if (!isPageNavigation) {
    return NextResponse.next()
  }

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verify and refresh the token. Runs once per page navigation.
  const { data: { user } } = await supabase.auth.getUser()

  const isAppRoute = pathname.startsWith(`/${slug}/`) || pathname === `/${slug}`
  const isAuthRoute = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')

  if (isAppRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(url)
  }

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