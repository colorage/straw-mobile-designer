import type { Connection, Shape, StrawSize } from '../state/types'

/** Durable design payload shared by the editor draft and gallery saves. */
export interface ProjectSnapshot {
  shapes: Shape[]
  connections: Connection[]
  strawSize: StrawSize
}

/** A named, thumbnail-backed save in the local gallery library. */
export interface GalleryEntry {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  thumbnailDataUrl: string
  project: ProjectSnapshot
}

export const GALLERY_FILE_FORMAT = 'straw-mobile-designer' as const
export const GALLERY_FILE_VERSION = 1 as const

/** Versioned JSON envelope for export / import files. */
export interface GalleryFileEnvelope {
  format: typeof GALLERY_FILE_FORMAT
  version: typeof GALLERY_FILE_VERSION
  name: string
  savedAt: string
  project: ProjectSnapshot
}
