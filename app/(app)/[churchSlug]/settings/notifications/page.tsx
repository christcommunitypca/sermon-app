import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Notification Settings' }
export default function Page({ params }: { params: { churchSlug: string } }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Notification Settings</h1>
      <p className="text-sm text-slate-400">Email and in-app preferences — Phase 4</p>
    </div>
  )
}
