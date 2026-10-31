import { LAUNCH } from './landmarks';
import { terrainHeight } from './terrain';
import { landSurface, routeSurface } from './routes';
import { stationSurface } from './station-layout';
export const LIFT_RADIUS = 5.5;
export const DOCK_RADIUS = 7;
export const DOCK_APRON_RADIUS = 10;
export const launchHeight = () => terrainHeight(LAUNCH.x, LAUNCH.z) + 0.75;
/** Rendered walkable structures take precedence over the graded ground beneath them. */
export function groundSurface(x: number, z: number): number {
  const station = stationSurface(x, z);
  if (station !== null) return station;
  const distance = Math.hypot(x - LAUNCH.x, z - LAUNCH.z);
  if (distance <= DOCK_RADIUS) return launchHeight();
  const ground = landSurface(x, z);
  if (distance < DOCK_APRON_RADIUS) {
    const t = (distance - DOCK_RADIUS) / (DOCK_APRON_RADIUS - DOCK_RADIUS);
    return launchHeight() * (1 - t) + (ground + 0.04) * t;
  }
  return routeSurface(x, z) ?? ground;
}
