import { LAUNCH } from '../world/landmarks';
import { launchHeight } from '../world/ground-surface';
export { LAUNCH } from '../world/landmarks';
export {
  groundSurface,
  launchHeight,
  LIFT_RADIUS,
  DOCK_RADIUS,
  DOCK_APRON_RADIUS,
} from '../world/ground-surface';
import { clamp } from '../shared/math';
export const SKY_SEGMENTS = 48;
export const BRIDGE_WIDTH = 6.6;
export const STEP_HEIGHT = 0.32;
export const ISLANDS = [
  { x: -35, z: 125, y: 155, radius: 24, name: '구름 항구' },
  { x: 35, z: 90, y: 175, radius: 22, name: '바람의 정원' },
  { x: 95, z: 25, y: 198, radius: 26, name: '별빛 채석장' },
  { x: 10, z: -45, y: 220, radius: 30, name: '천공의 성소' },
];
export const RUNES = ISLANDS.slice(0, 3).map((island, index) => ({
  ...island,
  x: island.x + 10,
  z: island.z - 7,
  index,
}));
export const SUMMIT = { ...ISLANDS[3], x: 10, z: -54 };
function bridgeEnds(index: number) {
  const a = ISLANDS[index],
    b = ISLANDS[index + 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const dx = (b.x - a.x) / length,
    dz = (b.z - a.z) / length;
  return {
    start: { x: a.x + dx * (a.radius - 1), z: a.z + dz * (a.radius - 1) },
    end: { x: b.x - dx * (b.radius - 1), z: b.z - dz * (b.radius - 1) },
  };
}
export function bridgePoint(index: number, t: number) {
  const { start, end } = bridgeEnds(index);
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  // Flat landings extend past both island edges before the first/last riser.
  const landing = 2 / length;
  const a = ISLANDS[index],
    b = ISLANDS[index + 1];
  const steps = Math.ceil((b.y - a.y) / STEP_HEIGHT);
  const progress = clamp((t - landing) / (1 - 2 * landing), 0, 1);
  const step = progress === 0 ? 0 : Math.min(steps, Math.floor(progress * steps) + 1);
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    y: a.y + ((b.y - a.y) * step) / steps,
  };
}
export function bridgeGap(index: number, t: number) {
  return index > 0 && t > 0.46 && t < 0.51;
}
export function bridgeSteps(index: number) {
  const { start, end } = bridgeEnds(index);
  const landing = 2 / Math.hypot(end.x - start.x, end.z - start.z);
  const count = Math.ceil((ISLANDS[index + 1].y - ISLANDS[index].y) / STEP_HEIGHT);
  const edges = [
    0,
    1,
    landing,
    ...Array.from({ length: count }, (_, i) => landing + ((1 - 2 * landing) * (i + 1)) / count),
  ];
  if (index > 0) edges.push(0.46, 0.51);
  edges.sort((a, b) => a - b);
  return edges.slice(0, -1).flatMap((t0, i) => {
    const t1 = edges[i + 1],
      middle = (t0 + t1) / 2;
    if (t1 - t0 < 1e-8 || bridgeGap(index, middle)) return [];
    return [
      {
        start: bridgePoint(index, t0),
        end: bridgePoint(index, t1),
        height: bridgePoint(index, middle).y,
      },
    ];
  });
}
function onIsland(x: number, z: number, island: (typeof ISLANDS)[number]) {
  const dx = x - island.x,
    dz = z - island.z;
  const sector = (2 * Math.PI) / SKY_SEGMENTS;
  const angle = ((Math.atan2(dx, dz) % sector) + sector) % sector;
  const radius = (island.radius * Math.cos(sector / 2)) / Math.cos(angle - sector / 2);
  return Math.hypot(dx, dz) <= radius;
}
export function skySurface(x: number, z: number): number | null {
  for (const island of ISLANDS) if (onIsland(x, z, island)) return island.y;
  for (let i = 0; i < ISLANDS.length - 1; i++) {
    const a = bridgePoint(i, 0),
      b = bridgePoint(i, 1);
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
    if (t < 0 || t > 1 || bridgeGap(i, t)) continue;
    const p = bridgePoint(i, t);
    if (Math.hypot(x - p.x, z - p.z) <= BRIDGE_WIDTH / 2) return p.y;
  }
  return null;
}
export function ridePosition(progress: number, descending: boolean) {
  const t = clamp(progress, 0, 1),
    eased = t * t * (3 - 2 * t);
  return {
    ...LAUNCH,
    y: launchHeight() + (ISLANDS[0].y - launchHeight()) * (descending ? 1 - eased : eased),
  };
}
