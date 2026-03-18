'use client'

import { useState } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import { addTagToSessionAction, removeTagFromSessionAction, createTagAction } from '@/app/(app)/[churchSlug]/teaching/[sessionId]/tag-actions'

interface TagRow { id: string; tag_id: string; is_ai_suggested: boolean; tags: any }
interface TaxonomyRow { id: string; name: string; slug: string }
interface TagData { id: string; label: string; slug: string; taxonomy_id: string; tag_taxonomies: any }

interface Props {
  sessionId: string
  churchId: string
  churchSlug: string
  initialContentTags: TagRow[]
  allTags: TagData[]
  taxonomies: TaxonomyRow[]
}

export function TagManager({
  sessionId, churchId, churchSlug,
  initialContentTags, allTags, taxonomies
}: Props) {
  const [contentTags, setContentTags] = useState(initialContentTags)
  const [newLabel, setNewLabel] = useState('')
  const [selectedTaxonomy, setSelectedTaxonomy] = useState(taxonomies[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appliedTagIds = new Set(contentTags.map(ct => ct.tag_id))
  const unappliedTags = allTags.filter(t => !appliedTagIds.has(t.id))

  async function handleAdd(tagId: string) {
    setError(null)
    const result = await addTagToSessionAction(sessionId, churchId, tagId, churchSlug)
    if (!result.error) {
      const tag = allTags.find(t => t.id === tagId)
      if (tag) {
        setContentTags(prev => [...prev, {
          id: `local-${Date.now()}`,
          tag_id: tagId,
          is_ai_suggested: false,
          tags: tag,
        }])
      }
    } else {
      setError(result.error)
    }
  }

  async function handleRemove(contentTagId: string) {
    const result = await removeTagFromSessionAction(contentTagId, sessionId, churchSlug)
    if (!result.error) {
      setContentTags(prev => prev.filter(ct => ct.id !== contentTagId))
    }
  }

  async function handleCreateAndAdd() {
    if (!newLabel.trim()) return
    setAdding(true)
    setError(null)

    const createResult = await createTagAction(churchId, selectedTaxonomy, newLabel, churchSlug)
    if (createResult.error) {
      setError(createResult.error)
      setAdding(false)
      return
    }

    const addResult = await addTagToSessionAction(sessionId, churchId, createResult.tagId!, churchSlug)
    if (!addResult.error) {
      setContentTags(prev => [...prev, {
        id: `local-${Date.now()}`,
        tag_id: createResult.tagId!,
        is_ai_suggested: false,
        tags: { id: createResult.tagId!, label: newLabel, slug: '', taxonomy_id: selectedTaxonomy, tag_taxonomies: { name: taxonomies.find(t => t.id === selectedTaxonomy)?.name } },
      }])
      setNewLabel('')
    }
    setAdding(false)
  }

  // Group applied tags by taxonomy
  const grouped = taxonomies.map(tax => ({
    taxonomy: tax,
    tags: contentTags.filter(ct => ct.tags?.taxonomy_id === tax.id),
  })).filter(g => g.tags.length > 0)

  return (
    <div className="space-y-6">
      {/* Applied tags */}
      {contentTags.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No tags yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.taxonomy.id}>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{g.taxonomy.name}</p>
              <div className="flex flex-wrap gap-2">
                {g.tags.map(ct => (
                  <span
                    key={ct.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 text-sm rounded-full"
                  >
                    {ct.tags?.label}
                    {ct.is_ai_suggested && (
                      <span className="text-xs text-violet-500">AI</span>
                    )}
                    <button onClick={() => handleRemove(ct.id)} className="text-slate-400 hover:text-slate-700">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add existing tag */}
      {unappliedTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Add tag</p>
          <div className="flex flex-wrap gap-1.5">
            {unappliedTags.slice(0, 30).map(tag => (
              <button
                key={tag.id}
                onClick={() => handleAdd(tag.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new tag */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Create new tag</p>
        <div className="flex items-center gap-2">
          <select
            value={selectedTaxonomy}
            onChange={e => setSelectedTaxonomy(e.target.value)}
            className="text-sm px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {taxonomies.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
            placeholder="Tag label"
            className="flex-1 text-sm px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <button
            onClick={handleCreateAndAdd}
            disabled={!newLabel.trim() || adding}
            className="px-3 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
