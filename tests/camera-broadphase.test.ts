import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { MeshCameraCollision } from '../src/game/player/mesh-camera-collision';
import { CameraController } from '../src/game/player/camera-controller';
import { ResourceCameraIndex } from '../src/game/player/resource-camera-index';
import { cameraClearance } from '../src/game/player/camera-collision';
import { LegacyMeshCameraCollision } from './helpers/legacy-mesh-camera-collision';
import { LegacyCameraController } from './helpers/legacy-camera-controller';
import { SpatialGrid } from '../src/game/shared/spatial-grid';
import { WorldScene } from '../src/game/world/world-scene';
import { makeResources } from '../src/game/resources/distribution';
import { groundSurface } from '../src/game/world/ground-surface';
import { STATIONS } from '../src/game/world/landmarks';
import { WORLD_PLACES } from '../src/game/world/places';
import { SkyJourney } from '../src/game/sky/sky-journey';
import { LAUNCH, ridePosition } from '../src/game/sky/sky-world';
import { disposeScene } from '../src/game/shared/dispose';

describe('camera broadphase safety', () => {
  const resources = makeResources(),
    collected = new Set<number>();
  let world: WorldScene, indexed: MeshCameraCollision, reference: LegacyMeshCameraCollision;
  beforeAll(() => {
    world = new WorldScene(resources);
    const roots = [world.sky.root, world.structures.root, world.routes.root, world.places.root];
    indexed = new MeshCameraCollision(roots);
    reference = new LegacyMeshCameraCollision(roots);
  });
  afterAll(() => {
    indexed.dispose();
    disposeScene(world.scene);
  });
  it('matches full triangle traversal at stairs, pillars, bridges, walls and the shaft at every tested yaw', () => {
    const positions = [
      ...STATIONS.flatMap((s) => [
        new THREE.Vector3(s.x, groundSurface(s.x, s.z + 13) + 3.3, s.z + 13),
        new THREE.Vector3(s.x - 4, groundSurface(s.x - 4, s.z + 7) + 3.3, s.z + 7),
      ]),
      ...WORLD_PLACES.map(
        (p) => new THREE.Vector3(p.x + 2, groundSurface(p.x + 2, p.z + 3) + 3.3, p.z + 3),
      ),
      new THREE.Vector3(125, groundSurface(125, 60) + 3.3, 60),
      new THREE.Vector3(LAUNCH.x, 140, LAUNCH.z),
    ];
    let checked = 0;
    for (const from of positions)
      for (let yaw = -Math.PI; yaw < Math.PI; yaw += Math.PI / 8)
        for (const pitch of [0.1, 0.6, 1.1])
          for (const zoom of [12, 38, 65]) {
            const to = from
              .clone()
              .add(
                new THREE.Vector3(
                  Math.sin(yaw) * Math.cos(pitch) * zoom,
                  Math.sin(pitch) * zoom,
                  Math.cos(yaw) * Math.cos(pitch) * zoom,
                ),
              );
            expect(indexed.clearance(from, to, 0.65)).toBeCloseTo(
              reference.clearance(from, to, 0.65),
              8,
            );
            checked++;
          }
    expect(checked).toBeGreaterThan(1800);
  });
  it('refits animated parent transforms and lift movement before both frame queries', () => {
    const sky = new SkyJourney();
    sky.built = true;
    for (const descending of [false, true])
      for (let frame = 0; frame <= 120; frame++) {
        sky.ride = { elapsed: frame / 15, descending };
        const p = ridePosition(frame / 120, descending);
        world.sky.update(frame / 15, sky, p.y);
        world.structures.update(frame / 15);
        world.places.update(frame / 15);
        const from = new THREE.Vector3(p.x, p.y + 2.2, p.z);
        indexed.beginFrame();
        for (const angle of [0.06, 1.5]) {
          const to = from
            .clone()
            .add(new THREE.Vector3(Math.sin(angle) * 38, 6, Math.cos(angle) * 38));
          expect(indexed.clearance(from, to)).toBeCloseTo(reference.clearance(from, to), 8);
        }
        expect(indexed.stats.matrixUpdates).toBe(indexed.stats.registered);
        indexed.endFrame();
      }
  });
  it('preserves full resource and terrain clearance across large resources, harvested ids and sky heights', () => {
    const index = new ResourceCameraIndex(resources);
    for (const resource of resources.slice(0, 20)) collected.add(resource.id);
    for (let i = 0; i < 600; i++) {
      const x = Math.sin(i * 2.39) * 510,
        z = Math.cos(i * 1.17) * 510;
      const from = new THREE.Vector3(x, groundSurface(x, z) + (i % 3 === 0 ? 140 : 3.3), z);
      const yaw = i * 0.34;
      const to = from.clone().add(new THREE.Vector3(Math.sin(yaw) * 65, 6, Math.cos(yaw) * 65));
      expect(cameraClearance(from, to, index.query(from, to), collected)).toBeCloseTo(
        cameraClearance(from, to, resources, collected),
        10,
      );
    }
    index.dispose();
    collected.clear();
  });
  it('keeps the smoothed real camera equal to the full-scan camera through stair turns', () => {
    const s = STATIONS[1],
      p = new THREE.Vector3(s.x, groundSurface(s.x, s.z + 20), s.z + 20);
    const roots = [world.sky.root, world.structures.root, world.routes.root, world.places.root];
    const a = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 2400),
      b = a.clone();
    const indexedCamera = new CameraController(a, resources, collected, p, roots);
    const legacyCamera = new LegacyCameraController(b, resources, collected, p, roots);
    for (let frame = 0; frame < 360; frame++) {
      p.z = s.z + 13 + Math.cos(frame / 40) * 6;
      p.y = groundSurface(p.x, p.z);
      indexedCamera.yaw = legacyCamera.yaw = Math.sin(frame / 19) * Math.PI;
      indexedCamera.update(p, 1 / 60);
      legacyCamera.update(p, 1 / 60);
      expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6);
      const target = p.clone().add(new THREE.Vector3(0, 3.3, 0));
      expect(reference.clearance(target, a.position, 0)).toBeCloseTo(1, 7);
    }
    indexedCamera.dispose();
  });
});

it('keeps thin, transformed, inside-origin and cell-boundary walls, and invalidates changed geometry', () => {
  const scene = new THREE.Scene(),
    parent = new THREE.Group();
  scene.add(parent);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.02, 10, 12), new THREE.MeshBasicMaterial());
  parent.add(wall);
  parent.position.set(32, 0, -32);
  parent.rotation.y = 0.53;
  parent.scale.set(2, 1.5, 0.7);
  const indexed = new MeshCameraCollision([parent]),
    legacy = new LegacyMeshCameraCollision([parent]);
  for (let i = 0; i < 60; i++) {
    parent.rotation.y += 0.1;
    parent.position.x += 1.2;
    const from = parent.position.clone().add(new THREE.Vector3(-20, 2, 0)),
      to = from.clone().add(new THREE.Vector3(40, 0, 0));
    expect(indexed.clearance(from, to)).toBeCloseTo(legacy.clearance(from, to), 9);
  }
  const from = wall.getWorldPosition(new THREE.Vector3()),
    to = from.clone().add(new THREE.Vector3(25, 0, 0));
  expect(indexed.clearance(from, to)).toBeCloseTo(legacy.clearance(from, to), 9);
  parent.visible = false;
  expect(indexed.clearance(from, to)).toBe(1);
  parent.visible = true;
  wall.geometry = new THREE.BoxGeometry(8, 10, 12);
  expect(indexed.clearance(from, to)).toBeCloseTo(
    new LegacyMeshCameraCollision([parent]).clearance(from, to),
    9,
  );
  parent.remove(wall);
  expect(indexed.clearance(from, to)).toBe(1);
  parent.add(wall);
  indexed.rebuild();
  let disposed = false;
  wall.geometry.addEventListener('dispose', () => {
    disposed = true;
  });
  indexed.dispose();
  indexed.dispose();
  expect(disposed).toBe(false);
  expect(indexed.clearance(from, to)).toBe(1);
  disposeScene(scene);
});

it('refits geometry that moves across grid cells without a node transform change', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 10), new THREE.MeshBasicMaterial());
  const scene = new THREE.Scene();
  scene.add(wall);
  const indexed = new MeshCameraCollision([wall]);
  indexed.clearance(new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0));
  const positions = wall.geometry.getAttribute('position');
  positions.applyMatrix4(new THREE.Matrix4().makeTranslation(128, 0, 0));
  positions.needsUpdate = true;
  expect(
    indexed.clearance(new THREE.Vector3(120, 0, 0), new THREE.Vector3(140, 0, 0)),
  ).toBeLessThan(0.4);
  indexed.dispose();
  disposeScene(scene);
});

it('does not lose oversized or negative-cell entries and removes their old memberships', () => {
  const grid = new SpatialGrid<string>(),
    found = new Set<string>();
  grid.set('wide', -10000, -10000, 10000, 10000);
  grid.set('edge', -32, -32, 0, 0);
  expect(grid.query(-32, -32, -32, -32, found).has('edge')).toBe(true);
  expect(found.has('wide')).toBe(true);
  grid.set('edge', 500, 500, 501, 501);
  expect(grid.query(-32, -32, 0, 0, found).has('edge')).toBe(false);
  grid.remove('wide');
  expect(grid.query(-100000, -100000, 100000, 100000, found).size).toBe(1);
  grid.clear();
  expect(grid.query(0, 0, 1, 1, found).size).toBe(0);
});
