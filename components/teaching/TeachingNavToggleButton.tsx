'use client'

import { Menu } from 'lucide-react'

export function TeachingNavToggleButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const toggle = document.getElementById('appnav-teaching-toggle')
        ;(toggle as HTMLButtonElement | null)?.click()
      }}
      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      title="Show menu"
      aria-label="Show menu"
    >
      <Menu className="w-4 h-4" />
    </button>
  )
}