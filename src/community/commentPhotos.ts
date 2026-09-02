import { requireSupabase } from '../lib/supabase'

export const COMMENT_PHOTO_BUCKET = 'comment-photos'
export const COMMENT_PHOTO_MAX_COUNT = 4
export const COMMENT_PHOTO_MAX_EDGE = 1600
export const COMMENT_PHOTO_JPEG_QUALITY = 0.8
export const COMMENT_PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const COMMENT_BODY_MAX = 2000

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function commentPhotoPublicUrl(path: string): string {
  return requireSupabase().storage.from(COMMENT_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

export function validateCommentPhotoFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('community.photoType')
  }
  if (file.size > COMMENT_PHOTO_MAX_INPUT_BYTES) {
    throw new Error('community.photoSize')
  }
}

/** Resize and re-encode a user photo as JPEG so Storage stays small. */
export async function compressCommentPhoto(file: File): Promise<Blob> {
  validateCommentPhotoFile(file)
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('community.photoProcess'))
      image.src = url
    })
    const scale = Math.min(
      1,
      COMMENT_PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    )
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('community.photoProcess')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('community.photoProcess')),
        'image/jpeg',
        COMMENT_PHOTO_JPEG_QUALITY,
      )
    })
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadCommentPhoto(
  userId: string,
  commentId: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${commentId}/${photoId}.jpg`
  const { error } = await requireSupabase()
    .storage.from(COMMENT_PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export async function removeCommentPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await requireSupabase().storage.from(COMMENT_PHOTO_BUCKET).remove(paths)
  if (error) throw new Error(error.message)
}

/** Best-effort Storage cleanup before account deletion. */
export async function purgeOwnCommentPhotos(userId: string): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('project_comments')
    .select('project_comment_photos(storage_path)')
    .eq('author', userId)
  if (error) throw new Error(error.message)
  const paths: string[] = []
  for (const row of data as { project_comment_photos: { storage_path: string }[] | null }[]) {
    for (const photo of row.project_comment_photos ?? []) {
      if (photo.storage_path) paths.push(photo.storage_path)
    }
  }
  await removeCommentPhotos(paths)
}
