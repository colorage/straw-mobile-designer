import type { Vector3Tuple } from '../geometry/primitives'

export type QuatTuple = [number, number, number, number]

type MeshDriver = (position: Vector3Tuple, quaternion?: QuatTuple) => void

/** Imperative mesh movers keyed by shape id — used while reeling so visuals track without waiting on React. */
const drivers = new Map<string, MeshDriver>()

export function registerMeshDriver(shapeId: string, driver: MeshDriver) {
  drivers.set(shapeId, driver)
  return () => {
    if (drivers.get(shapeId) === driver) drivers.delete(shapeId)
  }
}

export function driveMesh(shapeId: string, position: Vector3Tuple, quaternion?: QuatTuple) {
  drivers.get(shapeId)?.(position, quaternion)
}
