import type { Resource } from '../resources/catalog';
import { STATIONS } from '../world/landmarks';
export type InteractionTarget =
  | { type: 'resource'; resource: Resource }
  | { type: 'station'; index: number }
  | null;
export function findInteraction(
  position: { x: number; z: number },
  resources: Resource[],
  collected: Set<number>,
  repaired: Set<number>,
): InteractionTarget {
  const index = STATIONS.findIndex(
    (s, i) => !repaired.has(i) && Math.hypot(position.x - s.x, position.z - s.z) < 11,
  );
  if (index >= 0) return { type: 'station', index };
  let target: InteractionTarget = null,
    distance = 7;
  for (const resource of resources) {
    if (collected.has(resource.id)) continue;
    const d = Math.hypot(resource.x - position.x, resource.z - position.z);
    if (d < distance) {
      distance = d;
      target = { type: 'resource', resource };
    }
  }
  return target;
}
