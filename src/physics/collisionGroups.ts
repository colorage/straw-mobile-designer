import { interactionGroups } from '@react-three/rapier'

/**
 * Connected shapes touch (and often overlap) each other's hull colliders right
 * at their shared joint point. Left alone, the collision solver keeps pushing
 * those hulls apart on every step while the joint pulls them back together,
 * and the resulting fight injects energy that compounds with every extra
 * link — a two-piece chain wobbles, a five-piece one flings itself apart.
 * Shapes only ever interact via their threaded joints, so they're put in a
 * group that only collides with the environment (ground), not each other.
 */
const SHAPE_GROUP = 0
const ENVIRONMENT_GROUP = 1

export const SHAPE_COLLISION_GROUPS = interactionGroups([SHAPE_GROUP], [ENVIRONMENT_GROUP])
export const ENVIRONMENT_COLLISION_GROUPS = interactionGroups([ENVIRONMENT_GROUP], [SHAPE_GROUP])
