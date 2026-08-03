import RAPIER from '@dimforge/rapier3d-compat'

let ready: Promise<void> | null = null

/**
 * Load Rapier WASM before React mounts.
 *
 * Production builds patch <Physics> to use the static Rapier module (see
 * vite.config.ts) instead of suspend-react + dynamic import. Pre-init here so
 * `new World(...)` is safe on the first Physics render.
 */
export function ensureRapier(): Promise<void> {
  if (!ready) {
    ready = RAPIER.init()
  }
  return ready
}
