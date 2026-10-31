import { describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { STATIONS } from '../src/game/world/landmarks';
import { StructuresView } from '../src/game/world/structures-view';
import {
  stationBase,
  stationSteps,
  stationBlocked,
  STATION_DECK_RISE,
} from '../src/game/world/station-layout';
import { groundSurface } from '../src/game/world/ground-surface';
import {
  landSurface,
  WORLD_ROUTES,
  ROUTE_SEGMENTS,
  routeSurface,
  nearestRoute,
} from '../src/game/world/routes';
import { RouteView } from '../src/game/world/route-view';
import { PlayerController } from '../src/game/player/player-controller';
import { makeResources, makeResourceLayout } from '../src/game/resources/distribution';
import { WORLD_PLACES } from '../src/game/world/places';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { disposeScene } from '../src/game/shared/dispose';

describe('station walkable geometry', () => {
  it.each(STATIONS.map((s, index) => ({ ...s, index })))(
    'walks up and down the rendered stairs at $name',
    ({ x, z, index }) => {
      const scene = new THREE.Scene(),
        structures = new StructuresView(scene);
      scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      for (const step of stationSteps(index)) {
        ray.set(new THREE.Vector3(step.x, step.height + 5, step.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(structures.root, true)[0];
        expect(hit.point.y).toBeCloseTo(step.height, 4);
        expect(groundSurface(step.x, step.z)).toBeCloseTo(step.height, 4);
        expect(step.height - stationBase(index)).toBeGreaterThan(0.1);
      }
      for (const descending of [false, true])
        for (const fps of [30, 60]) {
          const p = new PlayerController(makeResources(), new Set(), () => {});
          p.teleport(
            x,
            groundSurface(x, z + (descending ? 5 : 21)),
            z + (descending ? 5 : 21),
            false,
          );
          const target = z + (descending ? 21 : 5);
          for (let frame = 0; frame < fps * 8 && Math.abs(p.position.z - target) > 0.2; frame++) {
            const before = p.position.y;
            p.update(1 / fps, descending ? Math.PI : 0, 1, 0, false);
            expect(Math.abs(p.position.y - before)).toBeLessThan(0.25);
            expect(p.position.y).toBeCloseTo(groundSurface(p.position.x, p.position.z), 6);
          }
          expect(Math.abs(p.position.z - target)).toBeLessThan(0.3);
          if (!descending)
            expect(p.position.y).toBeCloseTo(stationBase(index) + STATION_DECK_RISE, 5);
        }
      expect(stationBlocked(x, z)).toBe(true);
      expect(stationBlocked(x, z + 5)).toBe(false);
      disposeScene(scene);
    },
  );
});
it('renders bridges at the exact shared surface height and supports saves over water', () => {
  const scene = new THREE.Scene(),
    view = new RouteView(scene);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const route of WORLD_ROUTES.filter((r) => r.kind === 'bridge')) {
    const segments = ROUTE_SEGMENTS.filter((s) => s.route === route);
    for (const segment of segments) {
      const x = (segment.a.x + segment.b.x) / 2,
        z = (segment.a.z + segment.b.z) / 2,
        y = (segment.ay + segment.by) / 2;
      ray.set(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(
        view.root.getObjectByName(`route-deck-${route.id}`)!,
        false,
      )[0];
      expect(hit).toBeDefined();
      expect(hit.point.y).toBeCloseTo(y, 4);
      expect(routeSurface(x, z)).toBeCloseTo(y, 4);
    }
  }
  const state = new ExpeditionState([]);
  expect(validateSave(state.snapshot({ x: 125, z: 58 }), 0)).not.toBeNull();
  expect(validateSave(state.snapshot({ x: 135, z: 58 }), 0)).toBeNull();
  disposeScene(scene);
});
it('walks the entire lake bridge in both directions without jumping or sinking', () => {
  for (const descending of [false, true]) {
    const p = new PlayerController(makeResources(), new Set(), () => {});
    const from = descending ? -21 : 133,
      to = descending ? 133 : -21;
    p.teleport(125, groundSurface(125, from), from, false);
    for (let frame = 0; frame < 2400 && Math.abs(p.position.z - to) > 0.3; frame++) {
      p.update(1 / 60, descending ? Math.PI : 0, 1, 0, false);
      expect(p.position.y).toBeCloseTo(groundSurface(p.position.x, p.position.z), 5);
      expect(p.position.y).toBeGreaterThan(15);
    }
    expect(Math.abs(p.position.z - to)).toBeLessThan(0.4);
  }
});
it('preserves resource IDs, types and supplies while keeping the new roads clear', () => {
  const old = makeResourceLayout(),
    current = makeResources();
  expect(current.map((r) => [r.id, r.kind, r.scale])).toEqual(
    old.map((r) => [r.id, r.kind, r.scale]),
  );
  for (const r of current) {
    const route = nearestRoute(r.x, r.z),
      clearance = r.kind === 'wood' ? 4.2 * r.scale : 2.5 * r.scale;
    if (route)
      expect(route.distance, `resource ${r.id}`).toBeGreaterThanOrEqual(
        route.segment.route.width / 2 + clearance + 0.9,
      );
    expect(landSurface(r.x, r.z)).toBeGreaterThan(3);
  }
});
it('discovers side destinations once and restores discoveries without breaking old saves', () => {
  const state = new ExpeditionState([]),
    p = WORLD_PLACES[0];
  expect(state.discover(p).map((v) => v.id)).toEqual([p.id]);
  expect(state.discover(p)).toEqual([]);
  const data = state.snapshot(p),
    loaded = validateSave(data, 0)!;
  const restored = new ExpeditionState([]);
  restored.restore(loaded);
  expect([...restored.discoveries]).toEqual([p.id]);
  delete data.discoveries;
  restored.restore(data);
  expect(restored.discoveries.size).toBe(0);
  expect(validateSave({ ...data, discoveries: ['not-a-place'] }, 0)).toBeNull();
});
it('keeps every route on dry ground or on a bridge rather than sending roads into the lake', () => {
  for (const s of ROUTE_SEGMENTS) {
    const x = (s.a.x + s.b.x) / 2,
      z = (s.a.z + s.b.z) / 2;
    expect(groundSurface(x, z), s.route.id).toBeGreaterThan(0.8);
  }
});
it('restores older positions inside station plinths to a nearby clear walking surface', () => {
  for (const station of STATIONS) {
    const player = new PlayerController([], new Set(), () => {});
    player.reset(station.x, station.z);
    expect(stationBlocked(player.position.x, player.position.z)).toBe(false);
    expect(Math.hypot(player.position.x - station.x, player.position.z - station.z)).toBeLessThan(
      10,
    );
    expect(player.position.y).toBeCloseTo(groundSurface(player.position.x, player.position.z), 5);
  }
});
