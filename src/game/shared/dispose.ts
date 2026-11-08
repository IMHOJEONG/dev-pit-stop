import * as THREE from 'three';
import { assetRegistry } from './asset-registry';

export function disposeScene(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  scene.traverse((obj) => {
    assetRegistry.releaseOwner(obj);
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (
      obj instanceof THREE.DirectionalLight ||
      obj instanceof THREE.PointLight ||
      obj instanceof THREE.SpotLight
    )
      obj.shadow.dispose();
    if (obj instanceof THREE.Mesh) {
      if (!assetRegistry.ownsGeometry(obj.geometry)) geometries.add(obj.geometry);
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
