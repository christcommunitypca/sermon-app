import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ── MVP Search ────────────────────────────────────────────────────────────────
// Scope: teacher's own sessions only.
// Uses Postgres tsvector full-text search via the search_index table.
//
// NOT YET IMPLEMENTED:
// - Church-wide search (iteration 2)
// - Public search (requires public route)
// - Semantic/vector search (pgvector, iteration 3)
// - Visibility-based filtering (stored, not queried in MVP)

export interface SearchResult {
  entity_type: string
  entity_id: string
  title: string
  excerpt: string | null
  score: number
}

// ── searchOwnContent ──────────────────────────────────────────────────────────
// Searches the current teacher's own sessions only.
// teacherId MUST be the authenticated user's ID — never accept this from client input.
export async function searchOwnContent(
  teacherId: string,
  query: string
): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w + ':*')     // prefix matching
    .join(' & ')

  const { data, error } = await supabaseAdmin
    .from('search_index')
    .select('entity_type, entity_id, search_vector')
    .eq('teacher_id', teacherId)
    // Note: visibility NOT filtered here. MVP only shows own content regardless.
    .textSearch('search_vector', tsQuery, { type: 'plain' })
    .limit(20)

  if (error || !data) return []

  // For MVP, fetch titles from the source tables for each result
  const sessionIds = data
    .filter(r => r.entity_type === 'session')
    .map(r => r.entity_id)

  if (sessionIds.length === 0) return []

  const { data: sessions } = await supabaseAdmin
    .from('teaching_sessions')
    .select('id, title, scripture_ref, type, status')
    .in('id', sessionIds)
    .eq('teacher_id', teacherId)

  return (sessions ?? []).map(s => ({
    entity_type: 'session',
    entity_id: s.id,
    title: s.title,
    excerpt: s.scripture_ref ?? null,
    score: 1,
  }))
}

// ── updateSearchIndex ─────────────────────────────────────────────────────────
// Called after a session is saved. Updates the tsvector for that session.
// Async — never awaited in the hot path. Call via:
//   void updateSearchIndex(sessionId, churchId, teacherId)
export async function updateSearchIndex(
  sessionId: string,
  churchId: string,
  teacherId: string,
  visibility: 'private' | 'church' | 'public' = 'church'
): Promise<void> {
  const { data: session } = await supabaseAdmin
    .from('teaching_sessions')
    .select('title, scripture_ref, notes, type')
    .eq('id', sessionId)
    .single()

  if (!session) return

  // Build the search document from title + scripture + notes
  // search_vector is populated by a Postgres trigger (see migration notes).
  // We upsert the row here; the trigger handles the tsvector conversion.
  const _searchText = [
    session.title,
    session.scripture_ref ?? '',
    session.notes ?? '',
  ].join(' ')

  await supabaseAdmin
    .from('search_index')
    .upsert({
      church_id: churchId,
      entity_type: 'session',
      entity_id: sessionId,
      teacher_id: teacherId,
      // search_vector is set by DB trigger: to_tsvector('english', title || scripture || notes)
      // Do not set it here — the trigger handles it on insert/update.
      visibility,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'entity_type,entity_id' })

  // IMPLEMENTATION NOTE:
  // tsvector should be set via a Postgres function or generated column for correctness.
  // The line above is a placeholder. Add a Supabase Edge Function or DB trigger that calls:
  //   to_tsvector('english', coalesce(title,'') || ' ' || coalesce(scripture_ref,'') || ' ' || coalesce(notes,''))
  // and stores it in search_vector.
}