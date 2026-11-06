import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Opt-in for owned, opaque, static meshes only. Keep cells small for view/shadow culling. */
export function batchStaticMeshes(root: THREE.Object3D, sources: THREE.Mesh[], cellSize = 32) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4(),
    center = new THREE.Vector3();
  const groups = new Map<string, THREE.Mesh[]>();
  for (const source of sources) {
    if (
      Array.isArray(source.material) ||
      source.material.transparent ||
      !source.visible ||
      source instanceof THREE.InstancedMesh ||
      source instanceof THREE.SkinnedMesh ||
      source.children.length
    )
      continue;
    source.geometry.computeBoundingBox();
    transform.multiplyMatrices(inverse, source.matrixWorld);
    source.geometry.boundingBox!.getCenter(center).applyMatrix4(transform);
    const key = [
      source.material.uuid,
      source.castShadow,
      source.receiveShadow,
      source.layers.mask,
      source.renderOrder,
      Math.floor(center.x / cellSize + 0.5),
      Math.floor(center.y / cellSize + 0.5),
      Math.floor(center.z / cellSize + 0.5),
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }
  const retired = new Set<THREE.BufferGeometry>();
  let removed = 0;
  for (const sources of groups.values()) {
    if (sources.length < 2) continue;
    const geometries = sources.map((source) =>
      source.geometry.clone().applyMatrix4(transform.multiplyMatrices(inverse, source.matrixWorld)),
    );
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = sources[0],
      batch = new THREE.Mesh(geometry, first.material);
    batch.name = `static-batch-${first.id}`;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.layers.mask = first.layers.mask;
    batch.renderOrder = first.renderOrder;
    root.add(batch);
    for (const source of sources) {
      source.removeFromParent();
      retired.add(source.geometry);
    }
    removed += sources.length - 1;
  }
  // Shared source buffers can still be used by unbatched meshes elsewhere in this root.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) retired.delete(o.geometry);
  });
  retired.forEach((g) => g.dispose());
  return removed;
}
