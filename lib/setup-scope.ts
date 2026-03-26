import { Role } from '@/types/database'

export type SetupScope = 'my' | 'church' | 'system'

export function canAccessChurchSetup(role: Role | null | undefined) {
  return role === 'owner' || role === 'admin'
}

export function canAccessSystemSetup(_role: Role | null | undefined, isSystemAdmin = false) {
  return isSystemAdmin
}

export function getRoleScopeBadges(role: Role | null | undefined, isSystemAdmin = false) {
  const badges: string[] = ['Church User']
  if (canAccessChurchSetup(role)) badges.push('Church Admin')
  if (canAccessSystemSetup(role, isSystemAdmin)) badges.push('System Admin')
  return badges
}

export function getScopeTitle(scope: SetupScope) {
  if (scope === 'my') return 'My Prep'
  if (scope === 'church') return 'Church Defaults'
  return 'System Admin'
}

export function getScopeDescription(scope: SetupScope, churchName?: string | null) {
  if (scope === 'my') return 'Your personal preferences, AI key, and custom preparation tools.'
  if (scope === 'church') return `Shared defaults, user access, and sermon guidance for ${churchName ?? 'your church'}.`
  return 'Platform-wide administration across all churches, users, and global defaults.'
}
