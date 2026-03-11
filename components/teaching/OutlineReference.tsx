'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { OutlineBlock, VerseNote } from '@/types/database'
import { createLocalBlock } from '@/lib/outline'

const CATEGORIES = [
  { key: 'word_study',            label: 'Word Study',          color: 'text-blue-600' },
  { key: 'cross_refs',            label: 'Cross-refs',          color: 'text-purple-600' },
  { key: 'practical',             label: 'Practical',           color: 'text-amber-600' },
  { key: 'theology_by_tradition', label: 'Theology/Tradition',  color: 'text-emerald-600' },
  { key: 'context',               label: 'Context',             color: 'text-orange-600' },
  { key: 'application',           label: 'Application',         color: 'text-rose-600' },
] as const

type Insights = Record<string, Record<string, { title: string; content: string }[]>>

interface Props {
  outlineId:    string
  insights:     Insights
  verseNotes:   Record<string, VerseNote[]>   // one array of notes per verse
  onAddToOutline: (block: OutlineBlock) => void
}

export function OutlineReference({ outlineId, insights, verseNotes, onAddToOutline }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Flatten all notes across all verses for the count
  const allNotes = Object.values(verseNotes).flat().filter(n => n.content.trim())
  const hasNotes    = allNotes.length > 0
  const hasInsights = Object.keys(insights).length > 0

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function addToOutline(content: string, type: OutlineBlock['type'] = 'point') {
    const block = createLocalBlock(outlineId, null, type, Date.now())
    onAddToOutline({ ...block, content })
  }

  return (
    <div className="space-y-2">

      {/* ── Verse Notes ─────────────────────────────────────────────────────── */}
      {hasNotes && (
        <CollapsibleSection
          id="verse-notes"
          label={`Verse Notes (${allNotes.length})`}
          labelColor="text-slate-700"
          collapsed={!!collapsed.has('verse-notes')}
          onToggle={() => toggle('verse-notes')}
        >
          <div className="space-y-3">
            {Object.entries(verseNotes).map(([ref, notes]) => {
              const activeNotes = notes.filter(n => n.content.trim())
              if (!activeNotes.length) return null
              return (
                <div key={ref}>
                  {/* Verse reference header */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    {ref}
                  </p>
                  {/* Each note is its own row with its own + button */}
                  <div className="space-y-1.5 pl-1">
                    {activeNotes.map(note => (
                      <div key={note.id} className="group relative flex items-start gap-2">
                        <p className="flex-1 text-sm text-slate-600 leading-relaxed pr-8">
                          {note.content}
                        </p>
                        {/* Used badge */}
                        {note.used_count > 0 && (
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full self-start mt-0.5">
                            {note.used_count}×
                          </span>
                        )}
                        {/* Add to outline */}
                        <button
                          onClick={() => addToOutline(`[${ref}] ${note.content}`, 'sub_point')}
                          className="absolute top-0 right-0 p-1 text-slate-300 hover:text-slate-700 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-all"
                          title="Add to outline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* ── No insights yet ──────────────────────────────────────────────────── */}
      {!hasInsights && (
        <div className="px-4 py-8 text-center text-xs text-slate-300">
          Switch to Verse by Verse to generate AI research insights
        </div>
      )}

      {/* ── One section per category ─────────────────────────────────────────── */}
      {CATEGORIES.map(cat => {
        const allItems: { verseRef: string; title: string; content: string }[] = []
        for (const [verseRef, cats] of Object.entries(insights)) {
          for (const item of cats[cat.key] ?? []) {
            allItems.push({ verseRef, ...item })
          }
        }
        if (!allItems.length) return null

        const sectionId = `cat-${cat.key}`
        return (
          <CollapsibleSection
            key={cat.key}
            id={sectionId}
            label={`${cat.label} (${allItems.length})`}
            labelColor={cat.color}
            collapsed={!!collapsed.has(sectionId)}
            onToggle={() => toggle(sectionId)}
          >
            <div className="space-y-3">
              {allItems.map((item, i) => (
                <div key={i} className="group relative border-l-2 border-slate-100 pl-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-slate-400 font-medium">{item.verseRef}</span>
                        {item.title && (
                          <span className="text-xs font-semibold text-slate-700">{item.title}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.content}</p>
                    </div>
                    <button
                      onClick={() => addToOutline(
                        item.title ? `${item.title} — ${item.content}` : item.content,
                        cat.key === 'application' ? 'application'
                          : cat.key === 'practical' ? 'illustration'
                          : 'sub_point'
                      )}
                      className="shrink-0 p-1.5 text-slate-300 hover:text-slate-700 hover:bg-slate-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Add to outline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )
      })}
    </div>
  )
}

// ── Collapsible section shell ──────────────────────────────────────────────────

function CollapsibleSection({
  id, label, labelColor, collapsed, onToggle, children,
}: {
  id: string
  label: string
  labelColor: string
  collapsed: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <span className={`text-xs font-bold uppercase tracking-wide ${labelColor}`}>{label}</span>
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-slate-300" />
          : <ChevronDown  className="w-4 h-4 text-slate-300" />
        }
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}