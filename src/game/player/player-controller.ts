import { WALK_SPEED, RUN_SPEED, surfaceTravelScale } from './movement';
import * as THREE from 'three';
import { SPAWN } from '../world/terrain';
import { skySurface, STEP_HEIGHT } from '../sky/sky-world';
import { groundSurface } from '../world/ground-surface';
import { bridgeRailBlocked } from '../world/routes';
import { placeBlocked } from '../world/places';
import { stationBlocked, stationSurface, constrainStationPosition } from '../world/station-layout';
import { clamp } from '../shared/math';
import type { Resource } from '../resources/catalog';
export class PlayerController {
  readonly position = new THREE.Vector3(SPAWN.x, groundSurface(SPAWN.x, SPAWN.z), SPAWN.z);
  private velocity = new THREE.Vector3();
  private grounded = true;
  private shoreCooldown = 0;
  get isGrounded() {
    return this.grounded;
  }
  stamina = 100;
  heading = 0;
  elevated = false;
  teleport(x: number, y: number, z: number, elevated: boolean) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.elevated = elevated;
  }
  constructor(
    private resources: Resource[],
    private collected: Set<number>,
    private onShore: () => void,
    private extraBlocked: (x: number, z: number) => boolean = () => false,
  ) {}
  jump() {
    if (this.grounded) {
      this.velocity.y = this.elevated ? 18 : 13;
      this.grounded = false;
    }
  }
  reset(x = SPAWN.x, z = SPAWN.z) {
    const blocked = (px: number, pz: number) =>
      stationBlocked(px, pz) ||
      placeBlocked(px, pz) ||
      bridgeRailBlocked(px, pz) ||
      this.extraBlocked(px, pz);
    // Older saves could stand inside a plinth before its collision footprint existed.
    if (blocked(x, z)) {
      const originalX = x,
        originalZ = z;
      search: for (let radius = 1; radius <= 16; radius++)
        for (let step = 0; step < 16; step++) {
          const angle = (step / 16) * Math.PI * 2,
            px = originalX + Math.cos(angle) * radius,
            pz = originalZ + Math.sin(angle) * radius;
          if (!blocked(px, pz) && groundSurface(px, pz) > 0.8) {
            x = px;
            z = pz;
            break search;
          }
        }
    }
    this.elevated = false;
    this.position.set(x, groundSurface(x, z), z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.stamina = 100;
  }
  update(dt: number, yaw: number, forward: number, right: number, sprinting: boolean) {
    // Resolve each tread even when a slow frame covers several steps.
    const count = Math.max(1, Math.ceil(dt / (1 / 120)));
    let result = { moving: false, speed: 0, distance: 0 };
    let distance = 0;
    for (let i = 0; i < count; i++) {
      result = this.advance(dt / count, yaw, forward, right, sprinting);
      distance += result.distance;
    }
    return { ...result, moving: distance > 0.001, distance };
  }
  private advance(dt: number, yaw: number, forward: number, right: number, sprinting: boolean) {
    if (!this.elevated) {
      const safe = constrainStationPosition(
        this.position.x,
        this.position.z,
        this.position.y,
        // Taking off beside a climbable riser must not push the whole body sideways.
        STEP_HEIGHT + 0.02,
        this.grounded,
      );
      this.position.x = safe.x;
      this.position.z = safe.z;
    }
    this.shoreCooldown = Math.max(0, this.shoreCooldown - dt);
    let moving = false,
      speed = 0;
    moving = !!(forward || right);
    const sprint = sprinting;
    speed = sprint && this.stamina > 2 ? RUN_SPEED : WALK_SPEED;
    this.stamina = clamp(this.stamina + (moving && speed > WALK_SPEED ? -20 : 15) * dt, 0, 100);
    const input = new THREE.Vector3(
      right * Math.cos(yaw) - forward * Math.sin(yaw),
      0,
      -right * Math.sin(yaw) - forward * Math.cos(yaw),
    );
    if (moving) {
      input.normalize();
      const pace = surfaceTravelScale(
        this.elevated ? skySurface : groundSurface,
        this.position.x,
        this.position.z,
        input.x,
        input.z,
      );
      const turn = Math.atan2(-input.x, -input.z) - this.heading;
      // Take a shorter approach while pivoting, before accelerating in the new direction.
      const pivotPace = speed > WALK_SPEED ? 0.38 : 0.55;
      const turnPace = pivotPace + (1 - pivotPace) * Math.max(0, Math.cos(turn));
      input.multiplyScalar(speed * pace * turnPace);
    }
    const damping = 1 - Math.exp(-dt * 12);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, input.x, damping);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, input.z, damping);
    const oldX = this.position.x,
      oldZ = this.position.z;
    this.tryMove(this.velocity.x * dt, this.velocity.z * dt);
    const distance = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    const ground = this.elevated
      ? skySurface(this.position.x, this.position.z)
      : groundSurface(this.position.x, this.position.z);
    const previousY = this.position.y;
    if (ground === null || (this.grounded && previousY - ground > STEP_HEIGHT + 0.02))
      this.grounded = false;
    if (!this.grounded) {
      this.velocity.y -= 32 * dt;
      this.position.y += this.velocity.y * dt;
    }
    if (
      ground !== null &&
      (this.grounded ||
        (this.velocity.y <= 0 && previousY >= ground - 0.01 && this.position.y <= ground))
    ) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    }
    if (moving) {
      const angle = Math.atan2(-input.x, -input.z);
      const delta = Math.atan2(Math.sin(angle - this.heading), Math.cos(angle - this.heading));
      this.heading += clamp(delta * Math.min(dt * 12, 1), -dt * 5, dt * 5);
    }
    return { moving, speed, distance };
  }
  private tryMove(dx: number, dz: number) {
    const valid = (x: number, z: number) => {
      if (this.elevated) {
        const h = skySurface(x, z);
        return h === null || h - this.position.y <= (this.grounded ? STEP_HEIGHT + 0.02 : 0.01);
      }
      if (this.extraBlocked(x, z)) return false;
      const h = groundSurface(x, z);
      const safe = constrainStationPosition(
        x,
        z,
        this.position.y,
        this.grounded ? STEP_HEIGHT + 0.02 : 0.01,
        this.grounded,
      );
      if (Math.hypot(safe.x - x, safe.z - z) > 1e-5) return false;
      if (stationBlocked(x, z) || placeBlocked(x, z) || bridgeRailBlocked(x, z)) return false;
      if (
        stationSurface(x, z) !== null &&
        h - this.position.y > (this.grounded ? STEP_HEIGHT + 0.02 : 0.01)
      )
        return false;
      if (h < 0.8 || Math.abs(x) > 600 || Math.abs(z) > 600) {
        if (this.shoreCooldown <= 0) {
          this.onShore();
          this.shoreCooldown = 7;
        }
        return false;
      }
      if (
        stationSurface(x, z) === null &&
        h - groundSurface(this.position.x, this.position.z) > Math.hypot(dx, dz) * 1.9 + 0.15
      )
        return false;
      for (const r of this.resources) {
        if (this.collected.has(r.id)) continue;
        const radius =
          r.kind === 'wood' ? 1.05 * r.scale : r.kind === 'stone' ? 2.2 * r.scale : 0.9;
        const nextDistance = Math.hypot(x - r.x, z - r.z),
          oldDistance = Math.hypot(this.position.x - r.x, this.position.z - r.z);
        if (nextDistance < radius + 0.65 && nextDistance <= oldDistance) return false;
      }
      return true;
    };
    if (valid(this.position.x + dx, this.position.z + dz)) {
      this.position.x += dx;
      this.position.z += dz;
    } else {
      if (valid(this.position.x + dx, this.position.z)) this.position.x += dx;
      if (valid(this.position.x, this.position.z + dz)) this.position.z += dz;
    }
  }
}
