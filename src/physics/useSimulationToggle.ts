import { useEffect } from 'react'
import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'
import { computeRestingPositions } from './restingLayout'

/** Reads every shape's live translation/rotation out of Rapier and freezes it into the store. */
function syncShapeTransformsFromPhysics() {
  const { shapes, setShapeTransform } = useStrawMobileStore.getState()
  for (const shape of shapes) {
    const body = getBodyRef(shape.id).current
    if (!body) continue
    const t = body.translation()
    const r = body.rotation()
    setShapeTransform(shape.id, [t.x, t.y, t.z], [r.x, r.y, r.z, r.w])
  }
}

/**
 * Bridges the UI (outside the Canvas) with the live physics bodies (inside
 * it). Stopping the simulation reads each shape's current translation/rotation
 * straight from Rapier and freezes it into the store before switching back to
 * build mode, so editing continues from wherever the mobile settled.
 */
export function useSimulationToggle() {
  const mode = useStrawMobileStore((s) => s.mode)

  // The store (and its localStorage autosave) only ever holds each shape's
  // position from the *last* explicit "Back to Build" — while gravity is
  // actively simulating, the live pose only exists inside Rapier's bodies.
  // Closing the tab or reloading mid-swing would otherwise silently lose
  // that settled pose and resume from wherever the mobile was before
  // simulating. Keep the saved project in sync with reality while
  // simulating so a reload always resumes close to what was on screen.
  useEffect(() => {
    if (mode !== 'simulate') return
    const handleVisibilityChange = () => {
      if (document.hidden) syncShapeTransformsFromPhysics()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', syncShapeTransformsFromPhysics)
    window.addEventListener('beforeunload', syncShapeTransformsFromPhysics)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', syncShapeTransformsFromPhysics)
      window.removeEventListener('beforeunload', syncShapeTransformsFromPhysics)
    }
  }, [mode])

  const startSimulating = () => {
    const { shapes, connections, setShapeTransform, setMode } = useStrawMobileStore.getState()
    const restingPositions = computeRestingPositions(shapes, connections)
    for (const [shapeId, position] of restingPositions) {
      const shape = shapes.find((s) => s.id === shapeId)
      if (shape) setShapeTransform(shapeId, position, shape.quaternion)
    }
    setMode('simulate')
  }

  const stopSimulating = () => {
    syncShapeTransformsFromPhysics()
    useStrawMobileStore.getState().setMode('build')
  }

  return { mode, startSimulating, stopSimulating }
}
