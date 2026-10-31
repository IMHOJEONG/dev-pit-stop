/** World units per second, matched to the character's walking and running stride. */
export const WALK_SPEED = 4.8;
export const RUN_SPEED = 11;

/** Leave time for weight transfer on steps without changing flat-ground travel. */
export function surfaceTravelScale(
  surface: (x: number, z: number) => number | null,
  x: number,
  z: number,
  dx: number,
  dz: number,
) {
  const a = surface(x + dx * 0.9, z + dz * 0.9);
  const b = surface(x - dx * 0.9, z - dz * 0.9);
  if (a === null || b === null) return 1;
  const grade = Math.abs(a - b) / 1.8;
  const nearA = surface(x + dx * 0.12, z + dz * 0.12);
  const nearB = surface(x - dx * 0.12, z - dz * 0.12);
  // Smooth roads and hills keep their normal pace; a flat tread with a rise ahead slows us.
  if (nearA === null || nearB === null || Math.abs(nearA - nearB) > 0.01) return 1;
  return Math.max(0.6, 1 - Math.max(0, grade - 0.03) * 2.2);
}
