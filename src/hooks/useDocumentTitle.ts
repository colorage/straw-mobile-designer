import { useEffect } from 'react'

/** Set document.title for the active route (SPA has no SSR head). */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
