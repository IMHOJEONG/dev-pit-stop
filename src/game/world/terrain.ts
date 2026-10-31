import { WORLD_PLACES } from './places';
import { STATIONS } from './landmarks';
import { smoothstep } from '../shared/math';
export const WORLD_SEED = 2704;
export const WORLD_SIZE = 1240;
export const WATER_LEVEL = 0;
export const SPAWN = { x: 0, z: 195 };
export function rawTerrainHeight(x: number, z: number): number {
  const radius = Math.hypot(x / 555, z / 505);
  const land = 1 - smoothstep(0.65, 1.04, radius);
  const rolling =
    Math.sin(x * 0.014 + z * 0.006) * 8 +
    Math.cos(z * 0.018) * 6 +
    Math.sin(x * 0.031 - z * 0.024) * 3 +
    Math.sin(x * 0.075 + z * 0.052) * 1.1;
  const peakA = 88 * Math.exp(-((x + 205) ** 2 / 17000 + (z + 235) ** 2 / 18000));
  const peakB = 66 * Math.exp(-((x - 190) ** 2 / 15000 + (z + 190) ** 2 / 17000));
  let h = -16 + land * (35 + rolling + peakA + peakB);
  const lake = 1 - smoothstep(34, 72, Math.hypot(x - 125, z - 58));
  h = h * (1 - lake) - 4 * lake;
  return h;
}
const stationBases = STATIONS.map((s) => rawTerrainHeight(s.x, s.z));
const placeBases = WORLD_PLACES.map((p) => rawTerrainHeight(p.x, p.z));
/** Flat station aprons blend into the original island instead of burying their stairs. */
export function terrainHeight(x: number, z: number): number {
  const natural = rawTerrainHeight(x, z);
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i],
      radius = Math.hypot(x - s.x, z - s.z);
    if (radius < 30)
      return stationBases[i] + (natural - stationBases[i]) * smoothstep(20, 30, radius);
  }
  for (let i = 0; i < WORLD_PLACES.length; i++) {
    const p = WORLD_PLACES[i];
    if (p.kind === 'deck') continue;
    const radius = Math.hypot(x - p.x, z - p.z);
    if (radius < 13) return placeBases[i] + (natural - placeBases[i]) * smoothstep(8, 13, radius);
  }
  return natural;
}
export function biomeAt(x: number, z: number) {
  const h = terrainHeight(x, z);
  if (h < 2.7) return '코랄 해안';
  if (h > 76) return '구름 산맥';
  if (Math.hypot(x - 125, z - 58) < 100) return '거울 호수';
  if (z < -70) return '속삭이는 숲';
  return '바람 초원';
}
