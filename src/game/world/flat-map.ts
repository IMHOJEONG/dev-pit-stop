type Point = { x: number; z: number };

export interface FlatMap {
  height: number;
  spawn: Point;
  garage: Point & { heading: number };
  vehicleSpeed?: { straight: number; cornering: number };
  blocked(x: number, z: number, clearance: number): boolean;
  vehicleBlocked(
    x: number,
    z: number,
    heading: number,
    halfWidth: number,
    halfLength: number,
  ): boolean;
}
