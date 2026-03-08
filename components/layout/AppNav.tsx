'use client'

import { useState } from 'react'
import Link from 'next/link'
//import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Role } from '@/types/database'
import {
  BookOpen, Search, Bell, Settings, Users,
  LogOut, Menu, X
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

interface Props {
  churchSlug: string
  churchName: string
  userRole: Role
  userName: string | null
  avatarUrl: string | null
  unreadCount: number
}

export function AppNav({ churchSlug, churchName, userRole, userName, avatarUrl, unreadCount }: Props) {
  //const pathname = usePathname()
  //const pathname = ''
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const router = useRouter()
    const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  const base = `/${churchSlug}`
  const isAdmin = userRole === 'owner' || userRole === 'admin'

  const navItems: NavItem[] = [
    { href: `${base}/teaching`,      label: 'Teaching',       icon: <BookOpen className="w-5 h-5" /> },
    { href: `${base}/search`,        label: 'Search',         icon: <Search className="w-5 h-5" /> },
    { href: `${base}/notifications`, label: 'Notifications',  icon: <Bell className="w-5 h-5" /> },
    { href: `${base}/settings/profile`, label: 'Settings',   icon: <Settings className="w-5 h-5" /> },
    { href: `${base}/admin/users`,   label: 'Admin',          icon: <Users className="w-5 h-5" />, adminOnly: true },
  ]

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-white border-r border-slate-200 z-30">
        {/* Church name */}
        <div className="px-5 py-5 border-b border-slate-100">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-0.5">Teaching</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{churchName}</p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Main navigation">
          {visibleItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
              {item.label === 'Notifications' && unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
            <UserAvatar name={userName} avatarUrl={avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{userName ?? 'Account'}</p>
              <p className="text-xs text-slate-400 capitalize">{userRole}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors mt-1"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────────────────── */}
      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <p className="text-sm font-semibold text-slate-900">{churchName}</p>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 -mr-2" aria-label="Toggle menu">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile slide-out menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/20" onClick={() => setMobileOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <p className="text-sm font-semibold">{churchName}</p>
              <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <nav className="px-3 py-4 space-y-0.5">
              {visibleItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href) ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {item.label === 'Notifications' && unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-4 border-t">
              <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-700">
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop content offset ────────────────────────────────────────── */}
      {/* Add left padding on desktop to account for fixed sidebar */}
      <div className="hidden md:block w-56 shrink-0" aria-hidden />
    </>
  )
}

// ── UserAvatar ─────────────────────────────────────────────────────────────────
function UserAvatar({ name, avatarUrl, size }: { name: string | null; avatarUrl: string | null; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  const initials = name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name ?? ''} className={`${dim} rounded-full object-cover shrink-0`} />
  }
  return (
    <div className={`${dim} rounded-full bg-slate-200 flex items-center justify-center font-medium text-slate-600 shrink-0`}>
      {initials}
    </div>
  )
}