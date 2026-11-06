/** Conservative XZ broadphase. Oversized entries/queries fall back rather than disappear. */
export class SpatialGrid<T> {
  private cells = new Map<string, Set<T>>();
  private entries = new Map<T, { x0: number; z0: number; x1: number; z1: number }>();
  private large = new Set<T>();
  constructor(private cellSize = 32) {}
  set(value: T, minX: number, minZ: number, maxX: number, maxZ: number) {
    const x0 = Math.floor(minX / this.cellSize),
      z0 = Math.floor(minZ / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize),
      z1 = Math.floor(maxZ / this.cellSize);
    const old = this.entries.get(value);
    if (old && old.x0 === x0 && old.z0 === z0 && old.x1 === x1 && old.z1 === z1) return;
    this.remove(value);
    if (![x0, z0, x1, z1].every(Number.isFinite) || x0 > x1 || z0 > z1) return;
    this.entries.set(value, { x0, z0, x1, z1 });
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) {
      this.large.add(value);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = `${x}:${z}`;
        let cell = this.cells.get(key);
        if (!cell) this.cells.set(key, (cell = new Set()));
        cell.add(value);
      }
  }
  remove(value: T) {
    const old = this.entries.get(value);
    if (!old) return;
    this.entries.delete(value);
    if (this.large.delete(value)) return;
    for (let x = old.x0; x <= old.x1; x++)
      for (let z = old.z0; z <= old.z1; z++) {
        const key = `${x}:${z}`,
          cell = this.cells.get(key);
        cell?.delete(value);
        if (!cell?.size) this.cells.delete(key);
      }
  }
  query(minX: number, minZ: number, maxX: number, maxZ: number, result: Set<T>) {
    result.clear();
    const x0 = Math.floor(minX / this.cellSize),
      z0 = Math.floor(minZ / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize),
      z1 = Math.floor(maxZ / this.cellSize);
    if (![x0, z0, x1, z1].every(Number.isFinite) || (x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      for (const value of this.entries.keys()) result.add(value);
      return result;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const value of this.cells.get(`${x}:${z}`) ?? []) result.add(value);
    for (const value of this.large) result.add(value);
    return result;
  }
  clear() {
    this.cells.clear();
    this.entries.clear();
    this.large.clear();
  }
}
