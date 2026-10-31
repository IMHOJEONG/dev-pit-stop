import * as THREE from 'three';
export function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  scene.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
