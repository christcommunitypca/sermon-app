'use client'

import { useState, useRef, useEffect } from 'react'
import { BlockType } from '@/types/outline'
import { ChevronDown } from 'lucide-react'

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  point: 'Point',
  sub_point: 'Sub-point',
  scripture: 'Scripture',
  illustration: 'Illustration',
  application: 'Application',
  transition: 'Transition',
}

const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  point: 'text-slate-900',
  sub_point: 'text-slate-700',
  scripture: 'text-indigo-700',
  illustration: 'text-amber-700',
  application: 'text-emerald-700',
  transition: 'text-slate-500',
}

interface Props {
  value: BlockType
  onChange: (type: BlockType) => void
  compact?: boolean
}

export function BlockTypeSelector({ value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors ${BLOCK_TYPE_COLORS[value]}`}
      >
        {compact ? value.replace('_', ' ') : BLOCK_TYPE_LABELS[value]}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[130px]">
          {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map(type => (
            <button
              key={type}
              onClick={() => { onChange(type); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${BLOCK_TYPE_COLORS[type]} ${type === value ? 'font-semibold' : ''}`}
            >
              {BLOCK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
