import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { SkyView } from '../src/game/sky/sky-view';
import { SkyJourney } from '../src/game/sky/sky-journey';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import {
  ISLANDS,
  LAUNCH,
  bridgeSteps,
  bridgePoint,
  skySurface,
  launchHeight,
} from '../src/game/sky/sky-world';
import { disposeScene } from '../src/game/shared/dispose';

describe('visible sky floors and walkable surfaces', () => {
  let scene: THREE.Scene, view: SkyView;
  const journey = new SkyJourney();
  const ray = new THREE.Raycaster();
  const floorAt = (x: number, z: number) => {
    scene.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObjects(scene.children, true)[0]?.point.y ?? null;
  };
  beforeAll(() => {
    scene = new THREE.Scene();
    view = new SkyView(scene);
    journey.built = true;
    journey.inSky = true;
    view.update(0, journey, ISLANDS[0].y);
  });
  afterAll(() => disposeScene(scene));
  it('docks the lift flush with the island, without overlapping coplanar floors', () => {
    expect(floorAt(LAUNCH.x, LAUNCH.z)).toBeCloseTo(ISLANDS[0].y, 5);
    const hits = ray
      .intersectObjects(scene.children, true)
      .filter((hit) => Math.abs(hit.point.y - ISLANDS[0].y) < 0.01);
    expect(hits.every((hit) => hit.object.parent?.name === 'sky-lift')).toBe(true);
    for (const offset of [5.4, 5.6, 7])
      expect(floorAt(LAUNCH.x + offset, LAUNCH.z)).toBeCloseTo(
        skySurface(LAUNCH.x + offset, LAUNCH.z)!,
        5,
      );
  });
  it('keeps the arrival shaft open and the deck height stable at both ride endpoints', () => {
    journey.inSky = false;
    journey.startRide();
    const halfway = journey.advanceRide(4)!;
    view.update(1, journey, halfway.position.y);
    expect(floorAt(LAUNCH.x, LAUNCH.z)).toBeCloseTo(halfway.position.y, 5);
    journey.advanceRide(4);
    view.update(2, journey, ISLANDS[0].y);
    expect(floorAt(LAUNCH.x, LAUNCH.z)).toBeCloseTo(ISLANDS[0].y, 5);
    journey.startRide();
    journey.advanceRide(8);
    view.update(3, journey, launchHeight());
    expect(floorAt(LAUNCH.x, LAUNCH.z)).toBeCloseTo(launchHeight(), 5);
    journey.inSky = true;
    view.update(4, journey, ISLANDS[0].y);
  });
  it('matches every rendered tread and landing to collision heights across the full bridge width', () => {
    for (let i = 0; i < 3; i++) {
      for (const step of bridgeSteps(i)) {
        const dx = step.end.x - step.start.x,
          dz = step.end.z - step.start.z;
        const length = Math.hypot(dx, dz);
        for (const side of [-2.5, 0, 2.5]) {
          const x = (step.start.x + step.end.x) / 2 + (dz / length) * side;
          const z = (step.start.z + step.end.z) / 2 - (dx / length) * side;
          expect(floorAt(x, z), `bridge ${i} at ${x},${z}`).toBeCloseTo(skySurface(x, z)!, 4);
        }
      }
    }
  });
  it('leaves actual visible gaps rather than overhanging planks', () => {
    for (const i of [1, 2]) {
      for (const t of [0.462, 0.485, 0.508]) {
        const p = bridgePoint(i, t);
        expect(floorAt(p.x, p.z)).toBeNull();
        expect(skySurface(p.x, p.z)).toBeNull();
      }
    }
  });
});

it.each([false, true])(
  'plants a foot on each stair with smooth body movement (descending: %s)',
  (descending) => {
    const scene = new THREE.Scene(),
      actor = new PlayerView(scene);
    const controller = new PlayerController([], new Set(), () => {});
    const start = bridgePoint(0, descending ? 0.85 : 0.15),
      destination = ISLANDS[descending ? 0 : 1];
    controller.teleport(start.x, start.y, start.z, true);
    actor.update(0, controller.position, false, 12, true);
    const boots = ['left-foot', 'right-foot'].map((name) => actor.group.getObjectByName(name)!);
    expect(boots).toHaveLength(2);
    for (let frame = 1; frame <= 90; frame++) {
      const yaw = Math.atan2(
        -(destination.x - controller.position.x),
        -(destination.z - controller.position.z),
      );
      const movement = controller.update(1 / 60, yaw, 1, 0, false);
      actor.group.rotation.y = controller.heading;
      actor.update(frame / 60, controller.position, movement.moving, movement.speed, true);
      scene.updateMatrixWorld(true);
      const clearance = boots.map((boot) => {
        const samples: number[] = [];
        for (const x of [-0.21, 0.21])
          for (const z of [-0.455, 0.235]) {
            const corner = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
            const height = skySurface(corner.x, corner.z);
            if (height !== null) samples.push(corner.y - height);
          }
        return Math.min(...samples);
      });
      expect(Math.min(...clearance.map(Math.abs)), `frame ${frame}: ${clearance}`).toBeLessThan(
        0.025,
      );
      expect(Math.min(...clearance)).toBeGreaterThan(-0.025);
    }
    disposeScene(scene);
  },
);
