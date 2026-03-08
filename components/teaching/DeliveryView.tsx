'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Play, Pause, RotateCcw, ChevronLeft, Type } from 'lucide-react'
import { TeachingSession, OutlineBlock } from '@/types/database'
import { getFlatRenderOrder, getDepth } from '@/lib/outline'

const FONT_SIZES = ['text-lg', 'text-xl', 'text-2xl'] as const
type FontSize = typeof FONT_SIZES[number]

const BLOCK_TYPE_INDENT: Record<OutlineBlock['type'], string> = {
  point: '',
  sub_point: 'pl-6',
  scripture: 'pl-6',
  illustration: 'pl-6',
  application: 'pl-6',
  transition: '',
}

const BLOCK_TYPE_STYLE: Record<OutlineBlock['type'], string> = {
  point: 'font-semibold text-white',
  sub_point: 'text-slate-200',
  scripture: 'text-blue-200 italic',
  illustration: 'text-amber-200',
  application: 'text-emerald-200',
  transition: 'text-slate-400 text-sm',
}

interface Props {
  session: TeachingSession
  blocks: OutlineBlock[]
  churchSlug: string
}

export function DeliveryView({ session, blocks, churchSlug }: Props) {
  const [fontSize, setFontSize] = useState<FontSize>('text-xl')
  const [timerRunning, setTimerRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load font preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('delivery-font-size')
    if (saved && FONT_SIZES.includes(saved as FontSize)) {
      setFontSize(saved as FontSize)
    }
  }, [])

  function setAndSaveFont(size: FontSize) {
    setFontSize(size)
    localStorage.setItem('delivery-font-size', size)
  }

  // Timer
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed(e => e + 1)
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunning])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const estimated = session.estimated_duration
  const isOverTime = estimated ? elapsed > estimated * 60 : false
  const flat = getFlatRenderOrder(blocks)

  return (
    <div
      className="fixed inset-0 bg-slate-900 overflow-y-auto"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingLeft: 'max(env(safe-area-inset-left), 16px)',
        paddingRight: 'max(env(safe-area-inset-right), 16px)',
      }}
    >
      {/* Header bar */}
      <div className="sticky top-0 flex items-center justify-between mb-8 bg-slate-900 pb-3 border-b border-slate-800 z-10"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>

        {/* Exit */}
        <a
          href={`/${churchSlug}/teaching/${session.id}`}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
          aria-label="Exit delivery mode"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Exit</span>
        </a>

        {/* Timer */}
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-mono font-bold tabular-nums ${isOverTime ? 'text-red-400' : 'text-white'}`}>
            {formatTime(elapsed)}
          </span>
          {estimated && (
            <span className="text-xs text-slate-500">/ {estimated}m</span>
          )}
          <button
            onClick={() => setTimerRunning(v => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {timerRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={() => { setElapsed(0); setTimerRunning(false) }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Font size */}
        <div className="flex items-center gap-1">
          {FONT_SIZES.map((size, i) => (
            <button
              key={size}
              onClick={() => setAndSaveFont(size)}
              className={`w-7 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                fontSize === size ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
              style={{ fontSize: `${10 + i * 2}px` }}
            >
              A
            </button>
          ))}
        </div>
      </div>

      {/* Session header */}
      <div className="mb-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white leading-tight">{session.title}</h1>
        {session.scripture_ref && (
          <p className="text-blue-300 mt-2 text-xl">{session.scripture_ref}</p>
        )}
      </div>

      {/* Outline blocks — all visible, no editing */}
      <div className="max-w-3xl mx-auto space-y-3 pb-16">
        {flat.length === 0 ? (
          <p className="text-slate-500 text-center py-16">No outline for this session.</p>
        ) : (
          flat.map(block => {
            const depth = getDepth(blocks, block.id)
            return (
              <div
                key={block.id}
                className={`${BLOCK_TYPE_INDENT[block.type]} select-none`}
                style={{ paddingLeft: `${depth > 0 ? depth * 20 : 0}px` }}
              >
                <p className={`${fontSize} ${BLOCK_TYPE_STYLE[block.type]} leading-relaxed`}>
                  {block.content || <span className="opacity-30 italic">Empty block</span>}
                </p>
                {block.estimated_minutes && (
                  <p className="text-xs text-slate-600 mt-0.5">{block.estimated_minutes}m</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
