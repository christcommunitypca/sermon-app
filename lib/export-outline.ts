// ── lib/export-outline.ts ─────────────────────────────────────────────────────
// Pure functions for formatting an outline for export (copy / Google Docs)

import type { OutlineBlock } from '@/types/database'
import { getFlatRenderOrder, getDepth } from '@/lib/outline'

export type BlockTypeKey = 'point' | 'sub_point' | 'scripture' | 'illustration' | 'application' | 'transition'

export interface ExportOptions {
  includeTypes: Record<BlockTypeKey, boolean>
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeTypes: {
    point:        true,
    sub_point:    true,
    scripture:    true,
    illustration: true,
    application:  true,
    transition:   false,
  },
}

export const EXPORT_TYPE_LABELS: Record<BlockTypeKey, string> = {
  point:        'Points',
  sub_point:    'Sub-points',
  scripture:    'Scripture',
  illustration: 'Illustrations',
  application:  'Applications',
  transition:   'Transitions',
}

// Strip markdown bold/italic for plain text
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
}

// ── Plain text (for clipboard / Proclaim) ────────────────────────────────────

export function formatOutlineAsText(
  blocks: OutlineBlock[],
  opts: ExportOptions,
): string {
  const flat = getFlatRenderOrder(blocks)
  const lines: string[] = []

  for (const block of flat) {
    if (!opts.includeTypes[block.type as BlockTypeKey]) continue
    const depth  = getDepth(blocks, block.id)
    const indent = '    '.repeat(depth)
    const text   = stripMarkdown(block.content.trim())
    if (!text) continue
    lines.push(`${indent}${text}`)
  }

  return lines.join('\n')
}

// ── Google Docs batchUpdate requests ─────────────────────────────────────────
// Returns an array of request objects for the Docs API batchUpdate endpoint.
// We insert all text first, then apply paragraph styles in a second pass.

export interface DocsRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export function buildDocsRequests(
  blocks:      OutlineBlock[],
  opts:        ExportOptions,
  title:       string,
  scriptureRef: string | null,
  dateStr:     string | null,
): DocsRequest[] {
  const flat = getFlatRenderOrder(blocks)
  const requests: DocsRequest[] = []

  // We'll build up the full body text then apply styles.
  // Docs API: index 1 is start of body (after implicit \n at 0).
  // We track current insertion index.
  let index = 1

  // Helper to insert text and return new index
  function insertText(text: string): number {
    requests.push({
      insertText: {
        location: { index },
        text,
      },
    })
    const newIndex = index + text.length
    index = newIndex
    return newIndex
  }

  // Helper to style a range
  function styleRange(start: number, end: number, namedStyleType: string, bold = false, fontSize?: number) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { namedStyleType },
        fields: 'namedStyleType',
      },
    })
    if (bold || fontSize) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end },
          textStyle: {
            ...(bold ? { bold } : {}),
            ...(fontSize ? { fontSize: { magnitude: fontSize, unit: 'PT' } } : {}),
          },
          fields: [bold ? 'bold' : '', fontSize ? 'fontSize' : ''].filter(Boolean).join(','),
        },
      })
    }
  }

  // Title
  const titleStart = index
  insertText(`${title}\n`)
  styleRange(titleStart, index, 'TITLE')

  // Subtitle: scripture ref + date
  const subtitleParts = [scriptureRef, dateStr].filter(Boolean).join('  ·  ')
  if (subtitleParts) {
    const subStart = index
    insertText(`${subtitleParts}\n`)
    styleRange(subStart, index, 'SUBTITLE')
  }

  // Spacer
  insertText('\n')

  // Blocks
  for (const block of flat) {
    if (!opts.includeTypes[block.type as BlockTypeKey]) continue
    const depth = getDepth(blocks, block.id)
    const text  = stripMarkdown(block.content.trim())
    if (!text) continue

    const blockStart = index
    insertText(`${text}\n`)

    if (block.type === 'point') {
      styleRange(blockStart, index, 'HEADING_2')
    } else {
      styleRange(blockStart, index, 'NORMAL_TEXT')
      // Indent sub-points and non-point blocks
      if (depth > 0 || true) {
        const indentPts = Math.min(depth, 4) * 18 + (depth === 0 ? 18 : 0)
        if (indentPts > 0) {
          requests.push({
            updateParagraphStyle: {
              range: { startIndex: blockStart, endIndex: index },
              paragraphStyle: {
                indentStart: { magnitude: indentPts, unit: 'PT' },
                indentFirstLine: { magnitude: indentPts, unit: 'PT' },
              },
              fields: 'indentStart,indentFirstLine',
            },
          })
        }
      }
      // Italic for scripture/illustration/application
      if (['scripture', 'illustration', 'application'].includes(block.type)) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: blockStart, endIndex: index - 1 },
            textStyle: { italic: true },
            fields: 'italic',
          },
        })
      }
    }
  }

  return requests
}