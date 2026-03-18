'use server'
// ── app/actions/google-docs.ts ────────────────────────────────────────────────
// Creates a Google Doc from an outline using the user's Google OAuth token.
// Requires the user to have connected Google with Docs + Drive scopes.

import { createClient } from '@/lib/supabase/server'
import type { OutlineBlock } from '@/types/database'
import { buildDocsRequests, type ExportOptions } from '@/lib/export-outline'

export async function createGoogleDocAction(payload: {
  blocks:       OutlineBlock[]
  opts:         ExportOptions
  title:        string
  scriptureRef: string | null
  dateStr:      string | null
}): Promise<{ docUrl: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return { error: 'Not authenticated' }

  const token = (session as any).provider_token as string | undefined
  if (!token) {
    return { error: 'NO_GOOGLE_TOKEN' }
  }

  const { blocks, opts, title, scriptureRef, dateStr } = payload

  try {
    // 1. Create the document
    const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      if (createRes.status === 401) return { error: 'NO_GOOGLE_TOKEN' }
      return { error: `Failed to create document: ${err}` }
    }

    const doc = await createRes.json()
    const documentId: string = doc.documentId

    // 2. Build and apply content via batchUpdate
    const requests = buildDocsRequests(blocks, opts, title, scriptureRef, dateStr)

    if (requests.length > 0) {
      const updateRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests }),
        },
      )

      if (!updateRes.ok) {
        const err = await updateRes.text()
        console.error('Docs batchUpdate failed:', err)
        // Doc was created, just formatting failed — still return the URL
      }
    }

    return { docUrl: `https://docs.google.com/document/d/${documentId}/edit` }
  } catch (err) {
    console.error('createGoogleDocAction error:', err)
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
