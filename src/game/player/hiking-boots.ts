import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
/** Rounded footprint, narrower at the heel and slightly fuller along the outside edge. */
const outline = [
  [0, -0.443],
  [0.12, -0.426],
  [0.18, -0.355],
  [0.195, -0.19],
  [0.167, 0.095],
  [0.131, 0.215],
  [0, 0.223],
  [-0.131, 0.215],
  [-0.158, 0.09],
  [-0.183, -0.18],
  [-0.17, -0.35],
  [-0.112, -0.425],
];
function soleGeometry(width: number, depth: number, bevel: number) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) =>
    i === 0 ? shape.moveTo(x * width, -z) : shape.lineTo(x * width, -z),
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
/** A curved vamp with a low toe box and a taller instep, not a scaled cube. */
function upperGeometry(width: number, sections: number[][]) {
  const positions: number[] = [],
    indices: number[] = [],
    segments = 10;
  for (const [z, halfWidth, top] of sections) {
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI;
      positions.push(
        Math.cos(angle) * halfWidth * width,
        -0.11 + Math.sin(angle) * (top + 0.11),
        z,
      );
    }
  }
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j,
        b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // Close the heel and toe; the underside is covered by the stitched midsole.
  for (const row of [0, sections.length - 1]) {
    const center = positions.length / 3;
    positions.push(0, -0.11, sections[row][0]);
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      if (row === 0) indices.push(center, a, a + 1);
      else indices.push(center, a + 1, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function cord(
  parent: THREE.Group,
  material: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius = 0.009,
) {
  const direction = b.clone().sub(a);
  const lace = mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 6),
    material,
    parent,
  );
  lace.position.copy(a).add(b).multiplyScalar(0.5);
  lace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return lace;
}
export function createHikingBoot(width: number, side: number) {
  const boot = new THREE.Group();
  boot.name = side < 0 ? 'left-foot' : 'right-foot';
  boot.scale.x = side < 0 ? -1 : 1;
  const leather = mat(0x74523b, { flatShading: false, roughness: 0.88 });
  const panels = mat(0x4e3c2e, { flatShading: false }),
    rubber = mat(0x30322e),
    midsole = mat(0x8a826a);
  const lining = mat(0x3c443c),
    laces = mat(0xcbbb96),
    metal = mat(0x7e8277, { metalness: 0.45, roughness: 0.65 });
  const outsole = mesh(soleGeometry(width, 0.045, 0.012), rubber, boot, 0, -0.188);
  outsole.name = 'boot-outsole';
  const welt = mesh(soleGeometry(width * 0.97, 0.027, 0.006), midsole, boot, 0, -0.137);
  welt.name = 'boot-midsole';
  const vamp = mesh(
    upperGeometry(width, [
      [0.2, 0.135, 0.13],
      [0.12, 0.163, 0.2],
      [-0.02, 0.175, 0.2],
      [-0.17, 0.184, 0.13],
      [-0.32, 0.172, 0.055],
      [-0.415, 0.115, 0.015],
      [-0.444, 0.02, -0.025],
    ]),
    leather,
    boot,
  );
  vamp.name = 'boot-leather-upper';
  // A rubber toe bumper wraps over the front edge, and a heel counter supports the ankle.
  const toe = mesh(
    upperGeometry(width, [
      [-0.285, 0.179, 0.078],
      [-0.33, 0.172, 0.058],
      [-0.419, 0.118, 0.019],
      [-0.447, 0.02, -0.021],
    ]),
    panels,
    boot,
  );
  toe.name = 'boot-toe-cap';
  const heel = mesh(
    upperGeometry(width, [
      [0.211, 0.134, 0.15],
      [0.14, 0.17, 0.215],
    ]),
    panels,
    boot,
  );
  heel.name = 'boot-heel-counter';
  const cuff = new THREE.Group();
  cuff.name = 'boot-cuff';
  boot.add(cuff);
  const shaft = mesh(
    new THREE.CylinderGeometry(0.166 * width, 0.175 * width, 0.24, 12, 1, true),
    leather,
    cuff,
    0,
    0.18,
  );
  shaft.name = 'boot-ankle';
  const collar = mesh(new THREE.TorusGeometry(0.165 * width, 0.029, 6, 14), lining, cuff, 0, 0.305);
  collar.rotation.x = Math.PI / 2;
  collar.name = 'boot-padded-collar';
  const tongue = mesh(
    new THREE.BoxGeometry(0.16 * width, 0.035, 0.29),
    panels,
    boot,
    0,
    0.182,
    -0.12,
  );
  tongue.rotation.x = -0.55;
  tongue.name = 'boot-tongue';
  const laceHeight = (z: number) => 0.205 + (z + 0.12) * 0.6;
  for (let i = 0; i < 4; i++) {
    const z = -0.225 + i * 0.055,
      next = z + 0.035;
    for (const sign of [-1, 1]) {
      const x = sign * 0.084 * width;
      const eyelet = mesh(
        new THREE.TorusGeometry(0.014, 0.004, 4, 8),
        metal,
        boot,
        x,
        laceHeight(z),
        z,
      );
      eyelet.rotation.x = Math.PI / 2;
      const lace = cord(
        boot,
        laces,
        new THREE.Vector3(x, laceHeight(z) + 0.01, z),
        new THREE.Vector3(-x, laceHeight(next) + 0.01, next),
      );
      lace.name = 'boot-lace';
    }
  }
  for (const sign of [-1, 1]) {
    const loop = mesh(
      new THREE.TorusGeometry(0.025, 0.007, 5, 10),
      laces,
      boot,
      sign * 0.026,
      0.278,
      -0.005,
    );
    loop.rotation.x = Math.PI / 2;
    loop.scale.z = 0.6;
    cord(
      boot,
      laces,
      new THREE.Vector3(0, 0.283, -0.005),
      new THREE.Vector3(sign * 0.046, 0.25, -0.067),
      0.007,
    );
    // Small tread blocks give the rubber edge a real outsole silhouette.
    for (const z of [-0.32, -0.18, -0.04, 0.1])
      mesh(
        new THREE.BoxGeometry(0.035, 0.023, 0.043),
        rubber,
        boot,
        sign * 0.188 * width,
        -0.172,
        z,
      );
    // Seams follow the upper/sole join without adding a floating outline.
    for (let i = 0; i < 5; i++)
      mesh(
        new THREE.BoxGeometry(0.012, 0.009, 0.021),
        laces,
        boot,
        sign * (i < 3 ? 0.176 : 0.148) * width,
        -0.098,
        -0.29 + i * 0.1,
      );
  }
  // Keep the sole dimensions stable across presets so the ankle/contact rig remains valid.
  return boot;
}
