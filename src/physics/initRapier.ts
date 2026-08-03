import RAPIER from '@dimforge/rapier3d-compat'

let ready: Promise<void> | null = null

/**
 * Load Rapier WASM before React mounts.
 *
 * @react-three/rapier's <Physics> suspends until init finishes. Pre-loading
 * makes that suspend a no-op so shapes/anchor appear on the first paint
 * instead of after a late Suspense resolve.
 */
export function ensureRapier(): Promise<void> {
  if (!ready) {
    ready = RAPIER.init()
  }
  return ready
}
