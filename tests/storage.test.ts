import { describe, expect, it } from 'vite-plus/test';
import { ExpeditionStorage } from '../src/game/persistence/expedition-storage';
import type { SaveStorage } from '../src/game/persistence/expedition-storage';
import { SAVE_KEY } from '../src/game/persistence/save-data';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { makeResources } from '../src/game/resources/distribution';
import { SPAWN } from '../src/game/world/terrain';
const resources = makeResources();
function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
describe('expedition storage compatibility', () => {
  it('reads existing version 1 saves without harvest progress', () => {
    const storage = memoryStorage(),
      legacy = new ExpeditionState(resources).snapshot(SPAWN);
    delete legacy.harvestProgress;
    delete legacy.items;
    delete legacy.drops;
    legacy.inventory.wood = 1;
    legacy.collected = [0];
    legacy.repaired = [0];
    storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const loaded = new ExpeditionStorage(storage, resources).load();
    expect(loaded).toEqual(legacy);
    const state = new ExpeditionState(resources);
    state.restore(loaded!);
    expect(state.harvest.hit(0)).toBeNull();
    expect(state.repaired.has(0)).toBe(true);
  });
  it('saves partial mining without losing inventory, position or resource identity', () => {
    const storage = memoryStorage(),
      repository = new ExpeditionStorage(storage, resources),
      state = new ExpeditionState(resources);
    state.harvest.hit(3);
    state.inventory.wood = 4;
    const snapshot = state.snapshot(SPAWN);
    expect(repository.save(snapshot)).toBe(true);
    expect(repository.load()).toEqual(snapshot);
  });
  it('rejects corrupt saves and invalid mining progress safely', () => {
    const storage = memoryStorage(),
      repository = new ExpeditionStorage(storage, resources);
    for (const value of [
      'not json',
      JSON.stringify({ version: 2 }),
      JSON.stringify({
        ...new ExpeditionState(resources).snapshot(SPAWN),
        harvestProgress: [[3, 99]],
      }),
    ]) {
      storage.setItem(SAVE_KEY, value);
      expect(repository.load()).toBeNull();
    }
  });
  it('continues play when browser storage is unavailable or full', () => {
    const data = new ExpeditionState(resources).snapshot(SPAWN);
    const missing = new ExpeditionStorage(null, resources);
    expect(missing.load()).toBeNull();
    expect(missing.save(data)).toBe(false);
    const blocked = new ExpeditionStorage(
      {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('full');
        },
      },
      resources,
    );
    expect(blocked.load()).toBeNull();
    expect(blocked.save(data)).toBe(false);
  });
});
