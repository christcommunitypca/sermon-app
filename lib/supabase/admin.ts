import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS entirely.
// ONLY import this in route handlers (/app/api/**) and server actions.
// NEVER import in client components, layouts, or page files.
// The 'server-only' import above will cause a build error if misused.

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
