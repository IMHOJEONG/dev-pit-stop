import { WORLD_REGIONS } from '../world/regions';
import type { VehicleSave } from '../vehicles/vehicle-controller';
import { WORLD_PLACES } from '../world/places';
import { isAppearance } from '../player/appearance';
import type { Appearance } from '../player/appearance';
import type { SkySave } from '../sky/sky-journey';
import type { Inventory } from '../resources/catalog';
import { HARVEST_RULES } from '../resources/catalog';
import { STATIONS } from '../world/landmarks';
import { groundSurface } from '../world/ground-surface';
import { EXTRA_ITEM_IDS, isItemId } from '../items/catalog';
import type { ExtraItemId } from '../items/catalog';
import type { DropRecord } from '../items/item-system';
export interface SaveData {
  version: 1;
  vehicle?: VehicleSave;
  navigation?: { kind: 'station' | 'place' | 'region'; index: number; arrived?: boolean } | null;
  appearance?: Appearance;
  sky?: SkySave;
  harvestProgress?: [number, number][];
  x: number;
  z: number;
  time: number;
  inventory: Inventory;
  items?: Partial<Record<ExtraItemId, number>>;
  drops?: DropRecord[];
  collected: number[];
  repaired: number[];
  visited: string[];
  discoveries?: string[];
  distance: number;
}
export const SAVE_KEY = 'wild-atlas-expedition-v1';
export function validateSave(value: unknown, resourceCount: number): SaveData | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as SaveData;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (
    s.version !== 1 ||
    (s.navigation != null &&
      (!['station', 'place', 'region'].includes(s.navigation.kind) ||
        !Number.isInteger(s.navigation.index) ||
        s.navigation.index < 0 ||
        s.navigation.index >=
          ({ station: STATIONS.length, place: WORLD_PLACES.length, region: WORLD_REGIONS.length }[
            s.navigation.kind
          ] ?? 0) ||
        (s.navigation.arrived !== undefined && typeof s.navigation.arrived !== 'boolean'))) ||
    (s.vehicle !== undefined &&
      (!s.vehicle ||
        !finite(s.vehicle.x) ||
        !finite(s.vehicle.z) ||
        Math.abs(s.vehicle.x) > 595 ||
        Math.abs(s.vehicle.z) > 595 ||
        !finite(s.vehicle.heading) ||
        Math.abs(s.vehicle.heading) > Math.PI * 2 ||
        typeof s.vehicle.riding !== 'boolean' ||
        groundSurface(s.vehicle.x, s.vehicle.z) < 0.8)) ||
    (s.sky !== undefined &&
      (!s.sky ||
        typeof s.sky.built !== 'boolean' ||
        typeof s.sky.inSky !== 'boolean' ||
        typeof s.sky.complete !== 'boolean' ||
        !Number.isInteger(s.sky.runes) ||
        s.sky.runes < 0 ||
        s.sky.runes > 3 ||
        (!s.sky.built && (s.sky.inSky || s.sky.runes > 0 || s.sky.complete)) ||
        (s.sky.complete && s.sky.runes !== 3))) ||
    !finite(s.x) ||
    !finite(s.z) ||
    Math.abs(s.x) > 610 ||
    Math.abs(s.z) > 610 ||
    (!s.sky?.inSky && groundSurface(s.x, s.z) < -1) ||
    !finite(s.time) ||
    s.time < 0 ||
    s.time > 24 ||
    !finite(s.distance) ||
    s.distance < 0 ||
    !s.inventory ||
    !(['wood', 'stone', 'crystal'] as const).every(
      (k) => Number.isSafeInteger(s.inventory[k]) && s.inventory[k] >= 0,
    ) ||
    !Array.isArray(s.collected) ||
    !s.collected.every((n) => Number.isInteger(n) && n >= 0 && n < resourceCount) ||
    !Array.isArray(s.repaired) ||
    !s.repaired.every((n) => Number.isInteger(n) && n >= 0 && n < STATIONS.length) ||
    (s.discoveries !== undefined &&
      (!Array.isArray(s.discoveries) ||
        s.discoveries.length > WORLD_PLACES.length ||
        !s.discoveries.every((id) => WORLD_PLACES.some((p) => p.id === id)))) ||
    !Array.isArray(s.visited) ||
    s.visited.length > 5000 ||
    (s.harvestProgress !== undefined &&
      (!Array.isArray(s.harvestProgress) ||
        !s.harvestProgress.every(
          (entry) =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            Number.isInteger(entry[0]) &&
            entry[0] >= 0 &&
            entry[0] < resourceCount &&
            Number.isInteger(entry[1]) &&
            entry[1] > 0 &&
            entry[1] < Math.max(...Object.values(HARVEST_RULES).map((rule) => rule.hits)),
        ))) ||
    !s.visited.every((v) => typeof v === 'string' && /^-?\d{1,2},-?\d{1,2}$/.test(v))
  )
    return null;
  if (
    s.items !== undefined &&
    (!s.items ||
      typeof s.items !== 'object' ||
      Array.isArray(s.items) ||
      Object.keys(s.items).some((k) => !EXTRA_ITEM_IDS.includes(k as ExtraItemId)) ||
      EXTRA_ITEM_IDS.some(
        (k) =>
          s.items![k] !== undefined && (!Number.isSafeInteger(s.items![k]) || s.items![k]! < 0),
      ))
  )
    return null;
  if (
    s.drops !== undefined &&
    (!Array.isArray(s.drops) ||
      s.drops.length > resourceCount * 2 ||
      s.drops.some(
        (d) =>
          !d ||
          !Number.isInteger(d.sourceId) ||
          d.sourceId < 0 ||
          d.sourceId >= resourceCount ||
          !s.collected.includes(d.sourceId) ||
          !isItemId(d.item) ||
          d.id !== `${d.sourceId}:${d.item}` ||
          !Number.isSafeInteger(d.amount) ||
          d.amount < 1 ||
          d.amount > 2,
      ) ||
      new Set(s.drops.map((d) => d.id)).size !== s.drops.length)
  )
    return null;
  return s.appearance !== undefined && !isAppearance(s.appearance)
    ? { ...s, appearance: undefined }
    : s;
}
