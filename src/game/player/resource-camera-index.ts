import { SpatialGrid } from '../shared/spatial-grid';
import type { Resource } from '../resources/catalog';

/** Resources have fixed positions/scales; harvested ids remain filtered by cameraClearance. */
export class ResourceCameraIndex {
  private grid = new SpatialGrid<Resource>();
  private found = new Set<Resource>();
  private result: Resource[] = [];
  private margin = 0;
  constructor(resources: Resource[]) {
    for (const resource of resources) {
      this.grid.set(resource, resource.x, resource.z, resource.x, resource.z);
      this.margin = Math.max(
        this.margin,
        (resource.kind === 'wood' ? 4.4 : 2.7) * resource.scale + 1,
      );
    }
    // Legacy clearance also considers centers up to radius beyond the camera endpoint.
    // 2r covers that extension plus perpendicular radius at every yaw.
    this.margin *= 2;
  }
  query(from: { x: number; z: number }, to: { x: number; z: number }) {
    const m = this.margin;
    this.grid.query(
      Math.min(from.x, to.x) - m,
      Math.min(from.z, to.z) - m,
      Math.max(from.x, to.x) + m,
      Math.max(from.z, to.z) + m,
      this.found,
    );
    this.result.length = 0;
    for (const resource of this.found) this.result.push(resource);
    return this.result;
  }
  dispose() {
    this.grid.clear();
    this.found.clear();
    this.result.length = 0;
  }
}
