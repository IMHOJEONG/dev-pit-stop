/** Deterministic CPU comparison; no WebGL, user saves or browser FPS. */
import * as THREE from 'three';
import { cpus } from 'node:os';
import { WorldScene } from '../src/game/world/world-scene';
import { makeResources } from '../src/game/resources/distribution';
import { CameraController } from '../src/game/player/camera-controller';
import { LegacyCameraController } from '../tests/helpers/legacy-camera-controller';
import { distribution } from '../src/game/diagnostics/performance-samples';
import { groundSurface } from '../src/game/world/ground-surface';
import { STATIONS } from '../src/game/world/landmarks';
import { WORLD_PLACES } from '../src/game/world/places';
import { SkyJourney } from '../src/game/sky/sky-journey';
import { ridePosition } from '../src/game/sky/sky-world';
import { disposeScene } from '../src/game/shared/dispose';
const resources = makeResources(),
  collected = new Set<number>();
const world = new WorldScene(resources);
const roots = [world.sky.root, world.structures.root, world.routes.root, world.places.root];
const sky = new SkyJourney();
sky.built = true;
const land = (x: number, z: number) => new THREE.Vector3(x, groundSurface(x, z), z);
const mill = WORLD_PLACES.find((place) => place.kind === 'mill')!;
const cases = [
  { name: 'camp', pose: (_f: number) => ({ p: land(0, 195), yaw: 0.06, riding: false }) },
  {
    name: 'stairs-turns',
    pose: (f: number) => ({
      p: land(STATIONS[1].x, STATIONS[1].z + 13 + Math.cos(f / 40) * 6),
      yaw: Math.sin(f / 19) * Math.PI,
      riding: false,
    }),
  },
  {
    name: 'mill-walls',
    pose: (f: number) => ({ p: land(mill.x + 3, mill.z + 3), yaw: f / 50, riding: false }),
  },
  {
    name: 'bridge',
    pose: (f: number) => ({
      p: land(125, 90 - ((f % 600) / 600) * 80),
      yaw: Math.sin(f / 90) * 0.5,
      riding: false,
    }),
  },
  {
    name: 'moving-lift',
    pose: (f: number) => ({
      p: new THREE.Vector3().copy(ridePosition((f % 600) / 599, false)),
      yaw: 0.06,
      riding: true,
    }),
  },
];
const results = [];
for (const scenario of cases) {
  const first = scenario.pose(0).p;
  const oldCamera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 2400),
    newCamera = oldCamera.clone();
  const legacy = new LegacyCameraController(oldCamera, resources, collected, first, roots);
  const optimized = new CameraController(newCamera, resources, collected, first, roots);
  const oldTimes: number[] = [],
    newTimes: number[] = [];
  const stats = {
    legacyMesh: 0,
    optimizedMesh: 0,
    legacyMatrix: 0,
    optimizedMatrix: 0,
    resourceCandidates: 0,
  };
  let maxPositionError = 0;
  for (let i = -120; i < 600; i++) {
    const f = Math.max(0, i),
      { p, yaw, riding } = scenario.pose(f);
    sky.ride = riding ? { elapsed: f / 75, descending: false } : null;
    world.sky.update(f / 60, sky, p.y);
    world.structures.update(f / 60);
    world.places.update(f / 60);
    legacy.yaw = optimized.yaw = yaw;
    const run = (controller: CameraController | LegacyCameraController, times: number[]) => {
      const start = performance.now();
      controller.update(p, 1 / 60, riding);
      const ms = performance.now() - start;
      if (i >= 0) times.push(ms);
    };
    if (i % 2 === 0) {
      run(legacy, oldTimes);
      run(optimized, newTimes);
    } else {
      run(optimized, newTimes);
      run(legacy, oldTimes);
    }
    maxPositionError = Math.max(
      maxPositionError,
      oldCamera.position.distanceTo(newCamera.position),
    );
    if (i >= 0) {
      const a = legacy.queryStats,
        b = optimized.queryStats;
      stats.legacyMesh += a.meshCandidates;
      stats.optimizedMesh += b.meshCandidates;
      stats.legacyMatrix += a.matrixUpdates;
      stats.optimizedMatrix += b.matrixUpdates;
      stats.resourceCandidates += b.resourceCandidates;
    }
  }
  if (maxPositionError > 1e-5)
    throw new Error(`${scenario.name}: camera diverged by ${maxPositionError}`);
  const counters = Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, value / 600]),
  );
  results.push({
    scenario: scenario.name,
    frames: 600,
    legacyMs: distribution(oldTimes),
    optimizedMs: distribution(newTimes),
    counters,
    maxPositionError,
  });
  optimized.dispose();
}
disposeScene(world.scene);
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      environment: {
        runtime: `Bun ${process.versions.bun}`,
        cpu: cpus()[0]?.model,
        platform: process.platform,
        arch: process.arch,
      },
      seed: 2704,
      resources: resources.length,
      method:
        '120 warm-up + 600 frames/case; alternate old/new execution order; identical world poses; CPU-only, no renderer or saves',
      results,
    },
    null,
    2,
  ),
);
