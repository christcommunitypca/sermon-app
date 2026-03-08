import { OutlineBlock } from '@/types/database'

// ── Tree traversal ─────────────────────────────────────────────────────────────

export function getSortedChildren(blocks: OutlineBlock[], parentId: string | null): OutlineBlock[] {
  return blocks
    .filter(b => b.parent_id === parentId)
    .sort((a, b) => a.position - b.position)
}

export function getBlock(blocks: OutlineBlock[], id: string): OutlineBlock | undefined {
  return blocks.find(b => b.id === id)
}

export function getDepth(blocks: OutlineBlock[], blockId: string): number {
  const block = getBlock(blocks, blockId)
  if (!block?.parent_id) return 0
  return 1 + getDepth(blocks, block.parent_id)
}

export function getDescendantIds(blocks: OutlineBlock[], blockId: string): string[] {
  const children = getSortedChildren(blocks, blockId)
  return children.flatMap(c => [c.id, ...getDescendantIds(blocks, c.id)])
}

// Returns blocks in flat render order (depth-first)
export function getFlatRenderOrder(blocks: OutlineBlock[], parentId: string | null = null): OutlineBlock[] {
  const children = getSortedChildren(blocks, parentId)
  return children.flatMap(c => [c, ...getFlatRenderOrder(blocks, c.id)])
}

// ── Model B operations ─────────────────────────────────────────────────────────
// All return a new array — never mutate.

export function moveUp(blocks: OutlineBlock[], blockId: string): OutlineBlock[] {
  const block = getBlock(blocks, blockId)
  if (!block) return blocks

  const siblings = getSortedChildren(blocks, block.parent_id)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === 0) return blocks // already first

  const prev = siblings[idx - 1]
  return blocks.map(b => {
    if (b.id === blockId) return { ...b, position: prev.position }
    if (b.id === prev.id) return { ...b, position: block.position }
    return b
  })
}

export function moveDown(blocks: OutlineBlock[], blockId: string): OutlineBlock[] {
  const block = getBlock(blocks, blockId)
  if (!block) return blocks

  const siblings = getSortedChildren(blocks, block.parent_id)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === siblings.length - 1) return blocks // already last

  const next = siblings[idx + 1]
  return blocks.map(b => {
    if (b.id === blockId) return { ...b, position: next.position }
    if (b.id === next.id) return { ...b, position: block.position }
    return b
  })
}

// Promote: move block up one level (to parent's parent)
export function promote(blocks: OutlineBlock[], blockId: string): OutlineBlock[] {
  const block = getBlock(blocks, blockId)
  if (!block?.parent_id) return blocks // already top level

  const parent = getBlock(blocks, block.parent_id)
  if (!parent) return blocks

  // New parent is grandparent (may be null = top level)
  const newParentId = parent.parent_id

  // Position: after the current parent among the grandparent's children
  const grandparentChildren = getSortedChildren(blocks, newParentId)
  const parentIdx = grandparentChildren.findIndex(b => b.id === parent.id)
  const newPosition = parentIdx + 1

  // Shift siblings after the new position down
  const updated = blocks.map(b => {
    if (b.id === blockId) {
      return { ...b, parent_id: newParentId ?? null, position: newPosition }
    }
    // Shift grandparent siblings after insertion point
    if (b.parent_id === newParentId && b.position >= newPosition && b.id !== blockId) {
      return { ...b, position: b.position + 1 }
    }
    return b
  })

  return normalizePositions(updated)
}

// Demote: make block a child of its previous sibling
export function demote(blocks: OutlineBlock[], blockId: string): OutlineBlock[] {
  const block = getBlock(blocks, blockId)
  if (!block) return blocks

  const siblings = getSortedChildren(blocks, block.parent_id)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === 0) return blocks // no previous sibling to nest under

  const newParent = siblings[idx - 1]
  const newSiblings = getSortedChildren(blocks, newParent.id)
  const newPosition = newSiblings.length // append at end

  return normalizePositions(
    blocks.map(b => {
      if (b.id === blockId) return { ...b, parent_id: newParent.id, position: newPosition }
      return b
    })
  )
}

// ── Normalize ──────────────────────────────────────────────────────────────────
// Re-sequences positions within each parent group starting from 0
export function normalizePositions(blocks: OutlineBlock[]): OutlineBlock[] {
  // Get all unique parent_id values
  const parentIds = new Set(blocks.map(b => b.parent_id))
  const result = [...blocks]

  for (const parentId of Array.from(parentIds)) {
    const group = result
      .filter(b => b.parent_id === parentId)
      .sort((a, b) => a.position - b.position)

    group.forEach((b, i) => {
      const idx = result.findIndex(r => r.id === b.id)
      result[idx] = { ...result[idx], position: i }
    })
  }

  return result
}

// ── Block creation ─────────────────────────────────────────────────────────────
export function createLocalBlock(
  outlineId: string,
  parentId: string | null,
  type: OutlineBlock['type'],
  position: number
): OutlineBlock {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    outline_id: outlineId,
    parent_id: parentId,
    type,
    content: '',
    scripture_ref: null,
    position,
    estimated_minutes: null,
    ai_source: null,
    ai_edited: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ── AI block helpers ───────────────────────────────────────────────────────────
export function markAsAIEdited(blocks: OutlineBlock[], blockId: string): OutlineBlock[] {
  return blocks.map(b =>
    b.id === blockId && b.ai_source ? { ...b, ai_edited: true } : b
  )
}

export function totalEstimatedMinutes(blocks: OutlineBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.estimated_minutes ?? 0), 0)
}
