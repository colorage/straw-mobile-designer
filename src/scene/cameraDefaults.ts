/** Default editor / gallery-thumbnail camera framing. */

export const DEFAULT_CAMERA_POSITION: [number, number, number] = [6.5, 4.5, 8]
export const DEFAULT_ORBIT_TARGET: [number, number, number] = [0, 2, 0]
export const DEFAULT_CAMERA_FOV = 42

/** Offset from orbit target to default camera position (default orbit angle). */
export const DEFAULT_ORBIT_OFFSET: [number, number, number] = [
  DEFAULT_CAMERA_POSITION[0] - DEFAULT_ORBIT_TARGET[0],
  DEFAULT_CAMERA_POSITION[1] - DEFAULT_ORBIT_TARGET[1],
  DEFAULT_CAMERA_POSITION[2] - DEFAULT_ORBIT_TARGET[2],
]
