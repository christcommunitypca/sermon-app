import { Church, ChurchMember, Profile, Role } from './database'

// Resolved from middleware + layout — passed into ChurchProvider
export interface ChurchContext {
  churchId: string
  churchSlug: string
  churchName: string
  userId: string
  userRole: Role
  profile: Profile | null
  member: ChurchMember
  church: Church
}

// Lightweight version for client components (no sensitive data)
export interface ChurchContextClient {
  churchId: string
  churchSlug: string
  churchName: string
  userId: string
  userRole: Role
  userName: string | null
  avatarUrl: string | null
}

// Permission action keys used throughout the app
export type PermissionAction =
  | 'teaching.create'
  | 'teaching.edit_own'
  | 'teaching.delete_own'
  | 'teaching.view_all'
  | 'teaching.ai.use'
  | 'flows.manage'
  | 'settings.ai'
  | 'admin.users'
  | 'admin.activity'
  | 'admin.all'
