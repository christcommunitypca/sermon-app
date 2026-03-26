'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/app/actions/auth'
import { Role } from '@/types/database'
import { canAccessChurchSetup, canAccessSystemSetup } from '@/lib/setup-scope'
import { getRoleBadges } from '@/lib/role-labels'
import {
  BookOpen, Search, Bell, LogOut, Menu, X, BookMarked,
  User2, Building2, Shield, Check, ChevronsUpDown, KeyRound, Users, Mail, Library, ListTree
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  show?: boolean
}

interface NavSection {
  label: string
  icon?: React.ReactNode
  items: NavItem[]
  show?: boolean
}

interface Props {
  churchSlug: string
  churchName: string
  userRole: Role
  isSystemAdmin?: boolean
  userName: string | null
  avatarUrl: string | null
  unreadCount: number
  churchOptions?: Array<{ name: string; slug: string; role: Role }>
}

export function AppNav({ churchSlug, churchName, userRole, isSystemAdmin = false, userName, avatarUrl, unreadCount, churchOptions = [] }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopPeekOpen, setDesktopPeekOpen] = useState(false)
  const isTeachingDetail = /^\/[^/]+\/teaching\/[^/]+$/.test(pathname)

  useEffect(() => {
    function syncFromClass() {
      const isOpen = document.documentElement.classList.contains('teaching-nav-open')
      setDesktopPeekOpen(isOpen)
    }
  
    const observer = new MutationObserver(syncFromClass)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  
    syncFromClass()
  
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (desktopPeekOpen) {
      document.documentElement.classList.add('teaching-nav-open')
    } else {
      document.documentElement.classList.remove('teaching-nav-open')
    }
  }, [desktopPeekOpen])

  useEffect(() => {
    const onToggle = () => {
      if (!isTeachingDetail) return
      setDesktopPeekOpen(v => !v)
    }
  
    window.addEventListener('toggle-teaching-nav', onToggle)
  
    return () => {
      window.removeEventListener('toggle-teaching-nav', onToggle)
    }
  }, [isTeachingDetail])

  const base = `/${churchSlug}`

  const mainItems: NavItem[] = [
    { href: `${base}/teaching`, label: 'Teaching', icon: <BookOpen className="w-5 h-5" /> },
    { href: `${base}/series`, label: 'Series', icon: <BookMarked className="w-5 h-5" /> },
    { href: `${base}/search`, label: 'Search', icon: <Search className="w-5 h-5" /> },
    { href: `${base}/notifications`, label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  ]

  const setupSections: NavSection[] = [
    {
      label: 'My Setup',
      icon: <User2 className="w-4 h-4" />,
      items: [
        { href: `${base}/settings/ai`, label: 'AI Key', icon: <KeyRound className="w-4 h-4" /> },
        { href: `${base}/settings/my-setup/flows`, label: 'My Flows', icon: <Library className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Church Setup',
      icon: <Building2 className="w-4 h-4" />,
      show: canAccessChurchSetup(userRole),
      items: [
        { href: `${base}/settings/church-setup/flows`, label: 'Shared Flows', icon: <Library className="w-4 h-4" /> },
        { href: `${base}/settings/church-setup/lesson-types`, label: 'Lesson Types', icon: <ListTree className="w-4 h-4" /> },
        { href: `${base}/settings/church-setup/users`, label: 'Church Users', icon: <Users className="w-4 h-4" /> },
        { href: `${base}/settings/church-setup/invitations`, label: 'Invitations', icon: <Mail className="w-4 h-4" /> },
      ],
    },
    {
      label: 'System Setup',
      icon: <Shield className="w-4 h-4" />,
      show: canAccessSystemSetup(userRole, isSystemAdmin),
      items: [
        { href: `${base}/settings/system-setup/users`, label: 'Users Across Churches', icon: <Users className="w-4 h-4" /> },
        { href: `${base}/settings/system-setup/invitations`, label: 'Invitations', icon: <Mail className="w-4 h-4" /> },
        { href: `${base}/settings/system-setup/templates`, label: 'System Templates', icon: <Library className="w-4 h-4" /> },
      ],
    },
  ].filter(section => section.show !== false)

  const roleLine = getRoleBadges(userRole, isSystemAdmin).join(' · ')

  async function handleSignOut() {
    await signOutAction()
  }

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  function renderNavLink(item: NavItem, compact = false) {
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`relative flex items-center gap-2.5 px-3 ${compact ? 'py-2.5' : 'py-2'} rounded-lg text-sm font-medium transition-colors ${
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
    )
  }

  function renderSection(section: NavSection) {
    return (
      <div key={section.label} className="pt-3 first:pt-0">
        <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-2">
          {section.icon}
          <span>{section.label}</span>
        </div>
        <div className="space-y-0.5">
          {section.items.map(item => renderNavLink(item))}
        </div>
      </div>
    )
  }

  const switcher = churchOptions.length > 1 ? (
    <details className="mt-3 group">
      <summary className="list-none cursor-pointer flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
        <span className="truncate">Switch church</span>
        <ChevronsUpDown className="w-4 h-4 text-slate-400" />
      </summary>
      <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden bg-white">
        {churchOptions.map(option => (
          <Link key={option.slug} href={`/${option.slug}/teaching`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b last:border-b-0 border-slate-100">
            <div className="min-w-0">
              <div className="truncate">{option.name}</div>
              <div className="text-xs text-slate-400">{option.role === 'admin' || option.role === 'owner' ? 'Church Admin' : 'Church User'}</div>
            </div>
            {option.slug === churchSlug && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
          </Link>
        ))}
      </div>
    </details>
  ) : null

  return (
    <>
    <button
  id="appnav-teaching-toggle"
  type="button"
  className="hidden"
  aria-hidden="true"
  onClick={() => {
    if (isTeachingDetail) setDesktopPeekOpen(v => !v)
  }}
/>
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 z-50 transition-transform duration-200 ${
          isTeachingDetail
            ? desktopPeekOpen
              ? 'translate-x-0'
              : '-translate-x-full'
            : 'translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-100">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-0.5">Teaching</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{churchName}</p>
          {switcher}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto" aria-label="Main navigation">
          <div className="space-y-0.5">
            {mainItems.map(item => renderNavLink(item))}
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-3">
            {setupSections.map(renderSection)}
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
            <UserAvatar name={userName} avatarUrl={avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{userName ?? 'Account'}</p>
              <p className="text-xs text-slate-400 truncate">{roleLine}</p>
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

      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div>
          <p className="text-sm font-semibold text-slate-900">{churchName}</p>
          {churchOptions.length > 1 && <p className="text-xs text-slate-400">Tap menu to switch churches</p>}
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 -mr-2" aria-label="Toggle menu">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/20" onClick={() => setMobileOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <p className="text-sm font-semibold">{churchName}</p>
              <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            {churchOptions.length > 1 && (
              <div className="px-3 py-3 border-b border-slate-100">
                <div className="text-xs uppercase tracking-wide text-slate-400 font-medium mb-2">Switch church</div>
                <div className="space-y-1">
                  {churchOptions.map(option => (
                    <Link
                      key={option.slug}
                      href={`/${option.slug}/teaching`}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${option.slug === churchSlug ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate">{option.name}</div>
                        <div className="text-xs text-slate-400">{option.role === 'admin' || option.role === 'owner' ? 'Church Admin' : 'Church User'}</div>
                      </div>
                      {option.slug === churchSlug && <Check className="w-4 h-4 text-emerald-600" />}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <nav className="px-3 py-4 space-y-3">
              <div className="space-y-0.5">
                {mainItems.map(item => (
                  <div key={item.href} onClick={() => setMobileOpen(false)}>{renderNavLink(item, true)}</div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-3">
                {setupSections.map(section => (
                  <div key={section.label}>
                    <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-2">
                      {section.icon}
                      <span>{section.label}</span>
                    </div>
                    <div className="space-y-0.5">
                      {section.items.map(item => (
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
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}

function UserAvatar({ name, avatarUrl, size = 'md' }: { name: string | null; avatarUrl: string | null; size?: 'sm' | 'md' }) {
  const initials = (name ?? 'U')
    .split(' ')
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt={name ?? 'User'} className={`${dim} rounded-full object-cover`} />
  ) : (
    <div className={`${dim} rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-semibold`}>
      {initials}
    </div>
  )
}
