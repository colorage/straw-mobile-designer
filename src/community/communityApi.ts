import { useAuthStore } from '../auth/authStore'
import { parseImportFile } from '../gallery/jsonIo'
import {
  GALLERY_FILE_FORMAT,
  GALLERY_FILE_VERSION,
  type GalleryEntry,
  type GalleryFileEnvelope,
} from '../gallery/types'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import {
  COMMENT_BODY_MAX,
  COMMENT_PHOTO_MAX_COUNT,
  compressCommentPhoto,
  commentPhotoPublicUrl,
  removeCommentPhotos,
  uploadCommentPhoto,
} from './commentPhotos'

export type CommunitySort = 'recent' | 'liked'

/** Community features share the same Supabase project as accounts. */
export const isCommunityEnabled = isSupabaseConfigured

/** Community card metadata; the heavy project snapshot is fetched on open. */
export interface CommunityProject {
  id: string
  name: string
  thumbnailDataUrl: string
  likesCount: number
  commentsCount: number
  publishedAt: string
  owner: string
  ownerNickname: string | null
}

export interface CommunityCommentPhoto {
  id: string
  storagePath: string
  publicUrl: string
  sortOrder: number
}

export interface CommunityComment {
  id: string
  projectId: string
  author: string
  authorNickname: string | null
  body: string
  createdAt: string
  photos: CommunityCommentPhoto[]
}

interface CommunityProjectRow {
  id: string
  name: string
  thumbnail_data_url: string
  likes_count: number
  comments_count: number
  published_at: string
  owner: string
  profiles: { nickname: string } | { nickname: string }[] | null
}

interface CommentPhotoRow {
  id: string
  storage_path: string
  sort_order: number
}

interface CommentRow {
  id: string
  project_id: string
  author: string
  body: string
  created_at: string
  profiles: { nickname: string } | { nickname: string }[] | null
  project_comment_photos: CommentPhotoRow[] | null
}

const LIST_COLUMNS =
  'id, name, thumbnail_data_url, likes_count, comments_count, published_at, owner, profiles(nickname)'

const COMMENT_COLUMNS =
  'id, project_id, author, body, created_at, profiles(nickname), project_comment_photos(id, storage_path, sort_order)'

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
    commentsCount: row.comments_count,
    publishedAt: row.published_at,
    owner: row.owner,
    ownerNickname: rowNickname(row.profiles),
  }
}

function requireSignedIn(
  message = 'Sign in to publish and like community mobiles.',
): string {
  const userId = useAuthStore.getState().user?.id
  if (!userId) {
    throw new Error(message)
  }
  return userId
}

function photoRowsToPhotos(rows: CommentPhotoRow[] | null): CommunityCommentPhoto[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      publicUrl: commentPhotoPublicUrl(row.storage_path),
      sortOrder: row.sort_order,
    }))
}

function rowToComment(row: CommentRow): CommunityComment {
  return {
    id: row.id,
    projectId: row.project_id,
    author: row.author,
    authorNickname: rowNickname(row.profiles),
    body: row.body,
    createdAt: row.created_at,
    photos: photoRowsToPhotos(row.project_comment_photos),
  }
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

/** Snapshot + like/comment counts for the community preview route. */
export interface PublicProjectDetail {
  envelope: GalleryFileEnvelope
  likesCount: number
  commentsCount: number
  owner: string
}

export async function fetchPublicProjectDetail(
  publicId: string,
): Promise<PublicProjectDetail> {
  const { data, error } = await requireSupabase()
    .from('public_projects')
    .select('name, project, published_at, likes_count, comments_count, owner')
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
    commentsCount: data.comments_count as number,
    owner: data.owner as string,
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

export async function fetchComments(projectId: string): Promise<CommunityComment[]> {
  const { data, error } = await requireSupabase()
    .from('project_comments')
    .select(COMMENT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as CommentRow[]).map(rowToComment)
}

export async function createComment(
  projectId: string,
  body: string,
  files: File[],
): Promise<CommunityComment> {
  const userId = requireSignedIn('Sign in to comment.')
  const trimmed = body.trim()
  if (trimmed.length > COMMENT_BODY_MAX) {
    throw new Error(`Comments can be at most ${COMMENT_BODY_MAX} characters.`)
  }
  if (!trimmed && files.length === 0) {
    throw new Error('Write a comment or add a photo.')
  }
  if (files.length > COMMENT_PHOTO_MAX_COUNT) {
    throw new Error(`Up to ${COMMENT_PHOTO_MAX_COUNT} photos per comment.`)
  }

  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('project_comments')
    .insert({ project_id: projectId, body: trimmed })
    .select('id, project_id, author, body, created_at')
    .single()
  if (error) throw new Error(error.message)

  const commentId = data.id as string
  const uploadedPaths: string[] = []
  try {
    const photos: CommunityCommentPhoto[] = []
    for (let i = 0; i < files.length; i++) {
      const photoId = crypto.randomUUID()
      const blob = await compressCommentPhoto(files[i])
      const path = await uploadCommentPhoto(userId, commentId, photoId, blob)
      uploadedPaths.push(path)
      const { data: photoRow, error: photoError } = await supabase
        .from('project_comment_photos')
        .insert({ comment_id: commentId, storage_path: path, sort_order: i })
        .select('id, storage_path, sort_order')
        .single()
      if (photoError) throw new Error(photoError.message)
      photos.push({
        id: photoRow.id as string,
        storagePath: photoRow.storage_path as string,
        publicUrl: commentPhotoPublicUrl(photoRow.storage_path as string),
        sortOrder: photoRow.sort_order as number,
      })
    }
    return {
      id: commentId,
      projectId,
      author: userId,
      authorNickname: useAuthStore.getState().profile?.nickname ?? null,
      body: trimmed,
      createdAt: data.created_at as string,
      photos,
    }
  } catch (err) {
    await supabase.from('project_comments').delete().eq('id', commentId)
    if (uploadedPaths.length > 0) {
      try {
        await removeCommentPhotos(uploadedPaths)
      } catch {
        // Row delete already cascades; Storage trigger also tries to clean up.
      }
    }
    throw err
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  requireSignedIn()
  const supabase = requireSupabase()
  const { data: photos } = await supabase
    .from('project_comment_photos')
    .select('storage_path')
    .eq('comment_id', commentId)
  const paths = ((photos as { storage_path: string }[] | null) ?? []).map(
    (row) => row.storage_path,
  )
  if (paths.length > 0) {
    try {
      await removeCommentPhotos(paths)
    } catch {
      // Project owners cannot delete another user's Storage objects; the SQL
      // trigger removes them when the comment row is deleted.
    }
  }
  const { error } = await supabase.from('project_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
}
