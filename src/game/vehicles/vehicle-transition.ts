import * as THREE from 'three';
/** Walk around the parked body before stepping through its open side into the seat. */
export class VehicleTransition {
  readonly position = new THREE.Vector3();
  readonly duration = 0.7;
  elapsed = 0;
  seatBlend: number;
  walking = false;
  walkHeading = 0;
  private approachDistance = 0;
  private points: THREE.Vector3[];
  constructor(
    readonly kind: 'board' | 'exit',
    readonly from: THREE.Vector3,
    readonly to: THREE.Vector3,
    readonly heading: number,
    approach: THREE.Vector3[] = [],
  ) {
    this.position.copy(from);
    this.seatBlend = kind === 'board' ? 0 : 1;
    this.points = [from, ...approach];
    for (let i = 1; i < this.points.length; i++)
      this.approachDistance += this.points[i - 1].distanceTo(this.points[i]);
    this.walking = this.approachDistance > 0;
  }
  advance(dt: number) {
    const approachTime = this.approachDistance / 5.2;
    this.elapsed = Math.min(approachTime + this.duration, this.elapsed + Math.max(0, dt));
    this.walking = this.elapsed < approachTime;
    if (this.walking) {
      let remaining = this.elapsed * 5.2;
      for (let i = 1; i < this.points.length; i++) {
        const a = this.points[i - 1],
          b = this.points[i],
          length = a.distanceTo(b);
        if (remaining > length) {
          remaining -= length;
          continue;
        }
        this.position.lerpVectors(a, b, length ? remaining / length : 1);
        this.walkHeading = Math.atan2(a.x - b.x, a.z - b.z);
        break;
      }
      return false;
    }
    const t = Math.max(0, this.elapsed - approachTime) / this.duration,
      u = t * t * (3 - 2 * t);
    this.position.lerpVectors(this.points.at(-1)!, this.to, u);
    this.seatBlend = this.kind === 'board' ? u : 1 - u;
    return this.elapsed >= approachTime + this.duration;
  }
}
