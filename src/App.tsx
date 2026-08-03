import type { DragEvent } from 'react'
import { SHAPE_LABELS, type ShapeKind } from './geometry/primitives'
import { Experience } from './scene/Experience'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME, screenToWorkbenchPlane } from './scene/canvasBridge'
import { useStrawMobileStore } from './state/store'
import { ConnectionHint } from './ui/ConnectionHint'
import { GalleryPanel } from './ui/GalleryPanel'
import { ModeBar } from './ui/ModeBar'
import { SaveStatus } from './ui/SaveStatus'
import { ShapesList } from './ui/ShapesList'
import { SizeSelector } from './ui/SizeSelector'
import { StrawInventory } from './ui/StrawInventory'
import { Toolbar } from './ui/Toolbar'
import { ToolPanel } from './ui/ToolPanel'
import './ui/ui.css'

const SHAPE_KINDS = new Set<string>(Object.keys(SHAPE_LABELS))

function isShapeKind(value: string): value is ShapeKind {
  return SHAPE_KINDS.has(value)
}

function readDraggedShapeKind(dataTransfer: DataTransfer): ShapeKind | null {
  const custom = dataTransfer.getData(SHAPE_DRAG_MIME)
  if (isShapeKind(custom)) return custom
  const plain = dataTransfer.getData(SHAPE_DRAG_TEXT_MIME)
  if (isShapeKind(plain)) return plain
  return null
}

function App() {
  const addShape = useStrawMobileStore((s) => s.addShape)
  const activeTool = useStrawMobileStore((s) => s.activeTool)

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    const types = [...event.dataTransfer.types]
    if (!types.includes(SHAPE_DRAG_MIME) && !types.includes(SHAPE_DRAG_TEXT_MIME)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const kind = readDraggedShapeKind(event.dataTransfer)
    if (!kind) return

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
          Build a himmeli-style straw mobile — pieces hang and balance as you tie them to the hook.
        </p>
        <SaveStatus />
        <ToolPanel />
        <Toolbar />
        <SizeSelector />
        <ShapesList />
        <StrawInventory />
        <GalleryPanel />
        <ModeBar />
        <ConnectionHint />
      </aside>
      <main
        className={`canvas-area${activeTool === 'scissors' ? ' is-scissors' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Experience />
      </main>
    </div>
  )
}

export default App
