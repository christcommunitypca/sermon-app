import { createBrowserClient } from '@supabase/ssr'

// Used in client components and client-side hooks only.
// Never call this from server components or route handlers — use server.ts instead.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
