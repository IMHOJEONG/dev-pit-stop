import * as THREE from 'three';
import {
  CITY_BUILDINGS,
  CITY_SIZE,
  CITY_SPACES,
  CITY_TREES,
  ROAD_AXES,
  ROAD_WIDTH,
} from './layout';

interface Box {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export function buildCity(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xb9d4df);
  scene.fog = new THREE.Fog(0xb9d4df, 100, 310);
  scene.add(new THREE.HemisphereLight(0xf1f5ff, 0xa38a71, 2.3));
  const sun = new THREE.DirectionalLight(0xffe5bd, 2.2);
  sun.position.set(-45, 80, 30);
  scene.add(sun);

  const geometry = new THREE.BoxGeometry();
  const asphalt = 0x434e54;
  const ground: Box[] = [
    { x: 0, z: 0, y: -1.1, width: 1200, depth: 1200, height: 1, color: 0x6395a6 },
    { x: 0, z: 0, y: -0.24, width: CITY_SIZE, depth: CITY_SIZE, height: 0.48, color: 0xa6a097 },
  ];
  const slab = (
    lot: { x: number; z: number; width: number; depth: number },
    color: number,
    y: number,
  ) => ground.push({ ...lot, height: 0.02, y, color });
  for (const axis of ROAD_AXES) {
    slab({ x: axis, z: 0, width: ROAD_WIDTH, depth: CITY_SIZE - 3 }, asphalt, 0.01);
    slab({ x: 0, z: axis, width: CITY_SIZE - 3, depth: ROAD_WIDTH }, asphalt, 0.012);
    for (let position = -88; position <= 88; position += 5) {
      if (ROAD_AXES.some((crossing) => Math.abs(crossing - position) < 11)) continue;
      slab({ x: axis, z: position, width: 0.2, depth: 2.7 }, 0xe8c778, 0.031);
      slab({ x: position, z: axis, width: 2.7, depth: 0.2 }, 0xe8c778, 0.031);
    }
  }
  for (const x of ROAD_AXES)
    for (const z of ROAD_AXES)
      for (const stripe of [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5]) {
        slab({ x: x + stripe, z: z + 7.2, width: 1.1, depth: 2.5 }, 0xe3e1d7, 0.031);
        slab({ x: x + 7.2, z: z + stripe, width: 2.5, depth: 1.1 }, 0xe3e1d7, 0.031);
      }
  for (const space of CITY_SPACES) {
    slab(space, space.color, 0.022);
    slab({ ...space, width: 3 }, 0xc3b8a2, 0.04);
    slab({ ...space, depth: 3 }, 0xc3b8a2, 0.042);
  }

  const walls = new THREE.Group();
  scene.add(walls);
  const details: Box[] = [];
  for (const building of CITY_BUILDINGS) {
    const { x, z, width, depth, height, color } = building;
    const wall = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    wall.position.set(x, height / 2, z);
    wall.scale.set(width, height, depth);
    walls.add(wall);
    details.push({
      x,
      y: height + 0.14,
      z,
      width: width + 0.35,
      height: 0.28,
      depth: depth + 0.35,
      color: 0xa5adab,
    });
    for (let y = 3; y < height - 1.2; y += 3.4) {
      const glass = Math.round(y / 3.4) % 3 ? 0x416273 : 0x6c8c93;
      for (let dx = -width / 2 + 2; dx < width / 2 - 1; dx += 3.2)
        for (const side of [-1, 1])
          details.push({
            x: x + dx,
            y,
            z: z + (side * depth) / 2,
            width: 1.9,
            height: 1.62,
            depth: 0.12,
            color: glass,
          });
      for (let dz = -depth / 2 + 2; dz < depth / 2 - 1; dz += 3.2)
        for (const side of [-1, 1])
          details.push({
            x: x + (side * width) / 2,
            y,
            z: z + dz,
            width: 0.12,
            height: 1.62,
            depth: 1.9,
            color: glass,
          });
    }
  }
  const trees = new THREE.Group();
  scene.add(trees);
  const trunk = new THREE.CylinderGeometry(0.28, 0.45, 3.7, 7);
  const crown = new THREE.IcosahedronGeometry(2.9, 0);
  const bark = new THREE.MeshLambertMaterial({ color: 0x7a6251 });
  const leaves = new THREE.MeshLambertMaterial({ color: 0x789561 });
  for (const [x, z] of CITY_TREES) {
    const stem = new THREE.Mesh(trunk, bark);
    stem.position.set(x, 1.85, z);
    trees.add(stem);
    const canopy = new THREE.Mesh(crown, leaves);
    canopy.position.set(x, 4.6, z);
    trees.add(canopy);
  }

  for (const boxes of [ground, details]) {
    const batch = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), boxes.length);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    boxes.forEach((box, i) => {
      transform.position.set(box.x, box.y, box.z);
      transform.scale.set(box.width, box.height, box.depth);
      transform.updateMatrix();
      batch.setMatrixAt(i, transform.matrix);
      batch.setColorAt(i, color.setHex(box.color));
    });
    scene.add(batch);
  }
  return [walls, trees];
}
