import { useEffect } from 'react'
import { syncShapeTransformsFromPhysics } from './syncTransforms'

/**
 * While gravity is live, poses only exist inside Rapier bodies. Keep the
 * autosaved project in sync on hide/unload so a reload resumes close to what
 * was on screen.
 */
export function usePhysicsPersistence() {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) syncShapeTransformsFromPhysics()
    }
    const syncAll = () => syncShapeTransformsFromPhysics()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', syncAll)
    window.addEventListener('beforeunload', syncAll)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', syncAll)
      window.removeEventListener('beforeunload', syncAll)
    }
  }, [])
}
