import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { groundSurface } from '../src/game/world/ground-surface';
import { SPAWN } from '../src/game/world/terrain';
import { makeResources } from '../src/game/resources/distribution';
import { HARVEST_RULES } from '../src/game/resources/catalog';
import { lootFor } from '../src/game/items/item-system';
import { DropView } from '../src/game/items/drop-view';
import { findInteraction } from '../src/game/expedition/interactions';
const resources = makeResources();
function harvest(state: ExpeditionState, id: number) {
  for (let hit = 0; hit < 3; hit++) {
    if (hit) state.advanceHarvest(0.5);
    state.harvest.hit(id);
  }
  return state.advanceHarvest(HARVEST_RULES[resources[id].kind].duration);
}
function collect(state: ExpeditionState, id: number) {
  const r = resources[id];
  return state.items.pickup([...state.items.drops.keys()], { ...r, y: groundSurface(r.x, r.z) });
}
it('drops the original repair supplies and reproducible extra items for each deposit type', () => {
  const first = resources.slice(0, 6).map(lootFor);
  expect(first[0]).toEqual([
    { item: 'wood', amount: 1 },
    { item: 'berry', amount: 2 },
  ]);
  expect(first[3]).toEqual([
    { item: 'stone', amount: 1 },
    { item: 'ironOre', amount: 1 },
  ]);
  expect(first[5]).toEqual([
    { item: 'crystal', amount: 1 },
    { item: 'ancientCoin', amount: 1 },
  ]);
  expect(resources.map(lootFor)).toEqual(resources.map(lootFor));
});
it('completes harvesting into world drops, then pays exactly once when picked up', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  expect(s.inventory.wood).toBe(0);
  expect(s.items.count('berry')).toBe(0);
  expect(s.items.drops.size).toBe(2);
  const ids = [...s.items.drops.keys()];
  expect(s.harvest.hit(0)).toBeNull();
  expect(s.advanceHarvest(10)).toEqual([]);
  expect(s.items.spawnFrom(resources[0])).toEqual([]);
  expect(collect(s, 0)).toEqual([
    { item: 'wood', amount: 1 },
    { item: 'berry', amount: 2 },
  ]);
  expect(s.inventory.wood).toBe(1);
  expect(s.items.count('berry')).toBe(2);
  expect(s.items.drops.size).toBe(0);
  expect(s.items.pickup(ids, resources[0])).toEqual([]);
});
it('saves unclaimed drops and collected stacks without recreating already-picked rewards', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  const saved = s.snapshot(SPAWN);
  const restored = new ExpeditionState(resources);
  restored.restore(validateSave(JSON.parse(JSON.stringify(saved)), resources.length)!);
  expect(restored.items.snapshotDrops()).toEqual(s.items.snapshotDrops());
  expect(restored.inventory.wood).toBe(0);
  collect(restored, 0);
  const next = new ExpeditionState(resources);
  next.restore(validateSave(restored.snapshot(SPAWN), resources.length)!);
  expect(next.items.drops.size).toBe(0);
  expect(next.items.count('berry')).toBe(2);
  expect(next.inventory.wood).toBe(1);
  expect(next.items.spawnFrom(resources[0])).toEqual([]);
});
it('restores interrupted finishing before any drop or inventory award', () => {
  const s = new ExpeditionState(resources);
  s.harvest.hit(0);
  s.advanceHarvest(0.5);
  s.harvest.hit(0);
  s.advanceHarvest(0.5);
  s.harvest.hit(0);
  const next = new ExpeditionState(resources);
  next.restore(s.snapshot(SPAWN));
  expect(next.harvest.hits(0)).toBe(2);
  next.advanceHarvest(10);
  expect(next.items.drops.size).toBe(0);
  expect(next.inventory.wood).toBe(0);
  next.harvest.hit(0);
  next.advanceHarvest(2);
  expect(next.items.drops.size).toBe(2);
});
it('keeps old saves and already-collected resource identities without retroactive loot', () => {
  const s = new ExpeditionState(resources),
    old = s.snapshot(SPAWN);
  delete old.items;
  delete old.drops;
  old.inventory.wood = 7;
  old.collected = [0];
  const next = new ExpeditionState(resources);
  next.restore(validateSave(old, resources.length)!);
  expect(next.inventory.wood).toBe(7);
  expect(next.items.count('berry')).toBe(0);
  expect(next.items.spawnFrom(resources[0])).toEqual([]);
});
it('does not pick up from a distance, through an elevated floor, or twice in one batch', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 3);
  const ids = [...s.items.drops.keys()];
  expect(s.items.pickup(ids, { x: 600, z: 600 })).toEqual([]);
  expect(
    s.items.pickup(ids, {
      ...resources[3],
      y: groundSurface(resources[3].x, resources[3].z) + 155,
    }),
  ).toEqual([]);
  expect(s.items.drops.size).toBe(2);
  s.items.pickup([...ids, ...ids], resources[3]);
  expect(s.inventory.stone).toBe(1);
  expect(s.items.count('ironOre')).toBe(1);
});
it('consumes berries only when they provide stamina and caps recovery at 100', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  collect(s, 0);
  expect(s.items.use('berry', 100).used).toBe(false);
  expect(s.items.count('berry')).toBe(2);
  expect(s.items.use('berry', 90)).toMatchObject({ used: true, stamina: 100 });
  expect(s.items.count('berry')).toBe(1);
  expect(s.items.use('berry', 0)).toMatchObject({ used: true, stamina: 25 });
  expect(s.items.count('berry')).toBe(0);
  expect(s.items.use('berry', 0).used).toBe(false);
  expect(s.items.use('ironOre', 0).used).toBe(false);
});
it('rejects malformed item counts, unknown IDs, forged sources and duplicate saved drops', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  const base = s.snapshot(SPAWN);
  for (const bad of [
    { ...base, items: { berry: -1 } },
    { ...base, items: { berry: Infinity } },
    { ...base, items: { berry: 1.5 } },
    { ...base, items: { unexpected: 1 } },
    { ...base, drops: [...base.drops!, base.drops![0]] },
    { ...base, drops: [{ ...base.drops![0], item: 'unknown' }] },
    { ...base, drops: [{ ...base.drops![0], sourceId: 99 }] },
    { ...base, drops: [{ ...base.drops![0], amount: 3 }] },
  ])
    expect(validateSave(bad, resources.length)).toBeNull();
  const next = new ExpeditionState(resources);
  next.restore({
    ...base,
    drops: [{ id: '0:ancientCoin', sourceId: 0, item: 'ancientCoin', amount: 1 }],
  });
  expect(next.items.drops.size).toBe(0);
});
it('does not lose a drop if its stack cannot be incremented safely', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  s.inventory.wood = Number.MAX_SAFE_INTEGER;
  const receipt = collect(s, 0);
  expect(receipt).toEqual([{ item: 'berry', amount: 2 }]);
  expect([...s.items.drops.values()].map((d) => d.item)).toEqual(['wood']);
});
it('prioritizes nearby pickups over resource and station actions', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  expect(findInteraction(resources[0], resources, s.collected, s.repaired, s.items)?.type).toBe(
    'drop',
  );
  collect(s, 0);
  expect(findInteraction(resources[0], resources, s.collected, s.repaired, s.items)?.type).not.toBe(
    'drop',
  );
});
it('keeps extra items when repairing or resetting an expedition', () => {
  const s = new ExpeditionState(resources);
  harvest(s, 0);
  collect(s, 0);
  Object.assign(s.inventory, { wood: 3, stone: 2, crystal: 1 });
  expect(s.repair(0)).toBe(true);
  expect(s.items.count('berry')).toBe(2);
  s.reset();
  expect(s.items.drops.size).toBe(0);
  expect(s.items.totals()).toEqual({ kinds: 0, amount: 0 });
});
it.each([0, 3, 5])(
  'renders deposit %s loot on its ground surface and removes it after pickup',
  (id) => {
    const s = new ExpeditionState(resources);
    harvest(s, id);
    const scene = new THREE.Scene(),
      view = new DropView(scene),
      r = resources[id];
    const p = new THREE.Vector3(r.x, groundSurface(r.x, r.z), r.z);
    view.update(0, p, s.items.drops);
    expect(view.root.children.length).toBe(2);
    view.update(1, p, s.items.drops);
    scene.updateMatrixWorld(true);
    for (const drop of s.items.drops.values()) {
      const group = view.root.getObjectByName(`drop-${drop.id}`)!;
      expect(group.position.y).toBeCloseTo(groundSurface(drop.x, drop.z));
      expect(
        new THREE.Box3().setFromObject(group.getObjectByName('drop-body')!).min.y,
      ).toBeGreaterThan(group.position.y);
    }
    p.y += 155;
    view.update(2, p, s.items.drops);
    expect(view.root.children.length).toBe(0);
    p.y -= 155;
    view.update(3, p, s.items.drops);
    collect(s, id);
    view.update(4, p, s.items.drops);
    expect(view.root.children.length).toBe(0);
    view.dispose();
  },
);
