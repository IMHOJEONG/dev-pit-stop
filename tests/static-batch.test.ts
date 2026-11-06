import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { batchStaticMeshes } from '../src/game/shared/static-batch';

describe('static geometry batching', () => {
  it('preserves world-space triangles and double-sided occlusion under transformed parents', () => {
    const root = new THREE.Group(),
      parent = new THREE.Group();
    root.position.set(-50, 12, 80);
    root.rotation.y = 0.4;
    root.add(parent);
    parent.position.set(4, 1, 2);
    parent.rotation.z = 0.1;
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const sources = [0, 4, 8].map((x) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 2), material);
      mesh.position.set(x, 3, 4);
      mesh.scale.set(1, 1 + x / 20, 0.7);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    });
    root.updateMatrixWorld(true);
    const rays: THREE.Raycaster[] = [];
    for (let x = -2; x < 15; x += 0.4)
      for (let y = 0; y < 10; y += 0.7) {
        const from = root.localToWorld(new THREE.Vector3(x, y, -8));
        const to = root.localToWorld(new THREE.Vector3(x, y, 15));
        rays.push(new THREE.Raycaster(from, to.sub(from).normalize()));
      }
    const before = rays.map((r) => r.intersectObjects([root], true)[0]?.distance ?? null);
    expect(batchStaticMeshes(root, sources)).toBe(2);
    root.updateMatrixWorld(true);
    rays.forEach((r, i) => {
      const after = r.intersectObjects([root], true)[0]?.distance ?? null;
      if (before[i] === null) expect(after).toBeNull();
      else expect(after).toBeCloseTo(before[i]!, 5);
    });
  });

  it('keeps culling cells, render flags and shared surviving geometry separate', () => {
    const root = new THREE.Group(),
      geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    let disposals = 0;
    geometry.addEventListener('dispose', () => disposals++);
    const sources = [1, 2, 70, 71].map((x) => {
      const object = new THREE.Mesh(geometry, material);
      object.position.x = x;
      root.add(object);
      return object;
    });
    const survivor = new THREE.Mesh(geometry, material);
    survivor.castShadow = true;
    root.add(survivor);
    expect(batchStaticMeshes(root, [...sources, survivor])).toBe(2);
    expect(root.children.length).toBe(3);
    expect(survivor.parent).toBe(root);
    expect(disposals).toBe(0);
    const glass = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true }));
    root.add(glass);
    expect(batchStaticMeshes(root, [survivor, glass])).toBe(0);
  });
});
