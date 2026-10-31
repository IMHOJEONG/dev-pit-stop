import { describe, expect, it } from 'vite-plus/test';
import { makeResources } from '../src/game/resources/distribution';
import { terrainHeight, SPAWN } from '../src/game/world/terrain';
import { STATIONS, canRepair, spendRepairCost } from '../src/game/world/landmarks';
import { validateSave } from '../src/game/persistence/save-data';
import type { SaveData } from '../src/game/persistence/save-data';
import { random } from '../src/game/shared/math';
import { cameraClearance } from '../src/game/player/camera-collision';

describe('procedural island', () => {
  it('recreates the same playable resource layout from its seed', () => {
    const a = makeResources();
    expect(a).toEqual(makeResources());
    expect(makeResources(99)).not.toEqual(a);
    expect(a.length).toBeGreaterThan(500);
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
    for (const r of a) expect(terrainHeight(r.x, r.z)).toBeGreaterThan(3);
  });
  it('puts the spawn and every objective on dry ground', () => {
    for (const p of [SPAWN, ...STATIONS]) {
      expect(terrainHeight(p.x, p.z)).toBeGreaterThan(1);
      expect(Number.isFinite(terrainHeight(p.x, p.z))).toBe(true);
    }
    expect(terrainHeight(610, 610)).toBeLessThan(0);
    expect(terrainHeight(125, 58)).toBeLessThan(0);
  });
  it('provides enough nearby supplies for the first repair and enough world supplies for all three', () => {
    const supplies = makeResources();
    for (const [kind, cost] of [
      ['wood', 3],
      ['stone', 2],
      ['crystal', 1],
    ] as const) {
      const nearby = supplies.filter(
        (r) => r.kind === kind && Math.hypot(r.x - SPAWN.x, r.z - SPAWN.z) < 55,
      );
      expect(nearby.length).toBeGreaterThanOrEqual(cost);
      expect(supplies.filter((r) => r.kind === kind).length).toBeGreaterThan(cost * 3);
    }
  });
  it('generates stable bounded random values', () => {
    const a = random(4),
      b = random(4);
    for (let i = 0; i < 100; i++) {
      const n = a();
      expect(n).toBe(b());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('station repair economy', () => {
  it('rejects partial supplies without changing inventory', () => {
    const inventory = { wood: 5, stone: 1, crystal: 2 };
    expect(canRepair(inventory)).toBe(false);
    expect(spendRepairCost(inventory)).toBeNull();
    expect(inventory).toEqual({ wood: 5, stone: 1, crystal: 2 });
  });
  it('spends the exact cost once and prevents a second repair without supplies', () => {
    const result = spendRepairCost({ wood: 3, stone: 2, crystal: 1 });
    expect(result).toEqual({ wood: 0, stone: 0, crystal: 0 });
    expect(spendRepairCost(result!)).toBeNull();
  });
});

describe('saved expedition validation', () => {
  const save: SaveData = {
    version: 1,
    x: SPAWN.x,
    z: SPAWN.z,
    time: 9.5,
    inventory: { wood: 3, stone: 2, crystal: 1 },
    collected: [0, 1],
    repaired: [0],
    visited: ['0,9'],
    distance: 120,
  };
  it('round trips a valid expedition', () => {
    expect(validateSave(JSON.parse(JSON.stringify(save)), makeResources().length)).toEqual(save);
  });
  it.each([
    { x: Infinity },
    { z: 900 },
    { x: 610, z: 610 },
    { time: -1 },
    { time: 'noon' },
    { inventory: { wood: -1, stone: 2, crystal: 1 } },
    { inventory: { wood: 1.2, stone: 2, crystal: 1 } },
    { collected: [-1] },
    { collected: [999999] },
    { repaired: [3] },
    { visited: ['<script>'] },
    { version: 2 },
    { distance: NaN },
  ])('rejects invalid state %j', (invalid) => {
    expect(validateSave({ ...save, ...invalid }, makeResources().length)).toBeNull();
  });
  it('ignores unrelated malformed storage', () => {
    for (const data of [null, 'hello', [], {}, 4]) expect(validateSave(data, 1000)).toBeNull();
  });
});

describe('third-person camera obstruction', () => {
  const ground = terrainHeight(0, 200);
  const from = { x: 0, y: ground + 4, z: 180 };
  const to = { x: 0, y: ground + 9, z: 220 };
  const tree = { id: 0, x: 0, z: 210, kind: 'wood' as const, scale: 1 };
  it('pulls the camera in front of a tree canopy', () => {
    expect(cameraClearance(from, to, [tree], new Set())).toBeLessThan(0.7);
  });
  it('does not obstruct the camera with harvested trees or scenery behind the player', () => {
    expect(cameraClearance(from, to, [tree], new Set([0]))).toBe(1);
    expect(cameraClearance(from, to, [{ ...tree, z: 130 }], new Set())).toBe(1);
  });
  it('leaves clear views at the intended distance', () => {
    expect(cameraClearance(from, to, [{ ...tree, x: 30 }], new Set())).toBe(1);
  });
});
