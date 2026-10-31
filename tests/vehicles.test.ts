import { describe, expect, it } from 'vite-plus/test';
import { VehicleController, GARAGE } from '../src/game/vehicles/vehicle-controller';
import { makeResources } from '../src/game/resources/distribution';
import { groundSurface } from '../src/game/world/ground-surface';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { WORLD_REGIONS } from '../src/game/world/regions';
import { WORLD_ROUTES } from '../src/game/world/routes';
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
