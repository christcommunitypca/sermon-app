'use client'

import { createContext, useContext } from 'react'
import { ChurchContextClient } from '@/types/app'

const ChurchContext = createContext<ChurchContextClient | null>(null)

export function ChurchProvider({
  value,
  children,
}: {
  value: ChurchContextClient
  children: React.ReactNode
}) {
  return <ChurchContext.Provider value={value}>{children}</ChurchContext.Provider>
}

// ── useChurch ──────────────────────────────────────────────────────────────────
// Use in client components that need church context.
// Will throw if called outside of the (app)/[churchSlug] layout tree.
export function useChurch(): ChurchContextClient {
  const ctx = useContext(ChurchContext)
  if (!ctx) {
    throw new Error(
      'useChurch must be used inside the [churchSlug] layout. ' +
      'If you see this in production, a component has escaped the layout tree.'
    )
  }
  return ctx
}
