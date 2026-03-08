'use client'

import { useState, useCallback } from 'react'
import {
  BookText, Network, Church, Lightbulb, History,
  Building2, Newspaper, RefreshCw, AlertCircle, Sparkles
} from 'lucide-react'
import { ResearchItem as ResearchItemType, ResearchCategory } from '@/types/database'
import { ResearchItem } from './ResearchItem'

const TABS: {
  category: ResearchCategory
  label: string
  icon: typeof BookText
  description: string
  stubbed?: boolean
}[] = [
  { category: 'word_study',   label: 'Words',       icon: BookText,   description: 'Key Greek/Hebrew words and their meaning' },
  { category: 'related_text', label: 'Cross-refs',  icon: Network,    description: 'Related scriptures from across the Bible' },
  { category: 'theological',  label: 'Theology',    icon: Church,     description: 'Interpretation from your tradition and others' },
  { category: 'practical',    label: 'Practical',   icon: Lightbulb,  description: 'Applications, analogies, and explanatory insights' },
  { category: 'historical',   label: 'Historical',  icon: History,    description: 'Cultural context and interpretive history' },
  { category: 'denominational', label: 'Denom.',   icon: Building2,  description: 'Denominational discussions and trends', stubbed: true },
  { category: 'current_topic', label: 'Current',   icon: Newspaper,  description: 'Connections to current topics and conversations', stubbed: true },
]

interface Props {
  sessionId: string
  churchId: string
  churchSlug: string
  scriptureRef: string | null
  sessionTitle: string
  hasValidAIKey: boolean
  initialItems: ResearchItemType[]
}

export function ResearchWorkspace({
  sessionId, churchId, churchSlug, scriptureRef, sessionTitle, hasValidAIKey, initialItems
}: Props) {
  const [activeTab, setActiveTab] = useState<ResearchCategory>('word_study')
  const [items, setItems] = useState<ResearchItemType[]>(initialItems)
  const [generating, setGenerating] = useState<ResearchCategory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tabItems = items.filter(item => item.category === activeTab)
  const currentTab = TABS.find(t => t.category === activeTab)!
  const hasItems = tabItems.length > 0

  async function handleGenerate(replace = false) {
    if (!hasValidAIKey) return
    setGenerating(activeTab)
    setError(null)

    const res = await fetch('/api/ai/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        churchId,
        category: activeTab,
        replaceExisting: replace,
      }),
    })

    const data = await res.json()
    setGenerating(null)

    if (!res.ok || data.error) {
      setError(data.error ?? 'Generation failed')
      return
    }

    if (replace) {
      setItems(prev => [
        ...prev.filter(i => i.category !== activeTab),
        ...data.items,
      ])
    } else {
      setItems(prev => [...prev, ...data.items])
    }
  }

  function handleDismiss(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function handlePinToggle(id: string, isPinned: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_pinned: isPinned } : i))
  }

  // Sort: pinned first, then by position
  const sortedItems = [...tabItems].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    return a.position - b.position
  })

  if (!scriptureRef) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mb-3" />
        <h3 className="text-sm font-semibold text-slate-700 mb-1">No scripture reference</h3>
        <p className="text-sm text-slate-400 max-w-sm">
          Add a scripture reference to this session to use the research workspace.
        </p>
        <a
          href={`/${churchSlug}/teaching/${sessionId}/edit`}
          className="mt-4 text-sm text-violet-600 hover:text-violet-800 underline"
        >
          Edit session to add scripture
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Scripture context bar */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-blue-900">{scriptureRef}</span>
          <span className="text-xs text-blue-600 ml-2">— {sessionTitle}</span>
        </div>
        {!hasValidAIKey && (
          <a href={`/${churchSlug}/settings/ai`} className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg">
            Add AI key to enable research
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-6 scrollbar-none">
        {TABS.map(tab => {
          const count = items.filter(i => i.category === tab.category).length
          const Icon = tab.icon
          return (
            <button
              key={tab.category}
              onClick={() => { setActiveTab(tab.category); setError(null) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                activeTab === tab.category
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  activeTab === tab.category ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active panel */}
      <div>
        {/* Panel header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400">{currentTab.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasItems && !currentTab.stubbed && hasValidAIKey && (
              <button
                onClick={() => handleGenerate(true)}
                disabled={generating !== null}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                title="Regenerate (replaces existing)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generating === activeTab ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            )}
            {!currentTab.stubbed && hasValidAIKey && !hasItems && (
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {generating === activeTab ? 'Generating…' : 'Generate'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Stub panels */}
        {currentTab.stubbed && (
          <StubPanel category={activeTab} />
        )}

        {/* Loading state */}
        {generating === activeTab && !currentTab.stubbed && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state with generate CTA */}
        {!currentTab.stubbed && generating !== activeTab && !hasItems && (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-center">
            <currentTab.icon className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-1">{currentTab.description}</p>
            {hasValidAIKey ? (
              <p className="text-xs text-slate-400 mb-4">Click Generate to research this passage.</p>
            ) : (
              <p className="text-xs text-slate-400 mb-4">Add an AI key in Settings to use this feature.</p>
            )}
            {hasValidAIKey && (
              <button
                onClick={() => handleGenerate(false)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />Generate
              </button>
            )}
          </div>
        )}

        {/* Items */}
        {!currentTab.stubbed && generating !== activeTab && hasItems && (
          <div className="space-y-3">
            {sortedItems.map(item => (
              <ResearchItem
                key={item.id}
                item={item}
                sessionId={sessionId}
                churchId={churchId}
                churchSlug={churchSlug}
                onDismiss={handleDismiss}
                onPinToggle={handlePinToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stub panel for deferred categories ────────────────────────────────────────
function StubPanel({ category }: { category: ResearchCategory }) {
  const content = {
    denominational: {
      title: 'Denominational Context',
      description: "This panel will surface relevant denominational discussions, debates, and guidance for this passage — filtered by your theological tradition.",
      roadmap: [
        'Denominational position papers and confessional documents',
        'Recent denominational discussions on interpretive questions',
        'Commentary from recognized voices in your tradition',
      ],
    },
    current_topic: {
      title: 'Current Topics',
      description: "This panel will connect the text to relevant current conversations, cultural moments, and news — helping you make your preaching timely without compromising theological integrity.",
      roadmap: [
        'Topical connections to current events and cultural conversations',
        'Illustrations drawn from recent news',
        'Audience-relevant application prompts',
      ],
    },
  }

  const c = content[category as keyof typeof content]

  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
      <div className="max-w-sm mx-auto">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">{c?.title} — Coming soon</h3>
        <p className="text-sm text-slate-400 mb-5">{c?.description}</p>
        <div className="text-left space-y-2">
          {c?.roadmap.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
