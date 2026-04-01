import type { NodeRotation } from '../../graph-document/model/types';

export const DEFAULT_NODE_ROTATION: NodeRotation = 0;

export function normalizeNodeRotation(rotation?: NodeRotation): NodeRotation {
  return rotation ?? DEFAULT_NODE_ROTATION;
}

export function isQuarterTurnNodeRotation(rotation: NodeRotation): boolean {
  return rotation === 90 || rotation === 270;
}

export function rotateNodeRotation(rotation: NodeRotation, direction: 'left' | 'right'): NodeRotation {
  const orderedRotations: NodeRotation[] = [0, 90, 180, 270];
  const currentIndex = orderedRotations.indexOf(rotation);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === 'right' ? 1 : -1;
  const nextIndex = (safeIndex + delta + orderedRotations.length) % orderedRotations.length;
  return orderedRotations[nextIndex] ?? DEFAULT_NODE_ROTATION;
}
