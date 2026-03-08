import { Role } from '@/types/database'
import { PermissionAction } from '@/types/app'

// ── Permission map ─────────────────────────────────────────────────────────────
// Defines which actions each role can perform.
// Resolution: owner and admin have everything. Teacher has a limited set.
// This is evaluated server-side; never trust a client claim about role.

const OWNER_ADMIN_ACTIONS: PermissionAction[] = [
  'teaching.create',
  'teaching.edit_own',
  'teaching.delete_own',
  'teaching.view_all',
  'teaching.ai.use',
  'flows.manage',
  'settings.ai',
  'admin.users',
  'admin.activity',
  'admin.all',
]

const TEACHER_ACTIONS: PermissionAction[] = [
  'teaching.create',
  'teaching.edit_own',
  'teaching.delete_own',
  'teaching.ai.use',
  'flows.manage',
  'settings.ai',
]

const ROLE_PERMISSIONS: Record<Role, PermissionAction[]> = {
  owner: OWNER_ADMIN_ACTIONS,
  admin: OWNER_ADMIN_ACTIONS,
  teacher: TEACHER_ACTIONS,
}

// ── can() ──────────────────────────────────────────────────────────────────────
// Primary permission check. Use this everywhere.
// Example: if (!can(member.role, 'teaching.ai.use')) return notFound()
export function can(role: Role, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false
}

// ── canAll() ──────────────────────────────────────────────────────────────────
// Check multiple actions at once — returns true only if all are permitted.
export function canAll(role: Role, actions: PermissionAction[]): boolean {
  return actions.every(action => can(role, action))
}

// ── canAny() ──────────────────────────────────────────────────────────────────
// Returns true if the role can perform at least one of the given actions.
export function canAny(role: Role, actions: PermissionAction[]): boolean {
  return actions.some(action => can(role, action))
}

// ── isAdmin() ─────────────────────────────────────────────────────────────────
export function isAdmin(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

// ── getPermissions() ─────────────────────────────────────────────────────────
// Returns the full set of permissions for a role.
// Useful for serializing into ChurchContext for client components.
export function getPermissions(role: Role): PermissionAction[] {
  return ROLE_PERMISSIONS[role] ?? []
}
