import { describe, expect, it } from 'vite-plus/test';
import { HarvestSystem } from '../src/game/resources/harvest';
import { HARVEST_RULES, RESOURCE_KINDS, emptyInventory } from '../src/game/resources/catalog';
import type { Resource } from '../src/game/resources/catalog';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { SPAWN } from '../src/game/world/terrain';
const resources: Resource[] = RESOURCE_KINDS.map((kind, id) => ({
  id,
  kind,
  x: id * 20,
  z: 180,
  scale: 1,
}));
function fixture() {
  const inventory = emptyInventory(),
    collected = new Set<number>();
  return { inventory, collected, harvest: new HarvestSystem(resources, inventory, collected) };
}
function finishHits(harvest: HarvestSystem, id: number) {
  for (let hit = 0; hit < 3; hit++) {
    if (hit > 0) harvest.advance(0.5);
    harvest.hit(id);
  }
}
describe.each(RESOURCE_KINDS)('%s harvesting', (kind) => {
  const id = resources.find((r) => r.kind === kind)!.id;
  it('requires several hits and waits for the finishing animation before awarding anything', () => {
    const { harvest, inventory, collected } = fixture();
    expect(harvest.hit(id)).toMatchObject({ hits: 1, finishing: false });
    expect(harvest.hit(id)).toBeNull();
    harvest.advance(0.5);
    expect(harvest.hit(id)).toMatchObject({ hits: 2, finishing: false });
    expect(inventory[kind]).toBe(0);
    harvest.advance(0.5);
    expect(harvest.hit(id)).toMatchObject({ hits: 3, finishing: true });
    harvest.advance(HARVEST_RULES[kind].duration - 0.1);
    expect(collected.has(id)).toBe(false);
    expect(inventory[kind]).toBe(0);
    expect(harvest.advance(0.11)).toEqual([{ resource: resources[id], reward: 1 }]);
    expect(inventory[kind]).toBe(1);
    expect(collected.has(id)).toBe(true);
  });
  it('cannot pay twice for a resource, including extra input during its animation', () => {
    const { harvest, inventory } = fixture();
    finishHits(harvest, id);
    expect(harvest.hit(id)).toBeNull();
    harvest.advance(2);
    expect(harvest.hit(id)).toBeNull();
    expect(harvest.advance(10)).toEqual([]);
    expect(inventory[kind]).toBe(1);
  });
  it('resumes interrupted finishing at the final hit without awarding free resources', () => {
    const { harvest, inventory, collected } = fixture();
    finishHits(harvest, id);
    const restored = new HarvestSystem(resources, inventory, collected);
    restored.restore(harvest.snapshot());
    expect(restored.hits(id)).toBe(2);
    expect(restored.advance(10)).toEqual([]);
    expect(inventory[kind]).toBe(0);
    restored.hit(id);
    restored.advance(2);
    expect(inventory[kind]).toBe(1);
  });
});
describe('shared harvest lifecycle', () => {
  it('keeps progress per deposit and cancels pending rewards on a new expedition', () => {
    const { harvest, inventory } = fixture();
    finishHits(harvest, 0);
    harvest.reset();
    expect(harvest.advance(10)).toEqual([]);
    expect(inventory.wood).toBe(0);
    expect(harvest.hits(0)).toBe(0);
    harvest.hit(1);
    expect(harvest.hits(0)).toBe(0);
    expect(harvest.hits(1)).toBe(1);
  });
  it('does not break inventory ownership when a station repair replaces its contents', () => {
    const state = new ExpeditionState(resources);
    Object.assign(state.inventory, { wood: 3, stone: 2, crystal: 1 });
    expect(state.repair(0)).toBe(true);
    expect(state.repair(0)).toBe(false);
    finishHits(state.harvest, 1);
    state.harvest.advance(2);
    expect(state.inventory).toEqual({ wood: 0, stone: 1, crystal: 0 });
  });
  it('snapshots and restores partial progress with existing expedition state', () => {
    const state = new ExpeditionState(resources);
    state.harvest.hit(2);
    const copy = new ExpeditionState(resources);
    copy.restore(JSON.parse(JSON.stringify(state.snapshot(SPAWN))));
    expect(copy.harvest.hits(2)).toBe(1);
    expect(copy.inventory.crystal).toBe(0);
    state.reset();
    expect(state.harvest.hits(2)).toBe(0);
  });
});
