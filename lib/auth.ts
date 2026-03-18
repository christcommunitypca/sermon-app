import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChurchMember, Role } from '@/types/database'

// ── requireUser ────────────────────────────────────────────────────────────────
// Use in server components and route handlers that require authentication.
// Redirects to /sign-in if not authenticated.
// Returns the authenticated user.
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/sign-in')
  }

  return user
}

// ── requireMember ──────────────────────────────────────────────────────────────
// Requires authentication AND active membership in the specified church.
// Throws 403 (via notFound) if the user is not an active member.
// Returns the membership row.
export async function requireMember(churchId: string): Promise<ChurchMember> {
  const user = await requireUser()

  const { data: member, error } = await supabaseAdmin
    .from('church_members')
    .select('*')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (error || !member) {
    // User is authenticated but not a member of this church
    redirect('/sign-in?error=not_a_member')
  }

  return member as ChurchMember
}

// ── requireRole ────────────────────────────────────────────────────────────────
// Requires membership AND a minimum role level.
export async function requireRole(churchId: string, minimumRole: Role) {
  const member = await requireMember(churchId)
  const roleLevel: Record<Role, number> = { teacher: 1, admin: 2, owner: 3 }

  if (roleLevel[member.role] < roleLevel[minimumRole]) {
    redirect('/sign-in?error=insufficient_role')
  }

  return member
}

// ── resolveChurch ──────────────────────────────────────────────────────────────
// Look up a church by slug. Returns null if not found.
// Used in middleware and layouts — not a gating function.
export async function resolveChurchBySlug(slug: string) {
  const { data } = await supabaseAdmin
    .from('churches')
    .select('id, name, slug, owner_id, settings, created_at')
    .eq('slug', slug)
    .single()

  return data ?? null
}

// ── getProfile ─────────────────────────────────────────────────────────────────
export async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  return data ?? null
}

// ── getMember ─────────────────────────────────────────────────────────────────
export async function getMember(churchId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('church_members')
    .select('*')
    .eq('church_id', churchId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  return data ?? null
}
