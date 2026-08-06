import { useAuthStore } from '../auth/authStore'
import { parseImportFile } from '../gallery/jsonIo'
import {
  GALLERY_FILE_FORMAT,
  GALLERY_FILE_VERSION,
  type GalleryEntry,
  type GalleryFileEnvelope,
} from '../gallery/types'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

export type CommunitySort = 'recent' | 'liked'

/** Community features share the same Supabase project as accounts. */
export const isCommunityEnabled = isSupabaseConfigured

/** Community card metadata; the heavy project snapshot is fetched on open. */
export interface CommunityProject {
  id: string
  name: string
  thumbnailDataUrl: string
  likesCount: number
  publishedAt: string
  owner: string
  ownerNickname: string | null
}

interface CommunityProjectRow {
  id: string
  name: string
  thumbnail_data_url: string
  likes_count: number
  published_at: string
  owner: string
  profiles: { nickname: string } | { nickname: string }[] | null
}

const LIST_COLUMNS =
  'id, name, thumbnail_data_url, likes_count, published_at, owner, profiles(nickname)'

function rowNickname(
  profiles: CommunityProjectRow['profiles'],
): string | null {
  if (!profiles) return null
  if (Array.isArray(profiles)) return profiles[0]?.nickname ?? null
  return profiles.nickname ?? null
}

function rowToProject(row: CommunityProjectRow): CommunityProject {
  return {
    id: row.id,
    name: row.name,
    thumbnailDataUrl: row.thumbnail_data_url,
    likesCount: row.likes_count,
    publishedAt: row.published_at,
    owner: row.owner,
    ownerNickname: rowNickname(row.profiles),
  }
}

function requireSignedIn(): string {
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    throw new Error('Sign in to publish and like community mobiles.')
  }
  return userId
}

/**
 * Publish a gallery entry (or refresh an already-published one).
 * Returns the public project id. Requires a signed-in account.
 */
export async function publishEntry(
  entry: GalleryEntry,
  existingPublicId?: string,
): Promise<string> {
  requireSignedIn()
  const supabase = requireSupabase()
  const payload = {
    name: entry.name,
    thumbnail_data_url: entry.thumbnailDataUrl,
    project: entry.project,
  }

  if (existingPublicId) {
    const { data, error } = await supabase
      .from('public_projects')
      .update(payload)
      .eq('id', existingPublicId)
      .select('id')
    if (error) throw new Error(error.message)
    // Row may have vanished (unpublished elsewhere) or belong to another
    // user (RLS returns no rows); fall through and publish fresh.
    if (data.length > 0) return existingPublicId
  }

  const { data, error } = await supabase
    .from('public_projects')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function unpublishProject(publicId: string): Promise<void> {
  requireSignedIn()
  const { error } = await requireSupabase()
    .from('public_projects')
    .delete()
    .eq('id', publicId)
  if (error) throw new Error(error.message)
}

export async function fetchCommunityProjects(
  sort: CommunitySort,
): Promise<CommunityProject[]> {
  let query = requireSupabase().from('public_projects').select(LIST_COLUMNS)
  query =
    sort === 'liked'
      ? query
          .order('likes_count', { ascending: false })
          .order('published_at', { ascending: false })
      : query.order('published_at', { ascending: false })
  const { data, error } = await query.limit(200)
  if (error) throw new Error(error.message)
  return (data as CommunityProjectRow[]).map(rowToProject)
}

/**
 * Fetch and validate the full snapshot for one public project.
 * Remote JSON goes through the same validation as file imports, and the
 * result plugs straight into the gallery import flow.
 */
export async function fetchProjectSnapshot(publicId: string): Promise<GalleryFileEnvelope> {
  const detail = await fetchPublicProjectDetail(publicId)
  return detail.envelope
}

/** Snapshot + like count for the community preview route. */
export interface PublicProjectDetail {
  envelope: GalleryFileEnvelope
  likesCount: number
}

export async function fetchPublicProjectDetail(
  publicId: string,
): Promise<PublicProjectDetail> {
  const { data, error } = await requireSupabase()
    .from('public_projects')
    .select('name, project, published_at, likes_count')
    .eq('id', publicId)
    .single()
  if (error) throw new Error(error.message)
  return {
    envelope: parseImportFile({
      format: GALLERY_FILE_FORMAT,
      version: GALLERY_FILE_VERSION,
      name: data.name,
      savedAt: data.published_at,
      project: data.project,
    }),
    likesCount: data.likes_count as number,
  }
}

/** Ids of public projects the current user liked; empty when signed out. */
export async function fetchMyLikes(userId: string): Promise<Set<string>> {
  const { data, error } = await requireSupabase()
    .from('project_likes')
    .select('project_id')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set((data as { project_id: string }[]).map((row) => row.project_id))
}

export async function likeProject(publicId: string): Promise<void> {
  requireSignedIn()
  const { error } = await requireSupabase()
    .from('project_likes')
    .insert({ project_id: publicId })
  // 23505 = already liked (duplicate key); treat as success.
  if (error && error.code !== '23505') throw new Error(error.message)
}

export async function unlikeProject(publicId: string): Promise<void> {
  const userId = requireSignedIn()
  const { error } = await requireSupabase()
    .from('project_likes')
    .delete()
    .eq('project_id', publicId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}
