import { describe, expect, it } from 'vite-plus/test';
import { VehicleController, GARAGE } from '../src/game/vehicles/vehicle-controller';
import { makeResources } from '../src/game/resources/distribution';
import { groundSurface } from '../src/game/world/ground-surface';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { WORLD_REGIONS } from '../src/game/world/regions';
import { WORLD_ROUTES } from '../src/game/world/routes';
import { VehicleTransition } from '../src/game/vehicles/vehicle-transition';
import { VehicleView } from '../src/game/vehicles/vehicle-view';
import * as THREE from 'three';
const make = () => new VehicleController([], new Set());
const drive = (
  v: VehicleController,
  seconds: number,
  throttle = 1,
  steer = 0,
  brake = false,
  fps = 60,
) => {
  v.riding = true;
  for (let i = 0; i < seconds * fps; i++) v.update(1 / fps, throttle, steer, brake);
};
describe('exploration buggy', () => {
  it('parks at an unobstructed camp location in the real resource layout', () => {
    const v = new VehicleController(makeResources(), new Set());
    expect(v.canOccupy(GARAGE.x, GARAGE.z)).toBe(true);
    expect(v.riding).toBe(false);
  });
  it('requires proximity and the same level to board', () => {
    const v = make();
    expect(v.board({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(v.board({ ...v.position, y: v.position.y + 10 })).toBe(false);
    expect(v.board(v.position)).toBe(true);
    expect(v.board(v.position)).toBe(false);
  });
  it('accelerates gradually, coasts and brakes without changing to reverse', () => {
    const v = make();
    drive(v, 0.5);
    expect(v.speed).toBeCloseTo(5, 1);
    const speed = v.speed;
    drive(v, 0.5, 0);
    expect(v.speed).toBeLessThan(speed);
    drive(v, 0.5, 0, 0, true);
    expect(v.speed).toBe(0);
    expect(v.position.z).toBeLessThan(GARAGE.z);
  });
  it('slows down before reversing and caps reverse speed', () => {
    const v = make();
    drive(v, 1);
    drive(v, 0.25, -1);
    expect(v.speed).toBeGreaterThan(0);
    drive(v, 2, -1);
    expect(v.speed).toBe(-8);
  });
  it('smoothly steers in the driving direction and reverses steering in reverse', () => {
    const v = make();
    drive(v, 0.4, 1, 1);
    expect(v.heading).toBeLessThan(0);
    expect(v.position.x).toBeGreaterThan(GARAGE.x);
    const reverse = make();
    drive(reverse, 0.4, -1, 1);
    expect(reverse.heading).toBeGreaterThan(0);
    expect(v.steering).toBeLessThan(1);
  });
  it('gives matching travel at 30 and 120 frames per second', () => {
    const a = make(),
      b = make();
    drive(a, 1, 1, 0.2, false, 30);
    drive(b, 1, 1, 0.2, false, 120);
    expect(a.position.distanceTo(b.position)).toBeLessThan(0.001);
    expect(a.speed).toBeCloseTo(b.speed, 5);
  });
  it('blocks water, stairways, launch platforms and bridge rails while allowing the bridge lane', () => {
    const v = make();
    expect(v.canOccupy(125, 58)).toBe(true);
    expect(v.canOccupy(127.4, 58)).toBe(false);
    expect(v.canOccupy(-65, 88)).toBe(false);
    expect(v.canOccupy(-35, 125)).toBe(false);
    expect(v.canOccupy(590, 590)).toBe(false);
  });
  it('sweeps against resources and leaves the vehicle before the obstacle', () => {
    const v = new VehicleController([{ id: 0, kind: 'stone', x: 7, z: 185, scale: 1 }], new Set());
    drive(v, 3);
    expect(v.position.z).toBeGreaterThan(189);
    expect(v.speed).toBe(0);
    expect(v.blocked).toBe(true);
  });
  it('only exits at low speed into a clear place outside the parked body', () => {
    const v = make();
    drive(v, 0.5);
    expect(v.exit()).toBeNull();
    drive(v, 1, 0, 0, true);
    const p = v.exit();
    expect(p).not.toBeNull();
    expect(v.riding).toBe(false);
    expect(v.blocksPedestrian(p!.x, p!.z)).toBe(false);
    expect(v.blocksPedestrian(v.position.x, v.position.z)).toBe(true);
  });
  it('never consumes stamina or moves a parked vehicle', () => {
    const v = make(),
      before = v.position.clone();
    expect(v.update(1, 1, 1, false)).toBe(0);
    expect(v.position.equals(before)).toBe(true);
  });
  it('saves the parked location and restores a stopped driver; old saves keep the camp vehicle', () => {
    const resources = makeResources(),
      state = new ExpeditionState(resources);
    state.vehicle.board(state.vehicle.position);
    state.vehicle.update(0.3, 1, 0, false);
    const save = state.snapshot(state.vehicle.position);
    const loaded = new ExpeditionState(resources);
    loaded.restore(validateSave(save, resources.length)!);
    expect(loaded.vehicle.position.distanceTo(state.vehicle.position)).toBeLessThan(0.001);
    expect(loaded.vehicle.riding).toBe(true);
    expect(loaded.vehicle.speed).toBe(0);
    delete save.vehicle;
    loaded.restore(save);
    expect(loaded.vehicle.position.x).toBe(GARAGE.x);
    expect(loaded.vehicle.riding).toBe(false);
  });
  it('rejects malformed vehicle saves and recovers vehicles whose restored footprint is obstructed', () => {
    const state = new ExpeditionState(makeResources()),
      save = state.snapshot({ x: 0, z: 195 });
    expect(
      validateSave(
        { ...save, vehicle: { x: 0, z: 195, heading: NaN, riding: false } },
        state.resources.length,
      ),
    ).toBeNull();
    expect(
      validateSave(
        { ...save, vehicle: { x: 590, z: 590, heading: 0, riding: false } },
        state.resources.length,
      ),
    ).toBeNull();
    state.vehicle.restore({ x: -65, z: 88, heading: 0, riding: true });
    expect(state.vehicle.position.x).toBe(GARAGE.x);
    expect(state.vehicle.riding).toBe(false);
  });
  it('provides five reachable regional entrances along actual routes', () => {
    expect(WORLD_REGIONS).toHaveLength(5);
    for (const r of WORLD_REGIONS) {
      expect(groundSurface(r.x, r.z)).toBeGreaterThan(0.8);
      expect(
        WORLD_ROUTES.some((route) =>
          route.points.some((p) => Math.hypot(p.x - r.x, p.z - r.z) < 8),
        ),
      ).toBe(true);
    }
  });
  it('drives over the complete lake bridge in both directions without leaving its deck', () => {
    for (const reverse of [false, true]) {
      const v = new VehicleController(makeResources(), new Set());
      v.restore({ x: 125, z: reverse ? -21 : 133, heading: reverse ? Math.PI : 0, riding: true });
      for (
        let frame = 0;
        frame < 1200 && (reverse ? v.position.z < 133 : v.position.z > -21);
        frame++
      ) {
        v.update(1 / 60, 1, 0, false);
        expect(v.position.y).toBeCloseTo(groundSurface(v.position.x, v.position.z), 6);
      }
      expect(reverse ? v.position.z >= 133 : v.position.z <= -21).toBe(true);
    }
  });
  it('keeps the entire lift bypass driveable in the generated resource layout', () => {
    const v = new VehicleController(makeResources(), new Set()),
      route = WORLD_ROUTES.find((r) => r.id === 'lift-bypass')!;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        heading = Math.atan2(a.x - b.x, a.z - b.z);
      for (let t = 0; t <= 1; t += 0.05)
        expect(v.canOccupy(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, heading)).toBe(true);
    }
  });
  it.each([-0.95, -1, -1.05, -1.1, -1.16])(
    'crosses the southern lake road junction from heading %s',
    (heading) => {
      for (const fps of [30, 120]) {
        const v = new VehicleController(makeResources(), new Set([0, 1]));
        v.restore({ x: 88, z: 153, heading, riding: true });
        for (let frame = 0; frame < fps * 4 && v.position.x <= 110; frame++)
          v.update(1 / fps, 1, 0, false);
        expect(v.position.x).toBeGreaterThan(110);
        expect(v.blocked).toBe(false);
      }
    },
  );
  it('limits lateral acceleration during a sharp turn at driving speed', () => {
    const v = make();
    v.riding = true;
    v.speed = 24;
    v.steering = 1;
    const heading = v.heading;
    v.update(1 / 120, 1, 1, false);
    const yawRate = Math.abs(v.heading - heading) * 120;
    expect(Math.abs(v.speed) * yawRate).toBeLessThanOrEqual(8.001);
    const fastAngle = v.steeringAngle;
    v.speed = 3;
    expect(v.steeringAngle).toBeGreaterThan(fastAngle * 3);
  });
  it('keeps wheel rotation signed through reversing and braking', () => {
    const v = make();
    drive(v, 1, -1);
    const before = v.travel;
    drive(v, 0.5, 0, 0, true);
    expect(v.travel).toBeLessThan(before);
  });
  it('blends boarding and exiting continuously and pauses with the game', () => {
    for (const kind of ['board', 'exit'] as const) {
      const from = new THREE.Vector3(7, 23, 202),
        to = new THREE.Vector3(11.5, 23.2, 202);
      const transition = new VehicleTransition(kind, from, to, 0);
      expect(transition.advance(0)).toBe(false);
      expect(transition.position.equals(from)).toBe(true);
      transition.advance(0.35);
      expect(transition.seatBlend).toBeCloseTo(0.5);
      expect(transition.position.x).toBeCloseTo(9.25);
      const paused = transition.position.clone();
      transition.advance(0);
      expect(transition.position.equals(paused)).toBe(true);
      expect(transition.advance(0.35)).toBe(true);
      expect(transition.position.equals(to)).toBe(true);
    }
  });
  it('announces a regional arrival once and restores its destination and arrival state', () => {
    const state = new ExpeditionState(makeResources());
    state.navigation = { kind: 'region', index: 1 };
    expect(state.arrive({ x: 80, z: 150 })).toBeNull();
    expect(state.arrive({ x: 120, z: 132 })?.id).toBe('lake');
    expect(state.arrive({ x: 125, z: 130 })).toBeNull();
    const save = state.snapshot({ x: 125, z: 130 });
    expect(validateSave(save, state.resources.length)).not.toBeNull();
    const restored = new ExpeditionState(state.resources);
    restored.restore(save);
    expect(restored.navigation).toEqual({ kind: 'region', index: 1, arrived: true });
    expect(
      validateSave({ ...save, navigation: { kind: 'region', index: 99 } }, state.resources.length),
    ).toBeNull();
    expect(
      validateSave({ ...save, navigation: { kind: 'boat', index: 0 } }, state.resources.length),
    ).toBeNull();
    delete save.navigation;
    restored.restore(save);
    expect(restored.navigation).toBeNull();
  });
  it('suspends the chassis across a road height seam without a visible body jump', () => {
    const scene = new THREE.Scene(),
      view = new VehicleView(scene),
      v = make();
    v.position.set(86, groundSurface(86, 151), 151);
    view.update(v, 1 / 60);
    const before = view.root.position.y;
    v.position.set(86, groundSurface(86, 150), 150);
    view.update(v, 1 / 60);
    expect(Math.abs(view.root.position.y - before)).toBeLessThan(0.25);
    expect(view.root.position.y).toBeGreaterThan(groundSurface(86, 151) - 0.5);
  });
  it('walks around the parked bonnet before boarding from the front', () => {
    const v = make(),
      from = new THREE.Vector3(v.position.x, v.position.y, v.position.z - 5);
    const approach = v.boardingApproach(from);
    expect(approach).not.toBeNull();
    expect(approach!.length).toBeGreaterThan(0);
    const transition = new VehicleTransition('board', from, v.position.clone(), Math.PI, approach!);
    let walked = 0;
    for (let i = 0; i < 300; i++) {
      const done = transition.advance(1 / 60);
      if (transition.walking) {
        walked++;
        expect(v.blocksPedestrian(transition.position.x, transition.position.z)).toBe(false);
        expect(transition.seatBlend).toBe(0);
      }
      if (done) break;
    }
    expect(walked).toBeGreaterThan(30);
    expect(transition.seatBlend).toBe(1);
    expect(transition.position.equals(v.position)).toBe(true);
  });
  it('keeps boarding paths and side exits off the lake and its bridge railings', () => {
    const v = make();
    v.restore({ x: 125, z: 58, heading: 0, riding: true });
    expect(v.exit()).toBeNull();
    expect(v.riding).toBe(true);
    v.riding = false;
    const front = new THREE.Vector3(125, v.position.y, 53);
    expect(v.boardingApproach(front)).toBeNull();
  });
  it('places seated boots above the buggy floor and behind its bonnet', () => {
    const view = new VehicleView(new THREE.Scene()),
      v = make();
    v.riding = true;
    view.update(v, 1 / 60);
    view.root.updateMatrixWorld(true);
    for (const name of ['left-foot', 'right-foot']) {
      const foot = new THREE.Box3().setFromObject(view.root.getObjectByName(name)!);
      expect(foot.min.y - v.position.y).toBeGreaterThan(1.125);
      expect(foot.min.z - v.position.z).toBeGreaterThan(-1.5);
    }
  });
  it.each([false, true])(
    'smoothly centres a slightly misaligned buggy across the full bridge: reverse=%s',
    (reverse) => {
      const v = make();
      v.restore({
        x: 125.4,
        z: reverse ? -21 : 133,
        heading: reverse ? Math.PI + 0.08 : -0.08,
        riding: true,
      });
      for (let i = 0; i < 1200 && (reverse ? v.position.z < 133 : v.position.z > -21); i++) {
        v.update(1 / 60, 1, 0, false);
        expect(v.position.x).toBeGreaterThan(124.3);
        expect(v.position.x).toBeLessThan(125.7);
      }
      expect(reverse ? v.position.z >= 133 : v.position.z <= -21).toBe(true);
    },
  );
  it('does not let either side of a buggy cross a bridge railing to board or exit, including its landward end', () => {
    const v = make();
    v.restore({ x: 125, z: 127, heading: 0, riding: true });
    expect(v.onBridge).toBe(true);
    expect(v.exit()).toBeNull();
    v.riding = false;
    expect(v.boardingApproach(new THREE.Vector3(129.5, groundSurface(129.5, 127), 127))).toBeNull();
  });
  it('keeps the seated head below the roof and restores the driver appearance', () => {
    const scene = new THREE.Scene(),
      view = new VehicleView(scene),
      v = make();
    v.riding = true;
    view.update(v, 1 / 60);
    const root = view.root;
    expect(root.name).toBe('exploration-buggy');
    const canopy = new THREE.Box3().setFromObject(root.getObjectByName('buggy-canopy')!);
    const driver = new THREE.Box3().setFromObject(root.getObjectByName('buggy-driver')!);
    expect(driver.max.y).toBeLessThan(canopy.min.y - 0.1);
  });
});
