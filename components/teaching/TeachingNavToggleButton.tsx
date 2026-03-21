'use client'

import { Menu } from 'lucide-react'

export function TeachingNavToggleButton() {
  return (
    <button
      id="teaching-nav-flyout-toggle"
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('toggle-teaching-nav'))}
      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      title="Show menu"
      aria-label="Show menu"
    >
      <Menu className="w-4 h-4" />
    </button>
  )
}
