import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  endFreeMoveDrag,
  getFreeMoveSession,
  setMoveCursor,
  updateFreeMoveDrag,
} from './freeMoveDrag'
import { endPhysicsGrab, getPhysicsGrab, updatePhysicsGrabTarget } from '../physics/physicsGrab'

/**
 * Window-level pointermove / pointerup for free kinematic moves and hanging grabs.
 * Individual meshes only call begin*; this controller owns the gesture lifetime.
 */
export function ObjectMoveController() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerMove = (event: PointerEvent) => {
      if (getFreeMoveSession()) {
        updateFreeMoveDrag(event.clientX, event.clientY, camera, canvas)
        setMoveCursor(true, true)
        return
      }
      if (getPhysicsGrab()) {
        updatePhysicsGrabTarget(event.clientX, event.clientY, camera, canvas)
        setMoveCursor(true, true)
      }
    }

    const onPointerUp = () => {
      if (getFreeMoveSession()) {
        endFreeMoveDrag()
        setMoveCursor(false)
      }
      if (getPhysicsGrab()) {
        endPhysicsGrab()
        setMoveCursor(false)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [gl, camera])

  return null
}
