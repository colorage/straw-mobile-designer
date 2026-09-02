import { useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../gallery/galleryStore'
import { useT } from '../i18n/t'
import { useStrawMobileStore } from '../state/store'

function formatAutosavedAgo(lastSavedAt: number, now: number, t: ReturnType<typeof useT>): string {
  const seconds = Math.max(0, Math.floor((now - lastSavedAt) / 1000))
  if (seconds < 45) return t('project.autosavedJustNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('project.autosavedMinutes', { count: Math.max(1, minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('project.autosavedHours', { count: hours })
  const days = Math.floor(hours / 24)
  return t('project.autosavedDays', { count: days })
}

/** Top-left project name (click to rename) and relative autosave status. */
export function ProjectHeader() {
  const t = useT()
  const projectName = useStrawMobileStore((s) => s.projectName)
  const lastSavedAt = useStrawMobileStore((s) => s.lastSavedAt)
  const setProjectName = useStrawMobileStore((s) => s.setProjectName)
  const activeGalleryId = useGalleryStore((s) => s.activeGalleryId)
  const renameEntry = useGalleryStore((s) => s.renameEntry)
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
    if (activeGalleryId) {
      const trimmed = draft.trim()
      if (trimmed) renameEntry(activeGalleryId, trimmed)
    }
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
          aria-label={t('project.name')}
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
          title={t('project.rename')}
        >
          {projectName}
        </button>
      )}
      <p className="hud-autosave">{formatAutosavedAgo(lastSavedAt, now, t)}</p>
    </div>
  )
}
