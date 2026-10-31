import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { SkyView } from '../src/game/sky/sky-view';
import { SkyJourney } from '../src/game/sky/sky-journey';
import { CameraController } from '../src/game/player/camera-controller';
import { MeshCameraCollision } from '../src/game/player/mesh-camera-collision';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import {
  groundSurface,
  LAUNCH,
  LIFT_RADIUS,
  launchHeight,
  ridePosition,
} from '../src/game/sky/sky-world';
import { terrainHeight } from '../src/game/world/terrain';
import { disposeScene } from '../src/game/shared/dispose';
describe('lift rendering regressions', () => {
  let scene: THREE.Scene, view: SkyView;
  const journey = new SkyJourney();
  beforeAll(() => {
    scene = new THREE.Scene();
    view = new SkyView(scene);
    journey.built = true;
    view.update(0, journey, launchHeight());
  });
  afterAll(() => disposeScene(scene));
  it('has only one visible surface at the deck height, with terrain and support underneath', () => {
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const x of [-4, 0, 4])
      for (const z of [-3, 0, 3]) {
        ray.set(
          new THREE.Vector3(LAUNCH.x + x, launchHeight() + 1, LAUNCH.z + z),
          new THREE.Vector3(0, -1, 0),
        );
        const hits = ray.intersectObjects(scene.children, true);
        const coplanar = hits.filter((hit) => Math.abs(hit.point.y - launchHeight()) < 0.01);
        expect(coplanar.length).toBeGreaterThan(0);
        expect(coplanar.every((hit) => hit.object.parent?.name === 'sky-lift')).toBe(true);
        expect(launchHeight() - terrainHeight(LAUNCH.x + x, LAUNCH.z + z)).toBeGreaterThan(0.3);
        expect(
          hits
            .filter((hit) => hit.object.name === 'lift-ground-support')
            .every((hit) => hit.point.y <= launchHeight() - 0.6),
        ).toBe(true);
      }
  });
  it('keeps a walkable, continuous approach onto the raised ground dock', () => {
    const p = new PlayerController([], new Set(), () => {});
    p.teleport(LAUNCH.x, groundSurface(LAUNCH.x, LAUNCH.z + 13), LAUNCH.z + 13, false);
    for (let frame = 0; frame < 155; frame++) {
      const oldY = p.position.y;
      p.update(1 / 60, 0, 1, 0, false);
      expect(Math.abs(p.position.y - oldY)).toBeLessThan(0.1);
    }
    expect(Math.abs(p.position.z - LAUNCH.z)).toBeLessThan(2);
    expect(p.position.y).toBeCloseTo(launchHeight(), 5);
  });
  it.each([
    { yaw: 0.06, pitch: 0.18, zoom: 38 },
    { yaw: 1.5, pitch: 0.1, zoom: 12 },
    { yaw: -2.4, pitch: 0.6, zoom: 65 },
  ])(
    'keeps the actual smoothed camera outside walls throughout both rides: %j',
    ({ yaw, pitch, zoom }) => {
      const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 2400);
      const position = new THREE.Vector3(LAUNCH.x, launchHeight(), LAUNCH.z);
      const controller = new CameraController(camera, [], new Set(), position, [view.root]);
      const collision = new MeshCameraCollision([view.root]);
      controller.yaw = yaw;
      controller.rotate(0, (pitch - 0.18) / 0.004);
      controller.zoomBy((zoom - 38) / 0.025);
      const transit = new SkyJourney();
      transit.built = true;
      for (const descending of [false, true]) {
        transit.ride = { elapsed: 0, descending };
        for (let frame = 0; frame <= 480; frame++) {
          const p = ridePosition(frame / 480, descending);
          position.set(p.x, p.y, p.z);
          view.update(frame / 60, transit, p.y);
          controller.update(position, 1 / 60, true);
          const target = position.clone().add(new THREE.Vector3(0, 2.2, 0));
          expect(collision.clearance(target, camera.position, 0)).toBeCloseTo(1, 5);
          expect(camera.position.distanceTo(target)).toBeGreaterThan(2);
          if (yaw === 0.06 && frame > 60) {
            camera.updateMatrixWorld();
            for (const y of [0.2, 4.65]) {
              const screen = position
                .clone()
                .add(new THREE.Vector3(0, y, 0))
                .project(camera);
              expect(Math.abs(screen.x)).toBeLessThan(0.95);
              expect(Math.abs(screen.y)).toBeLessThan(0.95);
            }
          }
        }
      }
    },
  );
  it('keeps soles on the moving platform rather than using an airborne pose or ground terrain', () => {
    const actorScene = new THREE.Scene(),
      actor = new PlayerView(actorScene);
    for (let frame = 0; frame <= 480; frame++) {
      const p = ridePosition(frame / 480, false),
        position = new THREE.Vector3(p.x, p.y, p.z);
      actor.update(frame / 60, position, false, 8, false, { grounded: true, platformHeight: p.y });
      actorScene.updateMatrixWorld(true);
      for (const side of ['left', 'right']) {
        const foot = actor.group.getObjectByName(`${side}-foot`)!;
        const bottom = new THREE.Box3().setFromObject(foot).min.y;
        expect(bottom).toBeCloseTo(p.y, 4);
      }
    }
    disposeScene(actorScene);
  });
  it('treats the inner shaft wall as an obstacle even from inside its hollow center', () => {
    const collision = new MeshCameraCollision([view.root]);
    const from = new THREE.Vector3(LAUNCH.x, 140, LAUNCH.z),
      to = from.clone().add(new THREE.Vector3(38, 3, 0));
    const fraction = collision.clearance(from, to);
    expect(fraction).toBeLessThan(LIFT_RADIUS / 38);
    expect(fraction).toBeGreaterThan(0.08);
  });
});
