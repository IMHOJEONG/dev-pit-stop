/** Headless, read-only architecture audit. This does not measure browser FPS or GPU memory. */
import * as THREE from 'three';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import { WorldScene } from '../src/game/world/world-scene';
import { makeResources } from '../src/game/resources/distribution';
import { CameraController } from '../src/game/player/camera-controller';
import { PlayerController } from '../src/game/player/player-controller';
import { VehicleController } from '../src/game/vehicles/vehicle-controller';
import { SkyJourney } from '../src/game/sky/sky-journey';
import { landSurface } from '../src/game/world/routes';
import { WORLD_SIZE } from '../src/game/world/terrain';

const round = (n: number) => Math.round(n * 1000) / 1000;
function inventory(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  const buffers = new Set<ArrayBufferLike>();
  let meshes = 0,
    instancedMeshes = 0,
    instanceSlots = 0,
    shadowCastingMeshes = 0;
  let declaredTriangleInstances = 0;
  const buffer = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    buffers.add('data' in attribute ? attribute.data.array.buffer : attribute.array.buffer);
  };
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    if (object instanceof THREE.InstancedMesh) {
      instancedMeshes++;
      instanceSlots += count;
      buffer(object.instanceMatrix);
      if (object.instanceColor) buffer(object.instanceColor);
    }
    declaredTriangleInstances +=
      ((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) *
      count;
    shadowCastingMeshes += Number(object.castShadow);
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) buffer(attribute);
    if (geometry.index) buffer(geometry.index);
  }
  return {
    meshes,
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size,
    instancedMeshes,
    instanceSlots,
    declaredTriangleInstances,
    shadowCastingMeshes,
    declaredCpuBufferBytes: [...buffers].reduce((sum, b) => sum + b.byteLength, 0),
  };
}
function sample(iterations: number, operation: () => void) {
  for (let i = 0; i < 12; i++) operation();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    operation();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    iterations,
    meanMs: round(times.reduce((a, b) => a + b, 0) / iterations),
    p50Ms: round(times[Math.floor(iterations * 0.5)]),
    p95Ms: round(times[Math.floor(iterations * 0.95)]),
    maxMs: round(times.at(-1)!),
  };
}
const start = performance.now(),
  resources = makeResources(),
  generated = performance.now();
const world = new WorldScene(resources),
  built = performance.now();
const collected = new Set<number>(),
  vehicle = new VehicleController(resources, collected);
const player = new PlayerController(
  resources,
  collected,
  () => {},
  (x, z) => vehicle.blocksPedestrian(x, z),
);
const sky = new SkyJourney();
const cameraRoots = [world.sky.root, world.structures.root, world.routes.root, world.places.root];
let cameraMeshProxyCandidates = 0;
for (const root of cameraRoots)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.every((material) => material.transparent && material.opacity < 1))
      cameraMeshProxyCandidates++;
  });
const camera = new CameraController(
  world.camera,
  resources,
  collected,
  player.position,
  cameraRoots,
);
let t = 1;
const tick = (dt: number, position: THREE.Vector3, moving = false, speed = 0, heading = 0) => {
  t += dt;
  camera.update(position, 1 / 60);
  world.update(t, dt, 9.67, position, moving, speed, heading, false, true);
  world.player.group.visible = !vehicle.riding;
  world.vehicle.update(vehicle, dt);
  world.sky.update(t, sky, position.y);
};
world.vehicle.update(vehicle, 0);
const scene = inventory(world.scene);
const owners = Object.fromEntries(
  Object.entries({
    routes: world.routes.root,
    structures: world.structures.root,
    places: world.places.root,
    player: world.player.group,
    vehicle: world.vehicle.root,
    sky: world.sky.root,
  }).map(([name, root]) => [name, inventory(root)]),
);
const pausedCpu = sample(180, () => tick(0, player.position));
const walkCpu = sample(180, () => {
  const movement = player.update(1 / 60, 0, 1, 0, false);
  tick(1 / 60, player.position, movement.moving, movement.speed, player.heading);
});
vehicle.restore({ x: 125, z: 80, heading: 0, riding: true });
const driveCpu = sample(180, () => {
  vehicle.update(1 / 60, 1, 0, false);
  tick(1 / 60, vehicle.position, false, 0, vehicle.heading);
});
const mapStart = performance.now();
let checksum = 0;
for (let y = 0; y < 512; y++)
  for (let x = 0; x < 512; x++) {
    const wx = (x / 512 - 0.5) * WORLD_SIZE,
      wz = (y / 512 - 0.5) * WORLD_SIZE;
    checksum += landSurface(wx, wz) + landSurface(wx - 2, wz - 2);
  }
const mapHeightSamplingMs = round(performance.now() - mapStart);
const report = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: {
    runtime: process.versions.bun ? `Bun ${process.versions.bun}` : process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
  },
  methodology: {
    kind: 'headless CPU and scene inventory',
    gpu: false,
    renderer: false,
    canvasMapPainting: false,
    hud: false,
    storage: false,
    note: 'Not browser FPS, draw-call counts, GPU timings, GPU memory or an end-to-end startup benchmark. Scene counts include hidden/zero-scaled meshes and instance slots. Timings include 12 warm-up ticks per scenario; no scenario reuses a user save.',
  },
  resourceCount: resources.length,
  timings: {
    resourceGenerationMs: round(generated - start),
    worldConstructionMs: round(built - generated),
    mapHeightSamplingMs,
  },
  mapSampling: {
    heightQueries: 512 * 512 * 2,
    includes: 'height math only; excludes Color, ImageData and canvas',
    checksum: round(checksum),
  },
  scene,
  owners,
  cameraMeshProxyCandidates,
  cpuScenarios: {
    pausedViewAndCamera: pausedCpu,
    walkingSimulationViewAndCamera: walkCpu,
    drivingSimulationViewAndCamera: driveCpu,
  },
  config: {
    terrainSegments: [260, 260],
    terrainTriangles: 260 * 260 * 2,
    defaultMaxDpr: 1.7,
    shadowMap: [2048, 2048],
    simulationSubstepHz: 120,
  },
};
world.dispose();
console.log(JSON.stringify(report, null, 2));
