import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client.
// Used ONLY for OAuth sign-in (which requires a browser redirect).
// autoRefreshToken is disabled to prevent this client from rotating the
// refresh token and invalidating the httpOnly server session cookie.
// The server session is managed entirely server-side via middleware.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
