import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { random, clamp } from '../shared/math';
import { LAUNCH, DOCK_APRON_RADIUS } from '../sky/sky-world';
import { landSurface, nearestRoute, routeClearing } from './routes';
import { WORLD_SIZE } from './terrain';
import { STATIONS } from './landmarks';
export function createTerrain(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 260, 260);
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
  const terrain = mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    scene,
  );
  terrain.castShadow = false;
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
  const positions: { x: number; z: number; scale: number }[] = [];
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
      )
        positions.push({ x, z, scale });
    }
  }
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.3, 1.5, 3),
    mat(0x789060),
    positions.length,
  );
  positions.forEach((p, i) => {
    dummy.position.set(p.x, landSurface(p.x, p.z) + 0.4, p.z);
    dummy.scale.set(p.scale, p.scale, p.scale);
    dummy.rotation.set(0, rng() * 6.28, -0.15);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, new THREE.Color(i % 8 === 0 ? '#e9d5a2' : '#96af75'));
  });
  scene.add(grass);
}
