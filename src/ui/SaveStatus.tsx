import { useEffect, useState } from 'react'
import { useStrawMobileStore } from '../state/store'

const RESTORED_MESSAGE_DURATION_MS = 5000

/**
 * Reminds people their work is saved automatically, and calls that out
 * explicitly right after a previous session's project comes back. Whether a
 * project was restored is captured once, on first render — by the time this
 * mounts, the store has already synchronously hydrated from localStorage
 * (see `state/store.ts`), so a non-empty `shapes` array here means this is a
 * returning session rather than a shape added moments ago.
 */
export function SaveStatus() {
  const [wasRestored] = useState(() => useStrawMobileStore.getState().shapes.length > 0)
  const [showRestoredMessage, setShowRestoredMessage] = useState(wasRestored)

  useEffect(() => {
    if (!showRestoredMessage) return
    const timer = setTimeout(() => setShowRestoredMessage(false), RESTORED_MESSAGE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [showRestoredMessage])

  return (
    <p className="save-status">
      {showRestoredMessage && 'Restored your draft from last time. '}
      Your draft autosaves in this browser. Use the Gallery below to keep named copies or export JSON.
    </p>
  )
}
