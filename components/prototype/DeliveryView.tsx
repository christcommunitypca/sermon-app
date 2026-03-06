'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Block, BlockType, getSortedChildren } from '@/types/outline'
import { X, Timer } from 'lucide-react'

interface Props {
  blocks: Block[]
  onExit: () => void
}

type FontSize = 'small' | 'medium' | 'large'
const FONT_SIZES: Record<FontSize, string> = {
  small: '18px',
  medium: '22px',
  large: '28px',
}

const BLOCK_STYLES: Record<BlockType, { indent: string; weight: string; style: string; color: string; size: string }> = {
  point:        { indent: '0px',   weight: '700', style: 'normal',  color: '#0f172a', size: '1.15em' },
  sub_point:    { indent: '28px',  weight: '400', style: 'normal',  color: '#334155', size: '1em' },
  scripture:    { indent: '28px',  weight: '400', style: 'italic',  color: '#475569', size: '0.95em' },
  illustration: { indent: '28px',  weight: '400', style: 'normal',  color: '#92400e', size: '0.95em' },
  application:  { indent: '28px',  weight: '400', style: 'normal',  color: '#14532d', size: '0.95em' },
  transition:   { indent: '0px',   weight: '400', style: 'normal',  color: '#94a3b8', size: '0.85em' },
}

function flattenForDelivery(blocks: Block[], parentId: string | null = null, depth = 0): Block[] {
  return getSortedChildren(blocks, parentId).flatMap(b => [
    b,
    ...flattenForDelivery(blocks, b.id, depth + 1),
  ])
}

export function DeliveryView({ blocks, onExit }: Props) {
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('delivery-font-size') as FontSize) || 'medium'
    }
    return 'medium'
  })
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const flat = flattenForDelivery(blocks)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  const changeFontSize = useCallback((size: FontSize) => {
    setFontSize(size)
    localStorage.setItem('delivery-font-size', size)
  }, [])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div
      className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors min-h-[44px] min-w-[44px]"
          aria-label="Exit delivery mode"
        >
          <X className="w-5 h-5" />
          <span className="text-sm font-medium">Exit</span>
        </button>

        {/* Font size controls */}
        <div className="flex items-center gap-1">
          {(['small', 'medium', 'large'] as FontSize[]).map(size => (
            <button
              key={size}
              onClick={() => changeFontSize(size)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors min-h-[36px] ${
                fontSize === size ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {size === 'small' ? 'A' : size === 'medium' ? 'A' : 'A'}
            </button>
          ))}
        </div>

        {/* Timer */}
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] justify-end"
          aria-label={running ? 'Pause timer' : 'Resume timer'}
        >
          <Timer className={`w-4 h-4 ${running ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className={`font-mono text-sm font-semibold tabular-nums ${running ? 'text-slate-900' : 'text-slate-400'}`}>
            {mm}:{ss}
          </span>
        </button>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6"
        style={{ fontSize: FONT_SIZES[fontSize] }}
      >
        <div className="max-w-2xl mx-auto space-y-1">
          {flat.map((block, i) => {
            const s = BLOCK_STYLES[block.type]
            const isPoint = block.type === 'point'
            return (
              <div
                key={block.id}
                style={{
                  marginLeft: s.indent,
                  fontWeight: s.weight,
                  fontStyle: s.style,
                  color: s.color,
                  fontSize: s.size,
                  paddingTop: isPoint && i !== 0 ? '1.2em' : '0.25em',
                  paddingBottom: '0.25em',
                  lineHeight: '1.5',
                }}
              >
                {block.type === 'scripture' && (
                  <span className="text-indigo-400 text-xs font-normal not-italic mr-1.5 uppercase tracking-wide">Scripture</span>
                )}
                {block.type === 'illustration' && (
                  <span className="text-amber-500 text-xs font-normal mr-1.5 uppercase tracking-wide">Illustration</span>
                )}
                {block.type === 'application' && (
                  <span className="text-emerald-600 text-xs font-normal mr-1.5 uppercase tracking-wide">Application</span>
                )}
                {block.content || <span className="opacity-30 italic">Empty block</span>}
              </div>
            )
          })}
          {/* Bottom padding for scroll */}
          <div className="h-20" />
        </div>
      </div>
    </div>
  )
}
