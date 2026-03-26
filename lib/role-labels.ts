import { Role } from '@/types/database'

export function getChurchRoleLabel(role: Role) {
  if (role === 'admin') return 'Church Admin'
  if (role === 'teacher') return 'Church User'
  return 'Church Admin'
}

export function getSystemScopeRoleLabel(role: Role, isSystemAdmin: boolean) {
  if (isSystemAdmin) return 'System Admin'
  return getChurchRoleLabel(role)
}

export function getRoleBadges(role: Role, isSystemAdmin = false) {
  const badges: string[] = []
  if (isSystemAdmin) badges.push('System Admin')
  if (role === 'owner' || role === 'admin') badges.push('Church Admin')
  if (badges.length === 0) badges.push('Church User')
  return badges
}
