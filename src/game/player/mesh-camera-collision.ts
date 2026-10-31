import * as THREE from 'three';
/** Double-sided proxies catch walls from inside a shaft and floors from underneath. */
export class MeshCameraCollision {
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
  }
  clearance(from: THREE.Vector3, to: THREE.Vector3, padding = 0.65) {
    const direction = to.clone().sub(from),
      distance = direction.length();
    if (distance < 0.001) return 1;
    for (const { source, proxy } of this.obstacles) {
      source.updateWorldMatrix(true, false);
      proxy.matrixWorld.copy(source.matrixWorld);
      proxy.visible = source.visible;
    }
    this.ray.set(from, direction.normalize());
    this.ray.far = distance + padding;
    const hit = this.ray.intersectObjects(
      this.obstacles.filter((o) => o.proxy.visible).map((o) => o.proxy),
      false,
    )[0];
    return hit ? THREE.MathUtils.clamp((hit.distance - padding) / distance, 0, 1) : 1;
  }
}
