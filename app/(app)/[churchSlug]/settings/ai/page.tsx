import { requireUser } from '@/lib/auth'
import { getKeyStatus } from '@/lib/ai/key'
import { AIKeySettings } from '@/components/settings/AIKeySettings'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'AI Settings' }

export default async function AISettingsPage() {
  const user = await requireUser()
  const keyStatus = await getKeyStatus(user.id)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">AI Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your OpenAI API key to enable outline generation and tag suggestions.
          Your key is encrypted before storage and is never returned to the browser after saving.
        </p>
      </div>
      <AIKeySettings initialStatus={keyStatus} userId={user.id} />
    </div>
  )
}
