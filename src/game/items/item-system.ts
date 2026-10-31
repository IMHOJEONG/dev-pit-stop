import type { Inventory, Resource } from '../resources/catalog';
import { groundSurface } from '../world/ground-surface';
import { stationBlocked } from '../world/station-layout';
import { placeBlocked } from '../world/places';
import { ITEMS, ITEM_IDS, EXTRA_ITEM_IDS, emptyItems } from './catalog';
import type { ExtraItemId, ItemId } from './catalog';
export interface DropRecord {
  id: string;
  sourceId: number;
  item: ItemId;
  amount: number;
}
export interface ItemDrop extends DropRecord {
  x: number;
  z: number;
}
export interface ItemReceipt {
  item: ItemId;
  amount: number;
}
export interface ItemUseResult {
  used: boolean;
  stamina: number;
  message: string;
}
export const PICKUP_RADIUS = 3.4;
const extras = { wood: 'berry', stone: 'ironOre', crystal: 'ancientCoin' } as const;
/** Deterministic loot prevents rerolling rewards by loading the game. */
export function lootFor(resource: Resource): ItemReceipt[] {
  const loot: ItemReceipt[] = [{ item: resource.kind, amount: 1 }];
  const roll = (Math.imul(resource.id + 17, 2654435761) >>> 0) % 100;
  if (resource.id < 6 || roll < { wood: 40, stone: 60, crystal: 25 }[resource.kind])
    loot.push({ item: extras[resource.kind], amount: resource.kind === 'wood' ? 2 : 1 });
  return loot;
}
export class ItemSystem {
  readonly counts = emptyItems();
  readonly drops = new Map<string, ItemDrop>();
  private spawned = new Set<number>();
  private resources: Map<number, Resource>;
  constructor(
    private materials: Inventory,
    resources: Resource[],
  ) {
    this.resources = new Map(resources.map((r) => [r.id, r]));
  }
  count(item: ItemId) {
    return item === 'wood' || item === 'stone' || item === 'crystal'
      ? this.materials[item]
      : this.counts[item];
  }
  private setCount(item: ItemId, amount: number) {
    if (item === 'wood' || item === 'stone' || item === 'crystal') this.materials[item] = amount;
    else this.counts[item] = amount;
  }
  private createDrops(resource: Resource): ItemDrop[] {
    return lootFor(resource).map((entry, index) => {
      let x = resource.x,
        z = resource.z;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = resource.id * 2.399963 + index * 2.4 + (attempt * Math.PI) / 4;
        const px = resource.x + Math.cos(angle) * 2.1,
          pz = resource.z + Math.sin(angle) * 2.1;
        if (groundSurface(px, pz) >= 0.8 && !stationBlocked(px, pz) && !placeBlocked(px, pz)) {
          x = px;
          z = pz;
          break;
        }
      }
      return { ...entry, id: `${resource.id}:${entry.item}`, sourceId: resource.id, x, z };
    });
  }
  spawnFrom(resource: Resource) {
    if (this.spawned.has(resource.id) || !this.resources.has(resource.id)) return [];
    this.spawned.add(resource.id);
    const drops = this.createDrops(this.resources.get(resource.id)!);
    for (const drop of drops) this.drops.set(drop.id, drop);
    return drops;
  }
  nearby(position: { x: number; z: number; y?: number }) {
    return [...this.drops.values()].filter(
      (d) =>
        Math.hypot(d.x - position.x, d.z - position.z) <= PICKUP_RADIUS &&
        (position.y === undefined || Math.abs(position.y - groundSurface(d.x, d.z)) < 2.5),
    );
  }
  pickup(ids: readonly string[], position: { x: number; z: number; y?: number }): ItemReceipt[] {
    const nearby = new Set(this.nearby(position).map((d) => d.id));
    const receipt = new Map<ItemId, number>();
    for (const id of new Set(ids)) {
      const drop = this.drops.get(id);
      if (!drop || !nearby.has(id)) continue;
      const next = this.count(drop.item) + drop.amount;
      if (!Number.isSafeInteger(next)) continue;
      this.setCount(drop.item, next);
      this.drops.delete(id);
      receipt.set(drop.item, (receipt.get(drop.item) ?? 0) + drop.amount);
    }
    return [...receipt].map(([item, amount]) => ({ item, amount }));
  }
  use(item: ItemId, stamina: number): ItemUseResult {
    const value = Math.max(0, Math.min(100, Number.isFinite(stamina) ? stamina : 0));
    if (!ITEMS[item]?.stamina)
      return {
        used: false,
        stamina: value,
        message: '사용하는 아이템이 아니에요. 배낭에 보관됩니다.',
      };
    if (this.count(item) < 1) return { used: false, stamina: value, message: '아이템이 없어요.' };
    if (value >= 100) return { used: false, stamina: value, message: '스태미나가 가득 차 있어요.' };
    const next = Math.min(100, value + ITEMS[item].stamina!);
    this.setCount(item, this.count(item) - 1);
    return {
      used: true,
      stamina: next,
      message: `${ITEMS[item].name} 사용 · 스태미나 +${Math.round(next - value)}`,
    };
  }
  totals() {
    const counts = ITEM_IDS.map((id) => this.count(id));
    return { kinds: counts.filter((n) => n > 0).length, amount: counts.reduce((a, b) => a + b, 0) };
  }
  snapshotDrops(): DropRecord[] {
    return [...this.drops.values()].map(({ id, sourceId, item, amount }) => ({
      id,
      sourceId,
      item,
      amount,
    }));
  }
  restore(
    counts: Partial<Record<ExtraItemId, number>> = {},
    records: DropRecord[] = [],
    collected: Set<number>,
  ) {
    this.reset();
    for (const id of EXTRA_ITEM_IDS) {
      const n = counts[id];
      if (Number.isSafeInteger(n) && n! >= 0) this.counts[id] = n!;
    }
    this.spawned = new Set(collected);
    for (const record of records) {
      const resource = this.resources.get(record.sourceId);
      if (!resource || !collected.has(record.sourceId)) continue;
      const expected = this.createDrops(resource).find(
        (d) => d.id === record.id && d.item === record.item && d.amount === record.amount,
      );
      if (expected) this.drops.set(expected.id, expected);
    }
  }
  reset() {
    Object.assign(this.counts, emptyItems());
    this.drops.clear();
    this.spawned.clear();
  }
}
