import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SessionSnapshotData } from '@/types/database'

// ── createSnapshotPair ─────────────────────────────────────────────────────────
// Always call this function — never insert session_snapshots or outline_snapshots
// individually. Both must be created together or neither.
//
// In production this should use a Postgres function or RPC for true atomicity.
// This implementation uses two sequential inserts with rollback on failure.
//
// Returns the version_number assigned to the pair, or throws on failure.

export async function createSnapshotPair({
  sessionId,
  outlineId,
  churchId,
  createdBy,
  label = null,
  sessionData,
  blocks,
}: {
  sessionId: string
  outlineId: string
  churchId: string
  createdBy: string
  label?: string | null
  sessionData: SessionSnapshotData
  blocks: unknown[]  // OutlineBlock[]
}): Promise<number> {

  // Get next version number (MAX + 1 per session)
  const { data: maxRow } = await supabaseAdmin
    .from('session_snapshots')
    .select('version_number')
    .eq('session_id', sessionId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (maxRow?.version_number ?? 0) + 1
  const now = new Date().toISOString()

  // Insert session snapshot
  const { error: sessionErr } = await supabaseAdmin
    .from('session_snapshots')
    .insert({
      session_id: sessionId,
      church_id: churchId,
      version_number: nextVersion,
      label,
      data: sessionData,
      created_by: createdBy,
      created_at: now,
    })

  if (sessionErr) {
    throw new Error(`Failed to create session snapshot: ${sessionErr.message}`)
  }

  // Insert outline snapshot — must match version_number
  const { error: outlineErr } = await supabaseAdmin
    .from('outline_snapshots')
    .insert({
      outline_id: outlineId,
      session_id: sessionId,
      church_id: churchId,
      version_number: nextVersion,
      label,
      blocks,
      created_by: createdBy,
      created_at: now,
    })

  if (outlineErr) {
    // Compensate: delete the session snapshot we just inserted
    await supabaseAdmin
      .from('session_snapshots')
      .delete()
      .eq('session_id', sessionId)
      .eq('version_number', nextVersion)

    throw new Error(`Failed to create outline snapshot (compensated): ${outlineErr.message}`)
  }

  // Prune old unlabeled auto-snapshots (keep last 20)
  void pruneAutoSnapshots(sessionId, outlineId)

  return nextVersion
}

// ── pruneAutoSnapshots ────────────────────────────────────────────────────────
// Keeps the 20 most recent unlabeled auto-snapshots per session.
// Labeled snapshots are never pruned.
// Fire-and-forget — never awaited in the hot path.
async function pruneAutoSnapshots(sessionId: string, outlineId: string): Promise<void> {
  const KEEP = 20
  try {
    // Get all unlabeled snapshots ordered by version desc
    const { data: unlabeled } = await supabaseAdmin
      .from('session_snapshots')
      .select('id, version_number')
      .eq('session_id', sessionId)
      .is('label', null)
      .order('version_number', { ascending: false })

    if (!unlabeled || unlabeled.length <= KEEP) return

    const toDelete = unlabeled.slice(KEEP)
    const versionsToPrune = toDelete.map(r => r.version_number)

    await Promise.all([
      supabaseAdmin
        .from('session_snapshots')
        .delete()
        .eq('session_id', sessionId)
        .in('version_number', versionsToPrune),
      supabaseAdmin
        .from('outline_snapshots')
        .delete()
        .eq('session_id', sessionId)
        .in('version_number', versionsToPrune),
    ])
  } catch (err) {
    console.error('[snapshots] pruneAutoSnapshots failed:', err)
  }
}

// ── getSnapshotPairs ──────────────────────────────────────────────────────────
// Returns paired snapshot history for the history UI.
export async function getSnapshotPairs(sessionId: string) {
  const { data } = await supabaseAdmin
    .from('session_snapshots')
    .select('id, version_number, label, created_at, created_by')
    .eq('session_id', sessionId)
    .order('version_number', { ascending: false })

  return data ?? []
}
