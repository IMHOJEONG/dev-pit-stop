import { WORLD_SEED, rawTerrainHeight } from '../world/terrain';
import { STATIONS } from '../world/landmarks';
import { clearRouteResources } from '../world/routes';
import { random } from '../shared/math';
import type { Resource, ResourceKind } from './catalog';
export function isStationClearing(x: number, z: number) {
  return STATIONS.some((s) => Math.hypot(x - s.x, z - s.z) < 15) || Math.hypot(x, z - 195) < 10;
}
export function makeResourceLayout(seed = WORLD_SEED): Resource[] {
  const rng = random(seed);
  const result: Resource[] = [];
  const starters: [number, number, ResourceKind][] = [
    [9, 186, 'wood'],
    [-11, 180, 'wood'],
    [17, 171, 'wood'],
    [-8, 164, 'stone'],
    [8, 155, 'stone'],
    [-17, 157, 'crystal'],
  ];
  for (const [x, z, kind] of starters)
    result.push({ id: result.length, x, z, kind, scale: 0.85 + rng() * 0.35 });
  for (let i = 0; i < 1800; i++) {
    const x = (rng() - 0.5) * 1080;
    const z = (rng() - 0.5) * 1000;
    const h = rawTerrainHeight(x, z);
    if (h < 4 || h > 100 || isStationClearing(x, z)) continue;
    if (result.some((r) => Math.hypot(r.x - x, r.z - z) < 7)) continue;
    const kind: ResourceKind = i % 11 === 0 ? 'crystal' : i % 4 === 0 || h > 73 ? 'stone' : 'wood';
    result.push({ id: result.length, x, z, kind, scale: 0.7 + rng() * 0.85 });
  }
  return result;
}

export function makeResources(seed = WORLD_SEED): Resource[] {
  return clearRouteResources(makeResourceLayout(seed));
}
