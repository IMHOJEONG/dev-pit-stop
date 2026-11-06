import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { random, clamp } from '../shared/math';
import { LAUNCH, DOCK_APRON_RADIUS } from '../sky/sky-world';
import { landSurface, nearestRoute, routeClearing } from './routes';
import { WORLD_SIZE } from './terrain';
import { STATIONS } from './landmarks';
export const TERRAIN_SEGMENTS = 260;
export const TERRAIN_TILE_SEGMENTS = 65;
const TILE_SIZE = (WORLD_SIZE * TERRAIN_TILE_SEGMENTS) / TERRAIN_SEGMENTS;

/** Preserve the original lattice, vertex attributes and triangle winding across tile borders. */
export function tileTerrainGeometry(
  geometry: THREE.BufferGeometry,
  segments: number,
  tile: number,
) {
  const tiles: THREE.BufferGeometry[] = [];
  const side = segments + 1,
    sourceIndices = geometry.index!.array;
  for (let z = 0; z < segments; z += tile)
    for (let x = 0; x < segments; x += tile) {
      const cols = Math.min(tile, segments - x),
        rows = Math.min(tile, segments - z);
      const stride = cols + 1,
        result = new THREE.BufferGeometry();
      for (const name of Object.keys(geometry.attributes)) {
        const a = geometry.getAttribute(name);
        const size = a.itemSize,
          values = new Float32Array(stride * (rows + 1) * size);
        for (let row = 0; row <= rows; row++) {
          const from = ((z + row) * side + x) * size;
          values.set(a.array.subarray(from, from + stride * size), row * stride * size);
        }
        result.setAttribute(name, new THREE.BufferAttribute(values, size, a.normalized));
      }
      const indices = new Uint16Array(cols * rows * 6);
      let next = 0;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const from = ((z + row) * segments + x + col) * 6;
          for (let i = 0; i < 6; i++) {
            const index = sourceIndices[from + i];
            indices[next++] = (Math.floor(index / side) - z) * stride + (index % side) - x;
          }
        }
      result.setIndex(new THREE.BufferAttribute(indices, 1));
      result.computeBoundingBox();
      result.computeBoundingSphere();
      tiles.push(result);
    }
  return tiles;
}

export function createTerrain(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rng = random(44);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      h = landSurface(x, z);
    pos.setY(i, h);
    const c = terrainColor(x, z, h);
    c.multiplyScalar(0.93 + rng() * 0.13);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  });
  const root = new THREE.Group();
  root.name = 'world-terrain';
  for (const tile of tileTerrainGeometry(geo, TERRAIN_SEGMENTS, TERRAIN_TILE_SEGMENTS))
    mesh(tile, material, root).castShadow = false;
  geo.dispose();
  scene.add(root);
}
export function terrainColor(x: number, z: number, h = landSurface(x, z)) {
  const c = new THREE.Color();
  if (h < 3) return c.set('#c7bf8f');
  if (h > 95) return c.set('#dce1d2');
  if (h > 73) return c.set('#8e9b85').lerp(new THREE.Color('#c4c7b1'), clamp((h - 73) / 25, 0, 1));
  c.set(z < -60 ? '#779c70' : '#a0b77a');
  c.lerp(new THREE.Color('#c8c88b'), (Math.sin(x * 0.021 + z * 0.014) + 1) * 0.18);
  const route = nearestRoute(x, z, 'ground');
  if (route && route.distance < route.segment.route.width / 2 + 1.5)
    c.lerp(new THREE.Color('#c6b185'), 0.8);
  return c;
}
export function createGrass(scene: THREE.Scene) {
  const dummy = new THREE.Object3D();
  const rng = random(89);
  const positions: { x: number; y: number; z: number; scale: number; cell: string }[] = [];
  const counts = new Map<string, number>();
  for (let i = 0; i < 6500; i++) {
    const x = (rng() - 0.5) * 980,
      z = (rng() - 0.5) * 900,
      h = landSurface(x, z);
    if (h > 5 && h < 72) {
      const scale = 0.6 + rng();
      if (
        Math.hypot(x - LAUNCH.x, z - LAUNCH.z) > DOCK_APRON_RADIUS + 0.5 &&
        !routeClearing(x, z, 2) &&
        !STATIONS.some((s) => Math.hypot(x - s.x, z - s.z) < 21)
      ) {
        const cell = `${Math.floor((x + WORLD_SIZE / 2) / TILE_SIZE)},${Math.floor((z + WORLD_SIZE / 2) / TILE_SIZE)}`;
        positions.push({ x, y: h + 0.4, z, scale, cell });
        counts.set(cell, (counts.get(cell) ?? 0) + 1);
      }
    }
  }
  const geometry = new THREE.ConeGeometry(0.3, 1.5, 3),
    material = mat(0x789060);
  const patches = new Map<string, { mesh: THREE.InstancedMesh; used: number }>();
  for (const [cell, count] of counts)
    patches.set(cell, { mesh: new THREE.InstancedMesh(geometry, material, count), used: 0 });
  const root = new THREE.Group();
  root.name = 'world-grass';
  const straw = new THREE.Color('#e9d5a2'),
    green = new THREE.Color('#96af75');
  positions.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.scale, p.scale, p.scale);
    dummy.rotation.set(0, rng() * 6.28, -0.15);
    dummy.updateMatrix();
    const patch = patches.get(p.cell)!;
    const index = patch.used++;
    patch.mesh.setMatrixAt(index, dummy.matrix);
    patch.mesh.setColorAt(index, i % 8 === 0 ? straw : green);
  });
  for (const { mesh: grass } of patches.values()) {
    grass.computeBoundingSphere();
    root.add(grass);
  }
  scene.add(root);
}
