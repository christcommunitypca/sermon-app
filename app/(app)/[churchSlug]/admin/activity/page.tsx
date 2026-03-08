import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Activity Log' }
export default function Page({ params }: { params: { churchSlug: string } }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-2">Activity Log</h1>
      <p className="text-sm text-slate-400">Audit log — Phase 1b</p>
    </div>
  )
}
