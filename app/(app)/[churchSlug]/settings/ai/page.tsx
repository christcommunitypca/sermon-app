import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getKeyStatus } from '@/lib/ai/key'
import { getActiveProviderName } from '@/lib/ai/providers/resolver'
import { AIKeySettings } from '@/components/settings/AIKeySettings'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'AI Settings' }

const PROVIDER_LABEL: Record<string, string> = {
  openai:    'OpenAI',
  anthropic: 'Anthropic',
}

export default async function AISettingsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/sign-in')
  const user = session.user
  const activeProvider = getActiveProviderName()
  const keyStatus = await getKeyStatus(user.id, activeProvider)
  const providerLabel = PROVIDER_LABEL[activeProvider] ?? activeProvider

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">AI Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your {providerLabel} API key to enable AI-powered outline generation,
          scripture research, and series planning.
          Your key is encrypted before storage and is never returned to the browser after saving.
        </p>
      </div>
      <AIKeySettings
        initialStatus={keyStatus}
        userId={user.id}
        activeProvider={activeProvider}
      />
    </div>
  )
}
