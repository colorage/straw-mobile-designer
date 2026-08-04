import { useSyncExternalStore } from 'react'
import type { WebGLRenderer } from 'three'
import { useStrawMobileStore } from '../state/store'

let softwareGL = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return softwareGL
}

function getServerSnapshot() {
  return false
}

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Detect software / SwiftShader WebGL where MeshStandardMaterial often shades
 * to near-black. Call once from Canvas onCreated.
 */
export function detectSoftwareGL(gl: WebGLRenderer) {
  const debug = gl.getContext()?.getExtension?.('WEBGL_debug_renderer_info')
  const renderer =
    (debug
      ? gl.getContext().getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getContext()?.getParameter?.(gl.getContext().RENDERER)) ?? ''
  const vendor =
    (debug
      ? gl.getContext().getParameter(debug.UNMASKED_VENDOR_WEBGL)
      : gl.getContext()?.getParameter?.(gl.getContext().VENDOR)) ?? ''
  const text = `${renderer} ${vendor}`.toLowerCase()
  const next =
    text.includes('swiftshader') ||
    text.includes('llvmpipe') ||
    text.includes('softpipe') ||
    text.includes('software')
  if (softwareGL === next) return
  softwareGL = next
  notify()
}

/** True when lit materials / shadow casting should be disabled for visibility. */
export function isSoftwareGL() {
  return softwareGL
}

/** React hook that re-renders when software-GL detection updates. */
export function useSoftwareGL() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** True when shadow maps / cast-receive should run (real GPU and turbo off). */
export function useShadowsEnabled() {
  const softwareGL = useSoftwareGL()
  const turboMode = useStrawMobileStore((s) => s.turboMode)
  return !softwareGL && !turboMode
}
