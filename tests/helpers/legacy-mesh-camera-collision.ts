// Frozen full-scan reference for equivalence checks and CPU comparison.
import * as THREE from 'three';
/** Double-sided proxies catch walls from inside a shaft and floors from underneath. */
export class LegacyMeshCameraCollision {
  readonly stats = { registered: 0, queries: 0, matrixUpdates: 0, meshCandidates: 0 };
  private material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private obstacles: { source: THREE.Mesh; proxy: THREE.Mesh }[] = [];
  private ray = new THREE.Raycaster();
  constructor(roots: THREE.Object3D[]) {
    for (const root of roots)
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.every((material) => material.transparent && material.opacity < 1)) return;
        this.obstacles.push({
          source: object,
          proxy: new THREE.Mesh(object.geometry, this.material),
        });
      });
    this.stats.registered = this.obstacles.length;
  }
  resetStats() {
    this.stats.queries = this.stats.matrixUpdates = this.stats.meshCandidates = 0;
  }
  clearance(from: THREE.Vector3, to: THREE.Vector3, padding = 0.65) {
    const direction = to.clone().sub(from),
      distance = direction.length();
    if (distance < 0.001) return 1;
    this.stats.queries++;
    for (const { source, proxy } of this.obstacles) {
      source.updateWorldMatrix(true, false);
      this.stats.matrixUpdates++;
      proxy.matrixWorld.copy(source.matrixWorld);
      proxy.visible = source.visible;
    }
    this.ray.set(from, direction.normalize());
    this.ray.far = distance + padding;
    const visible = this.obstacles.filter((o) => o.proxy.visible);
    this.stats.meshCandidates += visible.length;
    const hit = this.ray.intersectObjects(
      visible.map((o) => o.proxy),
      false,
    )[0];
    return hit ? THREE.MathUtils.clamp((hit.distance - padding) / distance, 0, 1) : 1;
  }
}
