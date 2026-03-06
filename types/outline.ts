export type BlockType =
  | 'point'
  | 'sub_point'
  | 'scripture'
  | 'illustration'
  | 'application'
  | 'transition'

export type Confidence = 'high' | 'medium' | 'low'

export interface AISource {
  model: string
  prompt_version: string
  confidence: Confidence
}

export interface Block {
  id: string
  parent_id: string | null
  type: BlockType
  content: string
  position: number
  estimated_minutes?: number | null
  ai_source?: AISource | null
  ai_edited: boolean
}

export type ReorderModel = 'A' | 'B' | 'C' | 'D'

// ── Helpers ──────────────────────────────────────────────────────

export function getSortedChildren(blocks: Block[], parentId: string | null): Block[] {
  return blocks
    .filter(b => b.parent_id === parentId)
    .sort((a, b) => a.position - b.position)
}

export function normalizePositions(blocks: Block[]): Block[] {
  const parentIds = [...new Set(blocks.map(b => b.parent_id))]
  let result = [...blocks]
  parentIds.forEach(pid => {
    const group = result.filter(b => b.parent_id === pid).sort((a, b) => a.position - b.position)
    group.forEach((b, idx) => {
      result = result.map(block => block.id === b.id ? { ...block, position: idx } : block)
    })
  })
  return result
}

export function moveUp(blocks: Block[], blockId: string): Block[] {
  const block = blocks.find(b => b.id === blockId)
  if (!block) return blocks
  const siblings = blocks.filter(b => b.parent_id === block.parent_id).sort((a, b) => a.position - b.position)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === 0) return blocks
  const prev = siblings[idx - 1]
  return blocks.map(b => {
    if (b.id === blockId) return { ...b, position: prev.position }
    if (b.id === prev.id) return { ...b, position: block.position }
    return b
  })
}

export function moveDown(blocks: Block[], blockId: string): Block[] {
  const block = blocks.find(b => b.id === blockId)
  if (!block) return blocks
  const siblings = blocks.filter(b => b.parent_id === block.parent_id).sort((a, b) => a.position - b.position)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === siblings.length - 1) return blocks
  const next = siblings[idx + 1]
  return blocks.map(b => {
    if (b.id === blockId) return { ...b, position: next.position }
    if (b.id === next.id) return { ...b, position: block.position }
    return b
  })
}

export function promote(blocks: Block[], blockId: string): Block[] {
  const block = blocks.find(b => b.id === blockId)
  if (!block || block.parent_id === null) return blocks
  const parent = blocks.find(b => b.id === block.parent_id)
  if (!parent) return blocks
  const newParentId = parent.parent_id
  const newPosition = parent.position + 0.5
  const updated = blocks.map(b =>
    b.id === blockId ? { ...b, parent_id: newParentId, position: newPosition } : b
  )
  return normalizePositions(updated)
}

export function demote(blocks: Block[], blockId: string): Block[] {
  const block = blocks.find(b => b.id === blockId)
  if (!block) return blocks
  const siblings = blocks.filter(b => b.parent_id === block.parent_id).sort((a, b) => a.position - b.position)
  const idx = siblings.findIndex(b => b.id === blockId)
  if (idx === 0) return blocks
  const prevSibling = siblings[idx - 1]
  const existingChildren = blocks.filter(b => b.parent_id === prevSibling.id)
  const maxPos = existingChildren.length > 0 ? Math.max(...existingChildren.map(b => b.position)) + 1 : 0
  return blocks.map(b =>
    b.id === blockId ? { ...b, parent_id: prevSibling.id, position: maxPos } : b
  )
}

export function addBlockAfter(blocks: Block[], afterId: string, type: BlockType): Block[] {
  const after = blocks.find(b => b.id === afterId)
  if (!after) return blocks
  const newBlock: Block = {
    id: crypto.randomUUID(),
    parent_id: after.parent_id,
    type,
    content: '',
    position: after.position + 0.5,
    ai_source: null,
    ai_edited: false,
  }
  return normalizePositions([...blocks, newBlock])
}

export function deleteBlock(blocks: Block[], blockId: string): Block[] {
  // Also delete all descendants
  const descendants = getAllDescendants(blocks, blockId)
  const idsToDelete = new Set([blockId, ...descendants.map(b => b.id)])
  return normalizePositions(blocks.filter(b => !idsToDelete.has(b.id)))
}

function getAllDescendants(blocks: Block[], parentId: string): Block[] {
  const children = blocks.filter(b => b.parent_id === parentId)
  return [...children, ...children.flatMap(c => getAllDescendants(blocks, c.id))]
}

export function updateBlock(blocks: Block[], blockId: string, updates: Partial<Block>): Block[] {
  return blocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
}
