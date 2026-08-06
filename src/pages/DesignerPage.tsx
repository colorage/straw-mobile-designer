import type { DragEvent } from 'react'
import { PRIMITIVE_GENERATORS, type PrimitiveKind } from '../geometry/primitives'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Experience } from '../scene/Experience'
import { SHAPE_DRAG_MIME, SHAPE_DRAG_TEXT_MIME, screenToWorkbenchPlane } from '../scene/canvasBridge'
import { useStrawMobileStore } from '../state/store'
import { GalleryExit } from '../ui/GalleryExit'
import { ModeBar } from '../ui/ModeBar'
import { OverlapScanSnackbar } from '../ui/OverlapScanSnackbar'
import { ProjectHeader } from '../ui/ProjectHeader'
import { SizeSelector } from '../ui/SizeSelector'
import { StrawInventory } from '../ui/StrawInventory'
import { Toolbar } from '../ui/Toolbar'

const SHAPE_KINDS = new Set<string>(Object.keys(PRIMITIVE_GENERATORS))

function isShapeKind(value: string): value is PrimitiveKind {
  return SHAPE_KINDS.has(value)
}

function readDraggedShapeKind(dataTransfer: DataTransfer): PrimitiveKind | null {
  const custom = dataTransfer.getData(SHAPE_DRAG_MIME)
  if (isShapeKind(custom)) return custom
  const plain = dataTransfer.getData(SHAPE_DRAG_TEXT_MIME)
  if (isShapeKind(plain)) return plain
  return null
}

export function DesignerPage() {
  useDocumentTitle('Павучы клуб')
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
      <main
        className={`canvas-area${activeTool === 'scissors' ? ' is-scissors' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Experience />
        <div className="hud-layer">
          <ProjectHeader />
          <Toolbar />
          <ModeBar />
          <GalleryExit />
          <SizeSelector />
          <StrawInventory />
          <OverlapScanSnackbar />
        </div>
      </main>
    </div>
  )
}
