import { useStrawMobileStore } from '../state/store'
import { getBodyRef } from './bodyRefRegistry'

/** Reads live Rapier poses into the store for the given shape ids (or every shape). */
export function syncShapeTransformsFromPhysics(shapeIds?: Iterable<string>) {
  const { shapes, setShapeTransform } = useStrawMobileStore.getState()
  const ids = shapeIds ? new Set(shapeIds) : null

  for (const shape of shapes) {
    if (ids && !ids.has(shape.id)) continue
    const body = getBodyRef(shape.id).current
    if (!body) continue
    const t = body.translation()
    const r = body.rotation()
    setShapeTransform(shape.id, [t.x, t.y, t.z], [r.x, r.y, r.z, r.w])
  }
}
