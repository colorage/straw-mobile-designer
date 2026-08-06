import { supabase } from '../lib/supabase'
import type { GalleryEntry, ProjectSnapshot } from './types'

interface ProjectRow {
  id: string
  name: string
  thumbnail_data_url: string | null
  project: ProjectSnapshot
  created_at: string
  updated_at: string
}

const PLACEHOLDER_THUMBNAIL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <rect width="320" height="200" fill="#1b1e29"/>
      <text x="160" y="105" text-anchor="middle" fill="#9298ab" font-family="system-ui,sans-serif" font-size="14">No preview</text>
    </svg>`,
  )

function rowToEntry(row: ProjectRow): GalleryEntry {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thumbnailDataUrl: row.thumbnail_data_url ?? PLACEHOLDER_THUMBNAIL,
    project: row.project,
  }
}

function entryToRow(entry: GalleryEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    name: entry.name,
    thumbnail_data_url: entry.thumbnailDataUrl,
    project: entry.project,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }
}

export async function fetchCloudEntries(): Promise<GalleryEntry[]> {
  if (!supabase) throw new Error('Accounts are unavailable.')
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, thumbnail_data_url, project, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as ProjectRow[]).map(rowToEntry)
}

export async function upsertCloudEntry(entry: GalleryEntry, userId: string): Promise<void> {
  if (!supabase) throw new Error('Accounts are unavailable.')
  const { error } = await supabase.from('projects').upsert(entryToRow(entry, userId))
  if (error) throw new Error(error.message)
}

export async function upsertCloudEntries(
  entries: GalleryEntry[],
  userId: string,
): Promise<void> {
  if (!supabase || entries.length === 0) return
  const { error } = await supabase
    .from('projects')
    .upsert(entries.map((entry) => entryToRow(entry, userId)))
  if (error) throw new Error(error.message)
}

export async function deleteCloudEntry(id: string): Promise<void> {
  if (!supabase) throw new Error('Accounts are unavailable.')
  // Confirm the row is visible first so a silent 0-row delete (typical when
  // RLS blocks) is not mistaken for success, while a retry after a real
  // delete stays idempotent.
  const { data: existing, error: readError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!existing) return

  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Could not delete that mobile from your account.')
  }
}
