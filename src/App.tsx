import type { DragEvent } from 'react'
import { SHAPE_LABELS, type ShapeKind } from './geometry/primitives'
import { Experience } from './scene/Experience'
import { SHAPE_DRAG_MIME, screenToWorkbenchPlane } from './scene/canvasBridge'
import { useStrawMobileStore } from './state/store'
import { ConnectionHint } from './ui/ConnectionHint'
import { ModeBar } from './ui/ModeBar'
import { SaveStatus } from './ui/SaveStatus'
import { ShapesList } from './ui/ShapesList'
import { SizeSelector } from './ui/SizeSelector'
import { StrawInventory } from './ui/StrawInventory'
import { Toolbar } from './ui/Toolbar'
import './ui/ui.css'

const SHAPE_KINDS = new Set<string>(Object.keys(SHAPE_LABELS))

function isShapeKind(value: string): value is ShapeKind {
  return SHAPE_KINDS.has(value)
}

function App() {
  const mode = useStrawMobileStore((s) => s.mode)
  const addShape = useStrawMobileStore((s) => s.addShape)

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (mode !== 'build') return
    if (![...event.dataTransfer.types].includes(SHAPE_DRAG_MIME)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (mode !== 'build') return
    const kind = event.dataTransfer.getData(SHAPE_DRAG_MIME)
    if (!isShapeKind(kind)) return

    event.preventDefault()
    const position = screenToWorkbenchPlane(event.clientX, event.clientY)
    if (!position) return
    addShape(kind, position)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="app-title">Straw Mobile Designer</h1>
        <p className="app-subtitle">
          Build a himmeli-style straw mobile, then let gravity hang and balance it.
        </p>
        <SaveStatus />
        <Toolbar />
        <SizeSelector />
        <ShapesList />
        <StrawInventory />
        <ModeBar />
        <ConnectionHint />
      </aside>
      <main className="canvas-area" onDragOver={handleDragOver} onDrop={handleDrop}>
        <Experience />
      </main>
    </div>
  )
}

export default App
