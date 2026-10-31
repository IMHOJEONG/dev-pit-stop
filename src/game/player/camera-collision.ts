import { clamp } from '../shared/math';
import { landSurface as terrainHeight } from '../world/routes';
import type { Resource } from '../resources/catalog';
/** Conservative canopy/rock bounds keep the third-person camera out of scenery. */
export function cameraClearance(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  resources: Resource[],
  collected: Set<number>,
): number {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return 1;
  let fraction = 1;
  for (const r of resources) {
    if (collected.has(r.id)) continue;
    const radius = (r.kind === 'wood' ? 4.4 : 2.7) * r.scale + 1;
    const along = ((r.x - from.x) * dx + (r.z - from.z) * dz) / length;
    if (along < 0 || along > length + radius) continue;
    const perpendicular = (r.x - from.x) ** 2 + (r.z - from.z) ** 2 - along ** 2;
    if (perpendicular >= radius ** 2) continue;
    const entry = clamp((along - Math.sqrt(radius ** 2 - perpendicular)) / length, 0, 1);
    const height = from.y + (to.y - from.y) * entry;
    const ground = terrainHeight(r.x, r.z);
    if (height > ground - 1 && height < ground + (r.kind === 'wood' ? 17 : 5) * r.scale + 1)
      fraction = Math.min(fraction, Math.max(0.18, entry - 2 / length));
  }
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    if (t > fraction) break;
    const h = from.y + (to.y - from.y) * t;
    if (h < terrainHeight(from.x + dx * t, from.z + dz * t) + 1.5) {
      fraction = Math.max(0.18, t - 0.08);
      break;
    }
  }
  return fraction;
}
