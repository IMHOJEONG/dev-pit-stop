import { HUMAN_WALK } from './human-walk';
/** Periodic cubic sampling preserves the small timing differences of the source joints. */
export function humanGait(phase: number): number[] {
  const time = (((phase % 1) + 1) % 1) * HUMAN_WALK.length;
  const i = Math.floor(time),
    u = time - i,
    n = HUMAN_WALK.length;
  return HUMAN_WALK[0].map((_, column) => {
    const a = HUMAN_WALK[(i + n - 1) % n][column],
      b = HUMAN_WALK[i][column];
    const c = HUMAN_WALK[(i + 1) % n][column],
      d = HUMAN_WALK[(i + 2) % n][column];
    return b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
  });
}
/** Heel contact, weight acceptance, flat support, heel rise, then toe push-off. */
export function footRoll(phase: number, stance: number) {
  if (phase < stance) {
    const u = phase / stance;
    if (u < 0.2) return 0.22 * (1 - u / 0.2) ** 2;
    if (u < 0.7) return 0;
    return -0.38 * ((u - 0.7) / 0.3) ** 2;
  }
  const u = (phase - stance) / (1 - stance);
  // Relax the ankle during recovery and lift the toes before the next heel strike.
  return -0.38 * (1 - u) ** 3 + 0.22 * u ** 3;
}

/** Lower the forefoot onto a descending tread before accepting weight. */
export function descendingFootRoll(phase: number, stance: number) {
  if (phase < stance) {
    const u = phase / stance;
    if (u < 0.2) return -0.12 * (1 - u / 0.2) ** 2;
    if (u < 0.7) return 0;
    return -0.22 * ((u - 0.7) / 0.3) ** 2;
  }
  const u = (phase - stance) / (1 - stance);
  return -0.22 * (1 - u) ** 3 - 0.12 * u ** 3;
}
