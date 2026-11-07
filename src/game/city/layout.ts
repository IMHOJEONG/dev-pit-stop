import type { FlatMap } from '../world/flat-map';

export interface CityLot {
  x: number;
  z: number;
  width: number;
  depth: number;
}

interface Building extends CityLot {
  height: number;
  color: number;
}

// World units are metres. Edit the footprints here to move both the meshes and their collisions.
export const CITY_SIZE = 188;
export const ROAD_WIDTH = 16;
export const ROAD_AXES = [-56, 0, 56];
export const CITY_BUILDINGS: readonly Building[] = [
  { x: -75, z: -76, width: 22, depth: 23, height: 18, color: 0xaa826c },
  { x: -28, z: -76, width: 29, depth: 20, height: 31, color: 0x748997 },
  { x: 28, z: -76, width: 28, depth: 21, height: 38, color: 0x5e7a87 },
  { x: 75, z: -76, width: 21, depth: 22, height: 19, color: 0xc0a187 },
  { x: -76, z: -28, width: 21, depth: 28, height: 23, color: 0x87948a },
  { x: -29, z: -28, width: 28, depth: 29, height: 42, color: 0x788c9f },
  { x: 75, z: -28, width: 22, depth: 26, height: 25, color: 0xab8070 },
  { x: -76, z: 28, width: 21, depth: 25, height: 16, color: 0xb09b80 },
  { x: 28, z: 28, width: 27, depth: 28, height: 27, color: 0x9b8c82 },
  { x: 76, z: 28, width: 20, depth: 28, height: 17, color: 0x7d9291 },
  { x: -76, z: 75, width: 20, depth: 21, height: 12, color: 0xb29276 },
  { x: -28, z: 76, width: 28, depth: 21, height: 20, color: 0xa18677 },
  { x: 28, z: 76, width: 28, depth: 21, height: 16, color: 0x869b91 },
  { x: 76, z: 76, width: 22, depth: 21, height: 13, color: 0xb5a58d },
];

export const CITY_SPACES = [
  { name: '가로수 공원', x: -28, z: 28, width: 32, depth: 32, color: 0x7d9d70 },
  { name: '중앙 광장', x: 28, z: -28, width: 32, depth: 32, color: 0xc9a98d },
];

export const CITY_TREES = [
  [-40, 16],
  [-40, 40],
  [-16, 16],
  [-16, 40],
  [16, -40],
  [40, -40],
  [40, -16],
] as const;

export const CITY_LAYOUT: FlatMap = {
  height: 0,
  spawn: { x: -7, z: 24 },
  garage: { x: -2.8, z: 24, heading: 0 },
  blocked(x, z, clearance) {
    const limit = CITY_SIZE / 2 - clearance;
    if (Math.abs(x) >= limit || Math.abs(z) >= limit) return true;
    return (
      CITY_BUILDINGS.some(
        (b) =>
          Math.abs(x - b.x) < b.width / 2 + clearance &&
          Math.abs(z - b.z) < b.depth / 2 + clearance,
      ) || CITY_TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.45 + clearance)
    );
  },
};
