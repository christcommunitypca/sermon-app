import Link from 'next/link'
import { Role } from '@/types/database'

type SettingsNavKey =
  | 'my-flows'
  | 'church-flows'
  | 'church-users'
  | 'church-invites'
  | 'system-users'
  | 'system-invites'
  | 'system-templates'
  | 'profile'
  | 'ai'
  | 'tradition'
  | 'notifications'
  | 'calendar'

interface Props {
  churchSlug: string
  active: SettingsNavKey
  userRole: Role
  isSystemAdmin?: boolean
}

export function SettingsNav({ churchSlug, active, userRole, isSystemAdmin = false }: Props) {
  const personalKeys: SettingsNavKey[] = ['my-flows', 'ai', 'tradition', 'profile', 'notifications', 'calendar']
  const churchKeys: SettingsNavKey[] = ['church-flows', 'church-users', 'church-invites']
  const systemKeys: SettingsNavKey[] = ['system-users', 'system-invites', 'system-templates']

  const items = personalKeys.includes(active)
    ? [
        { key: 'my-flows' as SettingsNavKey, label: 'My Flows', href: `/${churchSlug}/settings/my-setup/flows` },
        { key: 'ai' as SettingsNavKey, label: 'AI Key', href: `/${churchSlug}/settings/ai` },
        { key: 'tradition' as SettingsNavKey, label: 'Tradition', href: `/${churchSlug}/settings/tradition` },
        { key: 'profile' as SettingsNavKey, label: 'Profile', href: `/${churchSlug}/settings/profile` },
        { key: 'notifications' as SettingsNavKey, label: 'Notifications', href: `/${churchSlug}/settings/notifications` },
        { key: 'calendar' as SettingsNavKey, label: 'Calendar', href: `/${churchSlug}/settings/calendar` },
      ]
    : churchKeys.includes(active)
      ? [
          { key: 'church-flows' as SettingsNavKey, label: 'Shared Flows', href: `/${churchSlug}/settings/church-setup/flows` },
          { key: 'church-users' as SettingsNavKey, label: 'Church Users', href: `/${churchSlug}/settings/church-setup/users` },
          { key: 'church-invites' as SettingsNavKey, label: 'Invitations', href: `/${churchSlug}/settings/church-setup/invitations` },
        ]
      : systemKeys.includes(active) && isSystemAdmin
        ? [
            { key: 'system-users' as SettingsNavKey, label: 'Users Across Churches', href: `/${churchSlug}/settings/system-setup/users` },
            { key: 'system-invites' as SettingsNavKey, label: 'Invitations', href: `/${churchSlug}/settings/system-setup/invitations` },
            { key: 'system-templates' as SettingsNavKey, label: 'System Templates', href: `/${churchSlug}/settings/system-setup/templates` },
          ]
        : []

  if (!items.length) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-8">
      {items.map(item => {
        const isActive = item.key === active
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
