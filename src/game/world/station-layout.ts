import { STATIONS } from './landmarks';
import { terrainHeight } from './terrain';
export const STATION_DECK_RADIUS = 7;
export const STATION_DECK_RISE = 2.2;
export const STATION_STEP_COUNT = 10;
export const STATION_STEP_DEPTH = 1.2;
export const STATION_STEP_WIDTH = 4.4;
export const STATION_STEP_START = 6.6;
export const stationBase = (index: number) => terrainHeight(STATIONS[index].x, STATIONS[index].z);
export function stationSteps(index: number) {
  const s = STATIONS[index],
    base = stationBase(index);
  return Array.from({ length: STATION_STEP_COUNT }, (_, i) => ({
    x: s.x,
    z: s.z + STATION_STEP_START + (i + 0.5) * STATION_STEP_DEPTH,
    width: STATION_STEP_WIDTH,
    depth: STATION_STEP_DEPTH,
    height:
      base +
      (STATION_DECK_RISE * (STATION_STEP_COUNT - i)) / STATION_STEP_COUNT -
      (i === 0 ? 0.015 : 0),
  }));
}
export function stationSurface(x: number, z: number): number | null {
  for (let index = 0; index < STATIONS.length; index++) {
    const s = STATIONS[index],
      dx = x - s.x,
      dz = z - s.z;
    if (Math.hypot(dx, dz) > 20) continue;
    // The rendered 32-sided deck and the collision boundary have the same outline.
    const sector = (2 * Math.PI) / 32,
      angle = ((Math.atan2(dx, dz) % sector) + sector) % sector;
    const radius = (STATION_DECK_RADIUS * Math.cos(sector / 2)) / Math.cos(angle - sector / 2);
    if (Math.hypot(dx, dz) <= radius) return stationBase(index) + STATION_DECK_RISE;
    if (
      Math.abs(dx) <= STATION_STEP_WIDTH / 2 &&
      dz >= STATION_STEP_START &&
      dz < STATION_STEP_START + STATION_STEP_COUNT * STATION_STEP_DEPTH
    ) {
      const i = Math.floor((dz - STATION_STEP_START) / STATION_STEP_DEPTH);
      return (
        stationBase(index) +
        (STATION_DECK_RISE * (STATION_STEP_COUNT - i)) / STATION_STEP_COUNT -
        (i === 0 ? 0.015 : 0)
      );
    }
  }
  return null;
}
export function stationBlocked(x: number, z: number, clearance = 0.55) {
  return STATIONS.some((s) => {
    const dx = x - s.x,
      dz = z - s.z;
    if (Math.hypot(dx, dz) < 2.65 + clearance) return true;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      if (Math.hypot(dx - Math.sin(a) * 4.4, dz - Math.cos(a) * 4.4) < 0.92 + clearance)
        return true;
    }
    return false;
  });
}

export const STATION_BODY_MARGIN = 0.65;
/** Keep the whole standing footprint on a tread, and keep bodies outside tall riser sides. */
export function constrainStationPosition(
  x: number,
  z: number,
  footHeight: number,
  maxStep: number,
  grounded: boolean,
) {
  let px = x,
    pz = z;
  for (let index = 0; index < STATIONS.length; index++) {
    const s = STATIONS[index],
      base = stationBase(index);
    if (Math.hypot(px - s.x, pz - s.z) > 21 + STATION_BODY_MARGIN) continue;
    const dx = px - s.x,
      dz = pz - s.z;
    if (
      grounded &&
      footHeight - base > maxStep &&
      Math.hypot(dx, dz) > STATION_DECK_RADIUS &&
      Math.abs(dx) <= STATION_STEP_WIDTH / 2 &&
      dz >= STATION_STEP_START &&
      dz < STATION_STEP_START + STATION_STEP_COUNT * STATION_STEP_DEPTH
    ) {
      const step = stationSurface(px, pz);
      if (step !== null && Math.abs(step - footHeight) <= maxStep)
        px =
          s.x +
          Math.max(
            -STATION_STEP_WIDTH / 2 + STATION_BODY_MARGIN,
            Math.min(STATION_STEP_WIDTH / 2 - STATION_BODY_MARGIN, dx),
          );
    }
    let correctionX = 0,
      correctionZ = 0,
      penetration = 0;
    if (base + STATION_DECK_RISE > footHeight + maxStep) {
      const dx = px - s.x,
        dz = pz - s.z,
        distance = Math.hypot(dx, dz);
      const depth = STATION_DECK_RADIUS + STATION_BODY_MARGIN - distance;
      if (depth > 0) {
        penetration = depth;
        correctionX = (dx / (distance || 1)) * depth;
        correctionZ = (dz / (distance || 1)) * depth;
      }
    }
    for (const step of stationSteps(index)) {
      if (step.height <= footHeight + maxStep) continue;
      const dx = px - step.x,
        dz = pz - step.z;
      const qx = Math.abs(dx) - step.width / 2,
        qz = Math.abs(dz) - step.depth / 2;
      const ox = Math.max(qx, 0),
        oz = Math.max(qz, 0),
        outside = Math.hypot(ox, oz);
      const signed = outside + Math.min(Math.max(qx, qz), 0),
        depth = STATION_BODY_MARGIN - signed;
      if (depth <= penetration) continue;
      penetration = depth;
      if (outside > 1e-8) {
        correctionX = ((Math.sign(dx) * ox) / outside) * depth;
        correctionZ = ((Math.sign(dz) * oz) / outside) * depth;
      } else if (qx > qz) {
        correctionX = (Math.sign(dx) || 1) * depth;
        correctionZ = 0;
      } else {
        correctionX = 0;
        correctionZ = (Math.sign(dz) || 1) * depth;
      }
    }
    px += correctionX;
    pz += correctionZ;
  }
  return { x: px, z: pz };
}
