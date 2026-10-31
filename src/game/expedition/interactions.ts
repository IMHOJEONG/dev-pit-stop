import type { Resource } from '../resources/catalog';
import { STATIONS } from '../world/landmarks';
import type { ItemSystem } from '../items/item-system';
export type InteractionTarget =
  | { type: 'resource'; resource: Resource }
  | { type: 'station'; index: number }
  | { type: 'drop'; ids: string[] }
  | null;
export function findInteraction(
  position: { x: number; z: number; y?: number },
  resources: Resource[],
  collected: Set<number>,
  repaired: Set<number>,
  items?: ItemSystem,
): InteractionTarget {
  const drops = items?.nearby(position) ?? [];
  if (drops.length) return { type: 'drop', ids: drops.map((d) => d.id) };
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
