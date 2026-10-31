import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { WORLD_ROUTES, ROUTE_SEGMENTS, type RouteSegment } from './routes';
import { terrainHeight } from './terrain';
import { LAUNCH } from './landmarks';
import { DOCK_APRON_RADIUS } from './ground-surface';
function bar(
  parent: THREE.Object3D,
  material: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius = 0.07,
) {
  const direction = b.clone().sub(a);
  const object = mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 6),
    material,
    parent,
  );
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}
function stripGeometry(segments: RouteSegment[]) {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (const s of segments) {
    if (
      s.route.kind !== 'bridge' &&
      Math.hypot((s.a.x + s.b.x) / 2 - LAUNCH.x, (s.a.z + s.b.z) / 2 - LAUNCH.z) <
        DOCK_APRON_RADIUS + 1
    )
      continue;
    const dx = (s.b.x - s.a.x) / s.length,
      dz = (s.b.z - s.a.z) / s.length,
      w = s.route.width / 2;
    const index = positions.length / 3;
    const vertices = [
      [s.a.x - dz * w, s.ay, s.a.z + dx * w],
      [s.a.x + dz * w, s.ay, s.a.z - dx * w],
      [s.b.x - dz * w, s.by, s.b.z + dx * w],
      [s.b.x + dz * w, s.by, s.b.z - dx * w],
    ];
    for (const vertex of vertices) positions.push(...vertex);
    const color = new THREE.Color(
      s.route.kind === 'bridge'
        ? s.index % 2
          ? 0x9b8060
          : 0xaa906d
        : s.route.kind === 'trail'
          ? 0xb4a37f
          : 0xc5af85,
    );
    for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b);
    indices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3);
    if (s.route.kind === 'bridge') {
      for (const vertex of vertices) positions.push(vertex[0], vertex[1] - 0.38, vertex[2]);
      for (let i = 0; i < 4; i++) colors.push(color.r * 0.72, color.g * 0.72, color.b * 0.72);
      indices.push(
        index,
        index + 4,
        index + 2,
        index + 2,
        index + 4,
        index + 6,
        index + 1,
        index + 3,
        index + 5,
        index + 3,
        index + 7,
        index + 5,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export class RouteView {
  readonly root = new THREE.Group();
  constructor(scene: THREE.Scene) {
    this.root.name = 'world-routes';
    scene.add(this.root);
    const wood = mat(0x716047),
      rope = mat(0x544e3f),
      stone = mat(0x7d897a);
    for (const route of WORLD_ROUTES) {
      const group = new THREE.Group();
      group.name = `route-${route.id}`;
      this.root.add(group);
      const segments = ROUTE_SEGMENTS.filter((s) => s.route === route);
      const deck = mesh(
        stripGeometry(segments),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
        group,
      );
      deck.name = `route-deck-${route.id}`;
      if (route.kind !== 'bridge') continue;
      for (const s of segments.filter((_, i) => i % 2 === 0)) {
        const dx = (s.b.x - s.a.x) / s.length,
          dz = (s.b.z - s.a.z) / s.length;
        for (const side of [-1, 1]) {
          const x = s.a.x + dz * (route.width / 2 - 0.18) * side,
            z = s.a.z - dx * (route.width / 2 - 0.18) * side;
          mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.9, 6), wood, group, x, s.ay + 0.95, z);
          const next = segments[Math.min(s.index + 2, segments.length - 1)];
          bar(
            group,
            rope,
            new THREE.Vector3(x, s.ay + 1.7, z),
            new THREE.Vector3(
              next.a.x + dz * (route.width / 2 - 0.18) * side,
              next.ay + 1.7,
              next.a.z - dx * (route.width / 2 - 0.18) * side,
            ),
          );
        }
      }
      for (const s of segments.filter((_, i) => i % 6 === 0)) {
        const dx = (s.b.x - s.a.x) / s.length,
          dz = (s.b.z - s.a.z) / s.length;
        const bottom = Math.max(-1.5, terrainHeight(s.a.x, s.a.z) - 0.5),
          height = s.ay - bottom;
        for (const side of [-1, 1]) {
          const x = s.a.x + dz * (route.width / 2 - 0.5) * side,
            z = s.a.z - dx * (route.width / 2 - 0.5) * side;
          mesh(
            new THREE.CylinderGeometry(0.34, 0.45, Math.max(0.4, height), 7),
            wood,
            group,
            x,
            bottom + height / 2,
            z,
          );
        }
        const next = segments[Math.min(s.index + 6, segments.length - 1)];
        if (next !== s && height > 5) {
          for (const side of [-1, 1]) {
            const offsetX = dz * (route.width / 2 - 0.5) * side,
              offsetZ = -dx * (route.width / 2 - 0.5) * side;
            const low = Math.max(bottom + 1.5, s.ay - height * 0.65),
              nextLow = Math.max(-0.5, terrainHeight(next.a.x, next.a.z)) + 1.5;
            bar(
              group,
              wood,
              new THREE.Vector3(s.a.x + offsetX, low, s.a.z + offsetZ),
              new THREE.Vector3(next.a.x + offsetX, next.ay - 0.6, next.a.z + offsetZ),
              0.12,
            );
            bar(
              group,
              wood,
              new THREE.Vector3(s.a.x + offsetX, s.ay - 0.6, s.a.z + offsetZ),
              new THREE.Vector3(
                next.a.x + offsetX,
                Math.min(next.ay - 0.6, nextLow),
                next.a.z + offsetZ,
              ),
              0.12,
            );
          }
        }
        bar(
          group,
          wood,
          new THREE.Vector3(
            s.a.x - (dz * route.width) / 2,
            s.ay - 0.55,
            s.a.z + (dx * route.width) / 2,
          ),
          new THREE.Vector3(
            s.a.x + (dz * route.width) / 2,
            s.ay - 0.55,
            s.a.z - (dx * route.width) / 2,
          ),
          0.18,
        );
      }
      if (route.level) {
        const last = segments.at(-1)!,
          dx = (last.b.x - last.a.x) / last.length,
          dz = (last.b.z - last.a.z) / last.length;
        for (const side of [-1, 1])
          mesh(
            new THREE.CylinderGeometry(0.12, 0.16, 1.9, 6),
            wood,
            group,
            last.b.x + dz * (route.width / 2 - 0.18) * side,
            last.by + 0.95,
            last.b.z - dx * (route.width / 2 - 0.18) * side,
          );
        bar(
          group,
          rope,
          new THREE.Vector3(
            last.b.x - dz * (route.width / 2 - 0.18),
            last.by + 1.7,
            last.b.z + dx * (route.width / 2 - 0.18),
          ),
          new THREE.Vector3(
            last.b.x + dz * (route.width / 2 - 0.18),
            last.by + 1.7,
            last.b.z - dx * (route.width / 2 - 0.18),
          ),
        );
      }
      for (const end of [segments[0], segments.at(-1)!]) {
        const dx = (end.b.x - end.a.x) / end.length,
          dz = (end.b.z - end.a.z) / end.length;
        for (const side of [-1, 1])
          mesh(
            new THREE.BoxGeometry(0.9, 2.1, 0.9),
            stone,
            group,
            end.a.x + dz * side * (route.width / 2 + 0.4),
            end.ay + 1.05,
            end.a.z - dx * side * (route.width / 2 + 0.4),
          );
      }
    }
    // Wayfinding posts identify forks without blocking the walking lane.
    for (const p of [
      [-96, -60],
      [76, 151],
      [125, 133],
      [-65, 102],
      [180, -86],
    ]) {
      const y = terrainHeight(p[0] + 5, p[1]);
      mesh(new THREE.CylinderGeometry(0.14, 0.2, 3.6, 6), wood, this.root, p[0] + 5, y + 1.8, p[1]);
      mesh(new THREE.BoxGeometry(2.7, 0.6, 0.14), wood, this.root, p[0] + 5.5, y + 2.9, p[1]);
      const arrow = mesh(
        new THREE.ConeGeometry(0.35, 0.7, 3),
        mat(0xe4cc8b),
        this.root,
        p[0] + 6.8,
        y + 2.9,
        p[1] - 0.1,
      );
      arrow.rotation.z = -Math.PI / 2;
    }
  }
}
