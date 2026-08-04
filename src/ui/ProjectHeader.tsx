import { useEffect, useRef, useState } from 'react'
import { useStrawMobileStore } from '../state/store'

function formatAutosavedAgo(lastSavedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - lastSavedAt) / 1000))
  if (seconds < 45) return 'Autosaved just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return minutes <= 1 ? 'Autosaved 1 minute ago' : `Autosaved ${minutes} minutes ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return hours === 1 ? 'Autosaved 1 hour ago' : `Autosaved ${hours} hours ago`
  }
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Autosaved 1 day ago' : `Autosaved ${days} days ago`
}

/** Top-left project name (click to rename) and relative autosave status. */
export function ProjectHeader() {
  const projectName = useStrawMobileStore((s) => s.projectName)
  const lastSavedAt = useStrawMobileStore((s) => s.lastSavedAt)
  const setProjectName = useStrawMobileStore((s) => s.setProjectName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(projectName)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!editing) setDraft(projectName)
  }, [projectName, editing])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setProjectName(draft)
    setEditing(false)
  }

  const cancel = () => {
    setDraft(projectName)
    setEditing(false)
  }

  return (
    <div className="hud-cluster hud-top-left">
      {editing ? (
        <input
          ref={inputRef}
          className="hud-project-input"
          value={draft}
          aria-label="Project name"
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="hud-project-name"
          onClick={() => setEditing(true)}
          title="Rename project"
        >
          {projectName}
        </button>
      )}
      <p className="hud-autosave">{formatAutosavedAgo(lastSavedAt, now)}</p>
    </div>
  )
}
