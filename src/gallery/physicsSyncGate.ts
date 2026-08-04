/**
 * Nestable gate for physics→store pose writes.
 * Kept in its own module so syncTransforms and autoPersist can share it
 * without an import cycle through galleryStore.
 */
let physicsTransformSyncDepth = 0

/** Mark the start of a physics pose sync write (nestable). */
export function beginPhysicsTransformSync(): void {
  physicsTransformSyncDepth += 1
}

/** Mark the end of a physics pose sync write. */
export function endPhysicsTransformSync(): void {
  physicsTransformSyncDepth = Math.max(0, physicsTransformSyncDepth - 1)
}

/** True while syncShapeTransformsFromPhysics is writing to the store. */
export function isPhysicsTransformSyncing(): boolean {
  return physicsTransformSyncDepth > 0
}
