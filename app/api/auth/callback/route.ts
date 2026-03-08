import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnTo = url.searchParams.get('returnTo') ?? '/'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const safeReturnTo = returnTo.startsWith('/')
    ? returnTo
    : `/${process.env.NEXT_PUBLIC_CHURCH_SLUG ?? ''}/dashboard`

  return NextResponse.redirect(new URL(safeReturnTo, request.url))
}
