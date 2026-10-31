import { WORLD_PLACES } from './places';
import { STATIONS, LAUNCH } from './landmarks';
import { terrainHeight } from './terrain';
import { smoothstep } from '../shared/math';
export interface RoutePoint {
  x: number;
  z: number;
}
export interface WorldRoute {
  id: string;
  name: string;
  kind: 'road' | 'bridge' | 'trail';
  width: number;
  points: RoutePoint[];
  level?: boolean;
}
const points = (values: number[][]) => values.map(([x, z]) => ({ x, z }));
const stationApproach = (index: number) => ({ x: STATIONS[index].x, z: STATIONS[index].z + 20 });
export const WORLD_ROUTES: WorldRoute[] = [
  {
    id: 'lift-bypass',
    name: '상승장 우회로',
    kind: 'road',
    width: 6,
    points: points([
      [-35, 147],
      [-52, 140],
      [-59, 128],
      [-59, 115],
      [-51, 109],
    ]),
  },
  {
    id: 'camp-ridge',
    name: '바람 초원길',
    kind: 'road',
    width: 6,
    points: [
      ...points([
        [0, 195],
        [-25, 171],
        [-35, 147],
      ]),
      LAUNCH,
      ...points([[-51, 109]]),
      stationApproach(0),
    ],
  },
  {
    id: 'lake-south',
    name: '호수 남쪽길',
    kind: 'road',
    width: 6,
    points: points([
      [0, 195],
      [38, 171],
      [76, 151],
      [110, 139],
      [125, 130],
    ]),
  },
  {
    id: 'mirror-bridge',
    name: '거울 호수 다리',
    kind: 'bridge',
    width: 5.8,
    points: points([
      [125, 130],
      [125, -18],
    ]),
  },
  {
    id: 'lakewatch',
    name: '망루 오름길',
    kind: 'road',
    width: 6,
    points: [
      ...points([
        [125, -18],
        [151, -33],
        [174, -58],
        [180, -78],
      ]),
      stationApproach(1),
    ],
  },
  {
    id: 'forest-crossing',
    name: '속삭임 숲길',
    kind: 'road',
    width: 5.5,
    points: [
      ...points([
        [-65, 95],
        [-92, 43],
        [-107, -18],
        [-102, -60],
        [-49, -92],
        [14, -111],
        [78, -103],
        [133, -96],
      ]),
      stationApproach(1),
    ],
  },
  {
    id: 'mountain-pass',
    name: '구름 고갯길',
    kind: 'trail',
    width: 4.5,
    points: [
      ...points([
        [-102, -60],
        [-148, -100],
        [-193, -125],
        [-231, -153],
        [-229, -188],
      ]),
      stationApproach(2),
    ],
  },
  {
    id: 'west-loop',
    name: '서쪽 해안길',
    kind: 'trail',
    width: 4.5,
    points: points([
      [-65, 95],
      [-126, 128],
      [-213, 149],
      [-305, 154],
      [-344, 83],
      [-346, 2],
      [-300, -105],
      [-236, -115],
      [-193, -125],
    ]),
  },
  {
    id: 'east-loop',
    name: '동쪽 능선길',
    kind: 'road',
    width: 5.5,
    points: [
      ...points([
        [76, 151],
        [159, 170],
        [250, 180],
        [301, 135],
        [305, 58],
        [278, -11],
        [231, -58],
      ]),
      stationApproach(1),
    ],
  },
  {
    id: 'lake-deck',
    name: '호수 전망 데크',
    kind: 'bridge',
    width: 4.8,
    level: true,
    points: points([
      [55, 58],
      [86, 58],
    ]),
  },
  {
    id: 'lake-west',
    name: '호숫가 산책로',
    kind: 'trail',
    width: 4,
    points: points([
      [-107, -18],
      [-29, 15],
      [24, 49],
      [55, 58],
      [56, 104],
      [76, 151],
    ]),
  },
  {
    id: 'north-ruins',
    name: '북쪽 옛길',
    kind: 'trail',
    width: 4,
    points: points([
      [-49, -92],
      [-45, -170],
      [-8, -231],
      [40, -330],
      [104, -276],
      [155, -219],
      [179, -155],
      [180, -90],
    ]),
  },
];
export interface RouteSegment {
  route: WorldRoute;
  index: number;
  a: RoutePoint;
  b: RoutePoint;
  ay: number;
  by: number;
  length: number;
}
export const ROUTE_SEGMENTS: RouteSegment[] = [];
for (const route of WORLD_ROUTES) {
  let index = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i],
      b = route.points[i + 1],
      distance = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.ceil(distance / 3);
    for (let j = 0; j < count; j++) {
      const t = j / count,
        u = (j + 1) / count;
      const start = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
        end = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      const height = (p: RoutePoint, progress: number) =>
        route.kind === 'bridge'
          ? route.level
            ? terrainHeight(route.points[0].x, route.points[0].z) + 0.12
            : terrainHeight(route.points[0].x, route.points[0].z) * (1 - progress) +
              terrainHeight(route.points.at(-1)!.x, route.points.at(-1)!.z) * progress +
              0.12
          : terrainHeight(p.x, p.z) + 0.06;
      ROUTE_SEGMENTS.push({
        route,
        index: index++,
        a: start,
        b: end,
        ay: height(start, t),
        by: height(end, u),
        length: distance / count,
      });
    }
  }
}
// A small spatial index makes terrain/map sampling independent of the total route count.
const CELL = 32,
  grid = new Map<string, RouteSegment[]>();
for (const segment of ROUTE_SEGMENTS) {
  const margin = segment.route.width / 2 + 5;
  for (
    let x = Math.floor((Math.min(segment.a.x, segment.b.x) - margin) / CELL);
    x <= Math.floor((Math.max(segment.a.x, segment.b.x) + margin) / CELL);
    x++
  )
    for (
      let z = Math.floor((Math.min(segment.a.z, segment.b.z) - margin) / CELL);
      z <= Math.floor((Math.max(segment.a.z, segment.b.z) + margin) / CELL);
      z++
    ) {
      const key = `${x},${z}`;
      const list = grid.get(key) ?? [];
      list.push(segment);
      grid.set(key, list);
    }
}
export interface RouteProjection {
  segment: RouteSegment;
  t: number;
  x: number;
  z: number;
  height: number;
  distance: number;
}
export function nearestRoute(
  x: number,
  z: number,
  kind?: 'ground' | 'bridge',
): RouteProjection | null {
  let result: RouteProjection | null = null;
  for (const segment of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    if (
      (kind === 'ground' && segment.route.kind === 'bridge') ||
      (kind === 'bridge' && segment.route.kind !== 'bridge')
    )
      continue;
    const dx = segment.b.x - segment.a.x,
      dz = segment.b.z - segment.a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / segment.length ** 2),
    );
    const px = segment.a.x + dx * t,
      pz = segment.a.z + dz * t,
      distance = Math.hypot(x - px, z - pz);
    if (!result || distance < result.distance)
      result = {
        segment,
        t,
        x: px,
        z: pz,
        height: segment.ay + (segment.by - segment.ay) * t,
        distance,
      };
  }
  return result;
}
export function landSurface(x: number, z: number) {
  const natural = terrainHeight(x, z);
  const projections = new Map<WorldRoute, { distance: number; height: number }>();
  for (const segment of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    if (segment.route.kind === 'bridge') continue;
    const dx = segment.b.x - segment.a.x,
      dz = segment.b.z - segment.a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / (segment.length * segment.length),
      ),
    );
    const distance = Math.hypot(x - segment.a.x - dx * t, z - segment.a.z - dz * t);
    if (distance > segment.route.width / 2 + 4) continue;
    const previous = projections.get(segment.route);
    if (!previous || distance < previous.distance)
      projections.set(segment.route, {
        distance,
        height: segment.ay + (segment.by - segment.ay) * t - 0.06,
      });
  }
  let weight = 0,
    correction = 0;
  // Blend every overlapping road, so crossing the nearest-road boundary cannot create a wall.
  for (const [route, p] of projections) {
    const w = 1 - smoothstep(0, route.width / 2 + 4, p.distance);
    weight += w;
    correction += (p.height - natural) * w;
  }
  return natural + correction / Math.max(1, weight);
}
export function routeSurface(x: number, z: number): number | null {
  const bridge = nearestRoute(x, z, 'bridge');
  if (
    bridge &&
    bridge.distance <= bridge.segment.route.width / 2 &&
    bridgeAlong(bridge.segment.route, x, z) >= 0 &&
    bridgeAlong(bridge.segment.route, x, z) <= 1
  )
    return bridge.height;
  const p = nearestRoute(x, z, 'ground');
  return p && p.distance <= p.segment.route.width / 2 ? landSurface(x, z) + 0.06 : null;
}
export function routeClearing(x: number, z: number, extra = 0) {
  const p = nearestRoute(x, z);
  return !!p && p.distance < p.segment.route.width / 2 + extra;
}
export function clearRouteResources<
  T extends { id: number; x: number; z: number; scale: number; kind: string },
>(resources: T[]): T[] {
  // Relocate after generation: existing collected IDs and resource types remain stable.
  for (const resource of resources) {
    const p = nearestRoute(resource.x, resource.z);
    const clearance = resource.kind === 'wood' ? 4.2 * resource.scale : 2.5 * resource.scale;
    if (
      !p ||
      (p.distance > p.segment.route.width / 2 + clearance + 1 &&
        !WORLD_PLACES.some((place) => Math.hypot(resource.x - place.x, resource.z - place.z) < 12))
    )
      continue;
    const dx = (p.segment.b.x - p.segment.a.x) / p.segment.length,
      dz = (p.segment.b.z - p.segment.a.z) / p.segment.length;
    for (let attempt = 0; attempt < 60; attempt++) {
      const sign = (resource.id + attempt) % 2 ? 1 : -1,
        offset = p.segment.route.width / 2 + clearance + 4 + Math.floor(attempt / 2) * 2.5;
      const x = p.x + dz * offset * sign,
        z = p.z - dx * offset * sign;
      if (
        Math.abs(x) > 560 ||
        Math.abs(z) > 480 ||
        terrainHeight(x, z) < 4 ||
        routeClearing(x, z, clearance + 1)
      )
        continue;
      if (
        STATIONS.some((s) => Math.hypot(x - s.x, z - s.z) < 30) ||
        WORLD_PLACES.some((place) => Math.hypot(x - place.x, z - place.z) < 12)
      )
        continue;
      if (
        resources.some(
          (other) => other.id !== resource.id && Math.hypot(other.x - x, other.z - z) < 7,
        )
      )
        continue;
      resource.x = x;
      resource.z = z;
      break;
    }
  }
  return resources;
}

function bridgeAlong(route: WorldRoute, x: number, z: number) {
  const a = route.points[0],
    b = route.points.at(-1)!,
    dx = b.x - a.x,
    dz = b.z - a.z;
  return ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
}
export function bridgeRailBlocked(x: number, z: number) {
  const p = nearestRoute(x, z, 'bridge');
  if (!p) return false;
  const along = bridgeAlong(p.segment.route, x, z),
    half = p.segment.route.width / 2;
  if (along < 0 || along > 1) return false;
  if (p.distance > half - 0.6 && p.distance < half + 0.3) return true;
  const route = p.segment.route,
    a = route.points[0],
    b = route.points.at(-1)!;
  return !!route.level && Math.hypot(x - b.x, z - b.z) < 0.6 && Math.hypot(x - a.x, z - a.z) > 1;
}
