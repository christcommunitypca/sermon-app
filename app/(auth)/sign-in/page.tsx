import { SignInForm } from '@/components/auth/SignInForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign In' }

export default function SignInPage({
  searchParams,
}: {
  searchParams: { returnTo?: string; error?: string }
}) {
  return <SignInForm returnTo={searchParams.returnTo} error={searchParams.error} />
}
