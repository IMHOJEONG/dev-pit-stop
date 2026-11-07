import * as THREE from 'three';
import { SpatialGrid } from '../shared/spatial-grid';

interface Obstacle {
  source: THREE.Mesh;
  proxy: THREE.Mesh;
  bounds: THREE.Box3;
  localBounds: THREE.Box3;
  geometry: THREE.BufferGeometry;
  positionVersion: number;
  initialized: boolean;
}
/** Broadphase only rejects impossible hits; the original double-sided triangles remain authoritative. */
export class MeshCameraCollision {
  readonly stats = { registered: 0, queries: 0, matrixUpdates: 0, meshCandidates: 0 };
  private material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private obstacles: Obstacle[] = [];
  private grid = new SpatialGrid<Obstacle>();
  private candidates = new Set<Obstacle>();
  private rootsSet: Set<THREE.Object3D>;
  private ray = new THREE.Raycaster();
  private direction = new THREE.Vector3();
  private boxHit = new THREE.Vector3();
  private queryBounds = new THREE.Box3();
  private paddedBounds = new THREE.Box3();
  private hits: THREE.Intersection[] = [];
  private prepared = false;
  private disposed = false;
  constructor(private roots: THREE.Object3D[]) {
    this.roots = [...new Set(roots)];
    this.rootsSet = new Set(this.roots);
    this.rebuild();
  }
  private opaque(source: THREE.Mesh) {
    const materials = Array.isArray(source.material) ? source.material : [source.material];
    return !materials.every((material) => material.transparent && material.opacity < 1);
  }
  /** Call after adding/replacing obstacle nodes. Transform changes are detected automatically. */
  rebuild() {
    if (this.disposed) return;
    this.grid.clear();
    this.obstacles.length = 0;
    const seen = new Set<THREE.Mesh>();
    for (const root of this.roots)
      root.traverse((source) => {
        if (!(source instanceof THREE.Mesh) || seen.has(source) || !this.opaque(source)) return;
        seen.add(source);
        const proxy = new THREE.Mesh(source.geometry, this.material);
        proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false;
        this.obstacles.push({
          source,
          proxy,
          geometry: source.geometry,
          bounds: new THREE.Box3(),
          localBounds: new THREE.Box3(),
          positionVersion: -1,
          initialized: false,
        });
      });
    this.stats.registered = this.obstacles.length;
    this.prepared = false;
  }
  resetStats() {
    this.stats.queries = this.stats.matrixUpdates = this.stats.meshCandidates = 0;
  }
  beginFrame() {
    if (this.disposed) return;
    this.resetStats();
    this.sync();
    this.prepared = true;
  }
  endFrame() {
    this.prepared = false;
  }
  private sync() {
    // Update each hierarchy once, not once per leaf and once again for the smoothed ray.
    for (const root of this.roots) root.updateWorldMatrix(true, true);
    this.stats.matrixUpdates += this.obstacles.length;
    for (const entry of this.obstacles) {
      const { source } = entry,
        geometry = source.geometry;
      const attribute = geometry.getAttribute('position');
      const version =
        attribute && ('version' in attribute ? attribute.version : attribute.data.version);
      const geometryChanged = geometry !== entry.geometry || version !== entry.positionVersion;
      if (geometryChanged || !geometry.boundingBox) {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      }
      const localBounds = geometry.boundingBox!;
      if (
        entry.initialized &&
        !geometryChanged &&
        entry.localBounds.equals(localBounds) &&
        entry.proxy.matrixWorld.equals(source.matrixWorld)
      )
        continue;
      entry.geometry = entry.proxy.geometry = geometry;
      entry.positionVersion = version ?? 0;
      entry.localBounds.copy(localBounds);
      entry.proxy.matrixWorld.copy(source.matrixWorld);
      entry.bounds.copy(localBounds).applyMatrix4(source.matrixWorld);
      entry.initialized = true;
      const b = entry.bounds;
      this.grid.set(entry, b.min.x, b.min.z, b.max.x, b.max.z);
    }
  }
  private visible(source: THREE.Object3D) {
    let attached = false;
    for (let node: THREE.Object3D | null = source; node; node = node.parent) {
      if (!node.visible) return false;
      attached ||= this.rootsSet.has(node);
    }
    return attached;
  }
  clearance(from: THREE.Vector3, to: THREE.Vector3, padding = 0.65, padBounds = false) {
    if (this.disposed) return 1;
    this.direction.subVectors(to, from);
    const distance = this.direction.length();
    if (distance < 0.001) return 1;
    if (!this.prepared) this.sync();
    this.stats.queries++;
    this.ray.set(from, this.direction.multiplyScalar(1 / distance));
    const far = distance + padding;
    this.queryBounds.min.copy(from).min(to).addScalar(-padding);
    this.queryBounds.max.copy(from).max(to).addScalar(padding);
    const box = this.queryBounds;
    this.grid.query(box.min.x, box.min.z, box.max.x, box.max.z, this.candidates);
    let nearest = Infinity;
    for (const entry of this.candidates) {
      if (
        !this.visible(entry.source) ||
        !this.opaque(entry.source) ||
        !box.intersectsBox(entry.bounds)
      )
        continue;
      // Expanded bounds reserve space for the near plane even along a grazing wall.
      if (padBounds) {
        const bounds = this.paddedBounds.copy(entry.bounds).expandByScalar(padding);
        if (bounds.containsPoint(from)) return 0;
        const hit = this.ray.ray.intersectBox(bounds, this.boxHit);
        if (hit) nearest = Math.min(nearest, hit.distanceTo(from));
        continue;
      }
      if (!entry.bounds.containsPoint(from)) {
        const hit = this.ray.ray.intersectBox(entry.bounds, this.boxHit);
        if (!hit || hit.distanceToSquared(from) > far * far) continue;
      }
      this.stats.meshCandidates++;
      this.ray.far = Math.min(far, nearest);
      this.hits.length = 0;
      entry.proxy.raycast(this.ray, this.hits);
      for (const hit of this.hits) nearest = Math.min(nearest, hit.distance);
    }
    return Number.isFinite(nearest)
      ? THREE.MathUtils.clamp((nearest - (padBounds ? 0 : padding)) / distance, 0, 1)
      : 1;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.material.dispose(); // Geometries belong to the rendered world, not these CPU proxies.
    this.grid.clear();
    this.candidates.clear();
    this.obstacles.length = this.hits.length = 0;
    this.roots = [];
    this.rootsSet.clear();
  }
}
