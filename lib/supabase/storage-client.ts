// Storage-only browser client.
// Uses autoRefreshToken: false and persistSession: false so it NEVER
// rotates the auth token or writes to cookies. This prevents the browser
// client from invalidating the httpOnly server session cookie.
//
// Use this ONLY for Supabase Storage uploads from client components.
// Never use it for auth operations.
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getStorageClient() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    )
  }
  return _client
}