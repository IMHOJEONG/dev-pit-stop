import { VehicleController } from '../vehicles/vehicle-controller';
import { WORLD_REGIONS } from '../world/regions';
import { WORLD_PLACES } from '../world/places';
import type { PlaceId } from '../world/places';
import { DEFAULT_APPEARANCE, isAppearance } from '../player/appearance';
import { SkyJourney } from '../sky/sky-journey';
import { emptyInventory } from '../resources/catalog';
import type { Resource } from '../resources/catalog';
import { HarvestSystem } from '../resources/harvest';
import { ItemSystem } from '../items/item-system';
import { STATIONS, spendRepairCost } from '../world/landmarks';
import { groundSurface } from '../world/ground-surface';
import type { SaveData } from '../persistence/save-data';

export class ExpeditionState {
  appearance = { ...DEFAULT_APPEARANCE };
  readonly sky = new SkyJourney();
  readonly inventory = emptyInventory();
  readonly collected = new Set<number>();
  readonly repaired = new Set<number>();
  readonly visited = new Set<string>();
  readonly discoveries = new Set<PlaceId>();
  navigation: { kind: 'station' | 'place' | 'region'; index: number; arrived?: boolean } | null =
    null;
  readonly harvest: HarvestSystem;
  readonly items: ItemSystem;
  readonly vehicle: VehicleController;
  time = 9.67;
  timeRate = 1;
  distance = 0;
  target = 0;
  private landCells = 0;
  constructor(readonly resources: Resource[]) {
    this.harvest = new HarvestSystem(resources, this.collected);
    this.items = new ItemSystem(this.inventory, resources);
    this.vehicle = new VehicleController(resources, this.collected);
    for (let x = -30; x < 31; x++)
      for (let z = -30; z < 31; z++)
        if (groundSurface(x * 20 + 10, z * 20 + 10) > 0.8) this.landCells++;
  }
  explore(position: { x: number; z: number }) {
    const x = Math.floor(position.x / 20),
      z = Math.floor(position.z / 20);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        if (groundSurface((x + i) * 20 + 10, (z + j) * 20 + 10) > 0.8)
          this.visited.add(`${x + i},${z + j}`);
  }
  discover(position: { x: number; z: number }) {
    const found = WORLD_PLACES.filter(
      (p) =>
        !this.discoveries.has(p.id) && Math.hypot(position.x - p.x, position.z - p.z) < p.radius,
    );
    for (const place of found) this.discoveries.add(place.id);
    return found;
  }
  arrive(position: { x: number; z: number }) {
    const navigation = this.navigation;
    if (navigation?.kind !== 'region' || navigation.arrived) return null;
    const region = WORLD_REGIONS[navigation.index];
    if (!region || Math.hypot(position.x - region.x, position.z - region.z) > 12) return null;
    navigation.arrived = true;
    return region;
  }
  exploredPercent() {
    return Math.min(100, Math.round((this.visited.size / this.landCells) * 100));
  }
  repair(index: number) {
    if (!STATIONS[index] || this.repaired.has(index)) return false;
    const next = spendRepairCost(this.inventory);
    if (!next) return false;
    Object.assign(this.inventory, next);
    this.repaired.add(index);
    if (this.navigation?.kind === 'station' && this.navigation.index === index)
      this.navigation = null;
    this.target = Math.max(
      0,
      STATIONS.findIndex((_, i) => !this.repaired.has(i)),
    );
    return true;
  }
  advanceHarvest(dt: number) {
    const completed = this.harvest.advance(dt);
    for (const { resource } of completed) this.items.spawnFrom(resource);
    return completed;
  }
  snapshot(position: { x: number; z: number }): SaveData {
    return {
      version: 1,
      vehicle: this.vehicle.snapshot(),
      navigation: this.navigation ? { ...this.navigation } : null,
      appearance: { ...this.appearance },
      sky: this.sky.snapshot(),
      x: position.x,
      z: position.z,
      time: this.time,
      inventory: { ...this.inventory },
      items: { ...this.items.counts },
      drops: this.items.snapshotDrops(),
      collected: [...this.collected],
      repaired: [...this.repaired],
      visited: [...this.visited],
      discoveries: [...this.discoveries],
      distance: this.distance,
      harvestProgress: this.harvest.snapshot(),
    };
  }
  restore(data: SaveData) {
    this.reset();
    this.appearance = { ...(isAppearance(data.appearance) ? data.appearance : DEFAULT_APPEARANCE) };
    Object.assign(this.inventory, data.inventory);
    data.collected.forEach((id) => this.collected.add(id));
    this.items.restore(data.items, data.drops, this.collected);
    this.vehicle.restore(data.vehicle);
    this.navigation = data.navigation ? { ...data.navigation } : null;
    if (data.sky?.inSky) this.vehicle.riding = false;
    data.repaired.forEach((id) => this.repaired.add(id));
    data.visited.forEach((cell) => this.visited.add(cell));
    for (const place of WORLD_PLACES)
      if (data.discoveries?.includes(place.id)) this.discoveries.add(place.id);
    this.time = data.time;
    this.distance = data.distance;
    this.target = Math.max(
      0,
      STATIONS.findIndex((_, i) => !this.repaired.has(i)),
    );
    this.harvest.restore(data.harvestProgress);
    this.sky.restore(data.sky);
  }
  reset() {
    Object.assign(this.inventory, emptyInventory());
    this.collected.clear();
    this.repaired.clear();
    this.visited.clear();
    this.discoveries.clear();
    this.navigation = null;
    this.harvest.reset();
    this.items.reset();
    this.vehicle.reset();
    this.sky.restore();
    this.distance = 0;
    this.time = 9.67;
    this.target = 0;
  }
}
