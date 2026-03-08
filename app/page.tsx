// Middleware handles / redirect to /[churchSlug]/dashboard
// This page should never render — it exists only as a fallback
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/sign-in')
}
