import { describe, expect, it } from 'vite-plus/test';
import { SkyJourney } from '../src/game/sky/sky-journey';
import {
  ISLANDS,
  skySurface,
  bridgePoint,
  ridePosition,
  launchHeight,
} from '../src/game/sky/sky-world';
import { PlayerController } from '../src/game/player/player-controller';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { SPAWN } from '../src/game/world/terrain';
describe('ground to sky expedition', () => {
  it('requires a repaired station and exact construction supplies, with no double spending', () => {
    const s = new SkyJourney(),
      bag = { wood: 2, stone: 1, crystal: 1 };
    expect(s.build(bag, 0)).toBe(false);
    expect(bag.wood).toBe(2);
    expect(s.build(bag, 1)).toBe(true);
    expect(bag).toEqual({ wood: 0, stone: 0, crystal: 0 });
    expect(s.build(bag, 1)).toBe(false);
  });
  it('ascends continuously for eight seconds and can descend again', () => {
    const s = new SkyJourney();
    s.built = true;
    expect(s.startRide()).toBe(true);
    expect(s.startRide()).toBe(false);
    const middle = s.advanceRide(4)!;
    expect(middle.position.y).toBeGreaterThan(launchHeight());
    expect(middle.position.y).toBeLessThan(155);
    expect(s.inSky).toBe(false);
    expect(s.advanceRide(4)!.done).toBe(true);
    expect(s.inSky).toBe(true);
    s.startRide();
    expect(s.advanceRide(8)!.position.y).toBeCloseTo(launchHeight());
    expect(s.inSky).toBe(false);
  });
  it('requires the three runes in order before completing the sanctuary', () => {
    const s = new SkyJourney();
    expect(s.activate(0)).toBe(false);
    s.built = true;
    s.inSky = true;
    expect(s.activate(1)).toBe(false);
    expect(s.finish()).toBe(false);
    for (let i = 0; i < 3; i++) {
      expect(s.activate(i)).toBe(true);
      expect(s.activate(i)).toBe(false);
    }
    expect(s.finish()).toBe(true);
    expect(s.finish()).toBe(false);
    expect(s.checkpoint()).toEqual(ISLANDS[2]);
  });
  it('keeps sky progress in saves and rejects impossible progression', () => {
    const state = new ExpeditionState([]);
    state.sky.restore({ built: true, runes: 2, complete: false, inSky: true });
    const data = state.snapshot(SPAWN);
    expect(validateSave(data, 0)).not.toBeNull();
    const restored = new ExpeditionState([]);
    restored.restore(data);
    expect(restored.sky.snapshot()).toEqual(state.sky.snapshot());
    expect(
      validateSave({ ...data, sky: { built: false, runes: 3, complete: true, inSky: true } }, 0),
    ).toBeNull();
  });
});
describe('sky navigation', () => {
  it('provides surfaces on islands and real gaps on the higher bridges', () => {
    for (const p of ISLANDS) expect(skySurface(p.x, p.z)).toBe(p.y);
    const gap = bridgePoint(1, 0.485);
    expect(skySurface(gap.x, gap.z)).toBeNull();
    const solid = bridgePoint(1, 0.25);
    expect(skySurface(solid.x, solid.z)).not.toBeNull();
    expect(skySurface(500, 500)).toBeNull();
  });
  it('has exact lift endpoints', () => {
    expect(ridePosition(0, false).y).toBeCloseTo(launchHeight());
    expect(ridePosition(1, false).y).toBe(155);
  });
  it('supports walking, jumping and falling from a sky island without snapping to ground terrain', () => {
    const p = new PlayerController([], new Set(), () => {});
    p.teleport(-35, 155, 125, true);
    p.jump();
    p.update(0.1, 0, 0, 0, false);
    expect(p.position.y).toBeGreaterThan(155);
    p.teleport(300, 155, 300, true);
    for (let i = 0; i < 20; i++) p.update(0.05, 0, 0, 0, false);
    expect(p.position.y).toBeLessThan(145);
  });
});
it('can traverse every rising bridge and jump both gaps with normal movement', () => {
  const p = new PlayerController([], new Set(), () => {});
  p.teleport(ISLANDS[0].x, 155, ISLANDS[0].z, true);
  for (let i = 0; i < 3; i++) {
    const destination = ISLANDS[i + 1],
      gap = bridgePoint(i, 0.485);
    let jumped = false;
    for (
      let frame = 0;
      frame < 2400 && Math.hypot(p.position.x - destination.x, p.position.z - destination.z) > 2;
      frame++
    ) {
      if (i > 0 && !jumped && Math.hypot(p.position.x - gap.x, p.position.z - gap.z) < 3) {
        p.jump();
        jumped = true;
      }
      const yaw = Math.atan2(-(destination.x - p.position.x), -(destination.z - p.position.z));
      p.update(1 / 60, yaw, 1, 0, false);
    }
    expect(
      Math.hypot(p.position.x - destination.x, p.position.z - destination.z),
      `bridge ${i}: ${p.position.toArray()}`,
    ).toBeLessThan(3);
    expect(p.position.y).toBeGreaterThan(destination.y - 1);
  }
});
it('can save in the sky above water while rejecting a ground save away from the lake bridge', () => {
  const s = new ExpeditionState([]);
  s.sky.restore({ built: true, runes: 2, inSky: true, complete: false });
  expect(validateSave(s.snapshot({ x: 125, z: 58 }), 0)).not.toBeNull();
  s.sky.inSky = false;
  expect(validateSave(s.snapshot({ x: 135, z: 58 }), 0)).toBeNull();
});

it.each([30, 60, 144])('walks and runs up/down stairs at %i fps without landing pops', (fps) => {
  for (const sprint of [false, true]) {
    for (const descending of [false, true]) {
      const from = ISLANDS[descending ? 1 : 0],
        to = ISLANDS[descending ? 0 : 1];
      const p = new PlayerController([], new Set(), () => {});
      p.teleport(from.x, from.y, from.z, true);
      for (
        let frame = 0;
        frame < fps * 20 && Math.hypot(p.position.x - to.x, p.position.z - to.z) > 2;
        frame++
      ) {
        const oldY = p.position.y;
        const yaw = Math.atan2(-(to.x - p.position.x), -(to.z - p.position.z));
        p.update(1 / fps, yaw, 1, 0, sprint);
        expect(p.position.y).toBeCloseTo(skySurface(p.position.x, p.position.z)!, 6);
        expect(Math.abs(p.position.y - oldY)).toBeLessThan(0.65);
      }
      expect(Math.hypot(p.position.x - to.x, p.position.z - to.z)).toBeLessThan(3);
      expect(p.position.y).toBe(to.y);
    }
  }
});
it('does not pull a falling player onto an island from below', () => {
  const p = new PlayerController([], new Set(), () => {});
  p.teleport(ISLANDS[1].x + 30, ISLANDS[1].y - 5, ISLANDS[1].z, true);
  for (let frame = 0; frame < 90; frame++) p.update(1 / 60, Math.PI / 2, 1, 0, false);
  expect(p.position.y).toBeLessThan(ISLANDS[1].y - 5);
});
