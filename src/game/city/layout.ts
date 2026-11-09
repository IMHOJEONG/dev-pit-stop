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
export const CITY_SIZE = 412;
export const ROAD_WIDTH = 16;
export const ROAD_AXES = [-168, -112, -56, 0, 56, 112, 168];
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
  // Offices north of the original blocks.
  { x: -188, z: -188, width: 22, depth: 22, height: 19, color: 0x87948a },
  { x: -140, z: -188, width: 28, depth: 21, height: 25, color: 0x8f9ca4 },
  { x: -84, z: -188, width: 27, depth: 24, height: 33, color: 0x657f8c },
  { x: -28, z: -188, width: 30, depth: 23, height: 47, color: 0x738994 },
  { x: 28, z: -188, width: 27, depth: 22, height: 36, color: 0x9a9b8e },
  { x: 84, z: -188, width: 29, depth: 22, height: 29, color: 0x7c8c96 },
  { x: 140, z: -188, width: 29, depth: 22, height: 21, color: 0xa3978a },
  { x: -140, z: -140, width: 29, depth: 29, height: 21, color: 0x9a998d },
  { x: -84, z: -140, width: 31, depth: 27, height: 39, color: 0x85969f },
  { x: 28, z: -140, width: 29, depth: 32, height: 45, color: 0x617e8c },
  { x: 84, z: -140, width: 30, depth: 28, height: 32, color: 0x879399 },
  { x: 188, z: -140, width: 22, depth: 30, height: 19, color: 0xad9987 },
  // Low workshops and warehouses along the western streets.
  { x: -188, z: -84, width: 22, depth: 31, height: 12, color: 0x9b806c },
  { x: -140, z: -84, width: 35, depth: 28, height: 15, color: 0x936e61 },
  { x: -188, z: -28, width: 22, depth: 32, height: 11, color: 0xad8a70 },
  { x: -188, z: 28, width: 22, depth: 29, height: 16, color: 0x9c8872 },
  { x: -140, z: 28, width: 34, depth: 30, height: 12, color: 0xb1977f },
  { x: -140, z: 84, width: 30, depth: 32, height: 14, color: 0x8f7c70 },
  // The east park sits between larger apartment blocks.
  { x: 140, z: -84, width: 30, depth: 32, height: 25, color: 0xb0a394 },
  { x: 188, z: -84, width: 22, depth: 30, height: 21, color: 0x9a8880 },
  { x: 140, z: -28, width: 28, depth: 33, height: 32, color: 0x80979a },
  { x: 188, z: 28, width: 23, depth: 31, height: 23, color: 0x9d9c86 },
  { x: 140, z: 84, width: 31, depth: 28, height: 28, color: 0xa6a092 },
  { x: 188, z: 84, width: 21, depth: 28, height: 17, color: 0x84938a },
  // Shorter residential blocks face the southern garden.
  { x: -188, z: 140, width: 23, depth: 27, height: 12, color: 0xaaa18e },
  { x: -140, z: 140, width: 27, depth: 29, height: 16, color: 0xb0927d },
  { x: -84, z: 140, width: 30, depth: 31, height: 19, color: 0x889d92 },
  { x: -28, z: 140, width: 29, depth: 26, height: 17, color: 0xa98c80 },
  { x: 84, z: 140, width: 30, depth: 29, height: 20, color: 0xb3a087 },
  { x: 140, z: 140, width: 28, depth: 32, height: 16, color: 0x8e9b91 },
  { x: -140, z: 188, width: 30, depth: 23, height: 13, color: 0x9d8d7e },
  { x: -84, z: 188, width: 31, depth: 22, height: 15, color: 0xb2a388 },
  { x: -28, z: 188, width: 28, depth: 23, height: 18, color: 0x899792 },
  { x: 28, z: 188, width: 29, depth: 22, height: 15, color: 0xa88f7c },
  { x: 84, z: 188, width: 28, depth: 22, height: 13, color: 0x9e9d85 },
  { x: 188, z: 188, width: 22, depth: 22, height: 12, color: 0x9d938a },
];

export const CITY_SPACES = [
  {
    name: '가로수 공원',
    x: -28,
    z: 28,
    width: 32,
    depth: 32,
    color: 0x7d9d70,
    mapColor: '#506b55',
  },
  { name: '중앙 광장', x: 28, z: -28, width: 32, depth: 32, color: 0xc9a98d, mapColor: '#735c49' },
  {
    name: '북쪽 광장',
    x: -28,
    z: -140,
    width: 36,
    depth: 36,
    color: 0xc6b49a,
    mapColor: '#735c49',
  },
  {
    name: '서쪽 쉼터',
    x: -140,
    z: -28,
    width: 35,
    depth: 34,
    color: 0x859d73,
    mapColor: '#506b55',
  },
  { name: '동쪽 공원', x: 140, z: 28, width: 38, depth: 38, color: 0x779768, mapColor: '#506b55' },
  { name: '남쪽 정원', x: 28, z: 140, width: 37, depth: 36, color: 0x8a9d69, mapColor: '#506b55' },
];

export const CITY_TREES = [
  [-40, 16],
  [-40, 40],
  [-16, 16],
  [-16, 40],
  [16, -40],
  [40, -40],
  [40, -16],
  [-42, -153],
  [-14, -153],
  [-42, -127],
  [-14, -127],
  [-153, -41],
  [-127, -15],
  [126, 14],
  [154, 14],
  [126, 42],
  [154, 42],
  [14, 127],
  [42, 127],
  [14, 153],
  [42, 153],
] as const;

export const CITY_LAYOUT: FlatMap = {
  height: 0,
  spawn: { x: -7, z: 24 },
  garage: { x: -2.8, z: 24, heading: 0 },
  vehicleSpeed: { straight: 12, cornering: 6 },
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
  vehicleBlocked(x, z, heading, halfWidth, halfLength) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const absCos = Math.abs(cos);
    const absSin = Math.abs(sin);
    const reachX = halfWidth * absCos + halfLength * absSin;
    const reachZ = halfWidth * absSin + halfLength * absCos;
    if (Math.abs(x) + reachX >= CITY_SIZE / 2 || Math.abs(z) + reachZ >= CITY_SIZE / 2) return true;

    // Separate along the city's axes first, then along the buggy's two axes.
    for (const building of CITY_BUILDINGS) {
      const dx = building.x - x;
      const dz = building.z - z;
      const width = building.width / 2;
      const depth = building.depth / 2;
      if (Math.abs(dx) >= width + reachX || Math.abs(dz) >= depth + reachZ) continue;
      if (
        Math.abs(dx * cos - dz * sin) < halfWidth + width * absCos + depth * absSin &&
        Math.abs(dx * sin + dz * cos) < halfLength + width * absSin + depth * absCos
      )
        return true;
    }
    for (const [tx, tz] of CITY_TREES) {
      const dx = tx - x;
      const dz = tz - z;
      const side = Math.max(0, Math.abs(dx * cos - dz * sin) - halfWidth);
      const along = Math.max(0, Math.abs(dx * sin + dz * cos) - halfLength);
      if (side * side + along * along < 0.45 ** 2) return true;
    }
    return false;
  },
};
