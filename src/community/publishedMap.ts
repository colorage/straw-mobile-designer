import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const PUBLISHED_MAP_STORAGE_KEY = 'straw-mobile-designer/published-map'

export interface PublishedRecord {
  publicId: string
  publishedAt: string
}

interface PublishedMapState {
  /** Local gallery entry id -> public community project record. */
  published: Record<string, PublishedRecord>

  markPublished: (localId: string, publicId: string) => void
  markUnpublished: (localId: string) => void
}

/**
 * Remembers which local gallery entries this browser has published, so
 * gallery cards can show Publish vs Update/Unpublish and re-publishing
 * overwrites the same public row.
 */
export const usePublishedMapStore = create<PublishedMapState>()(
  persist(
    (set) => ({
      published: {},

      markPublished: (localId, publicId) =>
        set((state) => ({
          published: {
            ...state.published,
            [localId]: { publicId, publishedAt: new Date().toISOString() },
          },
        })),

      markUnpublished: (localId) =>
        set((state) => {
          const next = { ...state.published }
          delete next[localId]
          return { published: next }
        }),
    }),
    {
      name: PUBLISHED_MAP_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
