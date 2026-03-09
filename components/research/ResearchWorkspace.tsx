'use client'

import { generateResearchAction } from '@/app/actions/ai'

import { useState } from 'react'
import {
  BookText, Network, Church, Lightbulb, History,
  Building2, Newspaper, RefreshCw, AlertCircle, Sparkles, Settings
} from 'lucide-react'
import { ResearchItem as ResearchItemType, ResearchCategory } from '@/types/database'
import { ResearchItem } from './ResearchItem'
import Link from 'next/link'

// Tabs ordered by practical value for sermon prep. Stubs at end.
const TABS: {
  category: ResearchCategory
  label: string
  icon: typeof BookText
  description: string
  stubbed?: boolean
}[] = [
  { category: 'word_study',     label: 'Words',      icon: BookText,  description: 'Key words in the original language — Greek, Hebrew, Aramaic' },
  { category: 'related_text',   label: 'Cross-refs', icon: Network,   description: 'Related passages that strengthen or clarify this text' },
  { category: 'practical',      label: 'Practical',  icon: Lightbulb, description: 'Applications, analogies, and explanatory insights for preaching' },
  { category: 'theological',    label: 'Theology',   icon: Church,    description: 'Interpretation from your tradition and contrasting perspectives' },
  { category: 'historical',     label: 'Context',    icon: History,   description: 'Cultural background and interpretive history of this passage' },
  { category: 'denominational', label: 'Denom.',     icon: Building2, description: 'Denominational discussions and guidance — coming soon', stubbed: true },
  { category: 'current_topic',  label: 'Current',    icon: Newspaper, description: 'Connections to current conversations — coming soon', stubbed: true },
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

  const currentTab = TABS.find(t => t.category === activeTab)!
  const tabItems = items.filter(item => item.category === activeTab && !item.is_dismissed)
  const hasItems = tabItems.length > 0
  const isGeneratingThis = generating === activeTab

  // Derive counts once per render — no useCallback needed, items ref changes anyway
  const categoryCounts = TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.category] = items.filter(i => i.category === tab.category && !i.is_dismissed).length
    return acc
  }, {})

  async function handleGenerate(replace = false) {
    if (!hasValidAIKey || generating !== null) return
    setGenerating(activeTab)
    setError(null)

    let data: Awaited<ReturnType<typeof generateResearchAction>>
    try {
      data = await generateResearchAction({ sessionId, churchId, category: activeTab, replaceExisting: replace })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Try again.')
      setGenerating(null)
      return
    }
    setGenerating(null)

    if (data.error || !data.items) {
      setError(data.error ?? 'Generation failed. Try again.')
      return
    }

    setItems(prev =>
      replace
        ? [...prev.filter(i => i.category !== activeTab), ...data.items]
        : [...prev, ...data.items]
    )
  }

  function handleDismiss(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_dismissed: true } : i))
  }

  function handlePinToggle(id: string, isPinned: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_pinned: isPinned } : i))
  }

  // Pinned first, then by position
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
        <p className="text-sm text-slate-400 max-w-sm mb-4">
          Add a scripture reference to this session to use the research workspace.
        </p>
        <Link
          href={`/${churchSlug}/teaching/${sessionId}/edit`}
          className="text-sm text-violet-600 hover:text-violet-800 underline"
        >
          Edit session to add scripture
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Scripture context + AI key status */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Researching</p>
          <p className="text-sm font-semibold text-slate-900">{scriptureRef}</p>
          <p className="text-xs text-slate-400 mt-0.5">{sessionTitle}</p>
        </div>
        {!hasValidAIKey && (
          <Link
            href={`/${churchSlug}/settings/ai`}
            className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap"
          >
            <Settings className="w-3 h-3" />
            Add AI key
          </Link>
        )}
      </div>

      {/* Tab bar — scrollable on mobile */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-5 -mx-1 px-1 scrollbar-none">
        {TABS.map(tab => {
          const count = categoryCounts[tab.category] ?? 0
          const Icon = tab.icon
          return (
            <button
              key={tab.category}
              onClick={() => { setActiveTab(tab.category); setError(null) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                activeTab === tab.category
                  ? 'bg-slate-900 text-white'
                  : tab.stubbed
                  ? 'text-slate-300 hover:text-slate-400 hover:bg-slate-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium leading-none ${
                  activeTab === tab.category ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              )}
              {tab.stubbed && (
                <span className="text-xs opacity-40">·soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Panel */}
      <div>
        {/* Description + generate controls */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm">{currentTab.description}</p>

          {!currentTab.stubbed && hasValidAIKey && (
            <div className="flex items-center gap-2 shrink-0">
              {hasItems && (
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating !== null}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors"
                  title="Regenerate — replaces existing results"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingThis ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              )}
              {!hasItems && !isGeneratingThis && (
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={generating !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {/* Stubbed */}
        {currentTab.stubbed && <StubPanel category={activeTab} />}

        {/* Generating skeleton */}
        {!currentTab.stubbed && isGeneratingThis && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
            <p className="text-xs text-slate-400 text-center pt-1">Researching {scriptureRef}…</p>
          </div>
        )}

        {/* Empty state */}
        {!currentTab.stubbed && !isGeneratingThis && !hasItems && (
          <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-center px-4">
            <currentTab.icon className="w-7 h-7 text-slate-300 mb-2.5" />
            <p className="text-sm font-medium text-slate-600 mb-1">{currentTab.label}</p>
            <p className="text-xs text-slate-400 mb-4 max-w-xs">{currentTab.description}</p>
            {hasValidAIKey ? (
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating !== null}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {generating !== null ? 'Waiting…' : 'Generate'}
              </button>
            ) : (
              <Link
                href={`/${churchSlug}/settings/ai`}
                className="text-sm text-violet-600 hover:text-violet-800 underline"
              >
                Add an AI key to enable research
              </Link>
            )}
          </div>
        )}

        {/* Results */}
        {!currentTab.stubbed && !isGeneratingThis && hasItems && (
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

function StubPanel({ category }: { category: ResearchCategory }) {
  const content: Record<string, { title: string; description: string }> = {
    denominational: {
      title: 'Denominational Context',
      description: 'Denominational positions, confessional documents, and guidance for this passage — filtered to your tradition. Coming in a future update.',
    },
    current_topic: {
      title: 'Current Topics',
      description: 'Connections to current conversations and cultural moments — helping you make your preaching timely without compromising theological integrity. Coming in a future update.',
    },
  }
  const c = content[category]
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
      <h3 className="text-sm font-semibold text-slate-600 mb-2">{c?.title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mx-auto">{c?.description}</p>
    </div>
  )
}
