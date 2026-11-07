type Point = { x: number; z: number };

export interface FlatMap {
  height: number;
  spawn: Point;
  garage: Point & { heading: number };
  blocked(x: number, z: number, clearance: number): boolean;
}
