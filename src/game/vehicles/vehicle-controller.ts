import * as THREE from 'three';
import type { Resource } from '../resources/catalog';
import { groundSurface } from '../world/ground-surface';
import { bridgeRailBlocked } from '../world/routes';
import { stationBlocked, stationSurface } from '../world/station-layout';
import { placeBlocked } from '../world/places';
import { LAUNCH } from '../world/landmarks';
import { clamp } from '../shared/math';
export const GARAGE = { x: 7, z: 202, heading: 0 };
export interface VehicleSave {
  x: number;
  z: number;
  heading: number;
  riding: boolean;
}
export class VehicleController {
  readonly position = new THREE.Vector3();
  heading = 0;
  speed = 0;
  steering = 0;
  riding = false;
  travel = 0;
  blocked = false;
  constructor(
    private resources: Resource[],
    private collected: Set<number>,
  ) {
    this.reset();
  }
  /** A swept chassis footprint keeps all four wheels on safe, driveable ground. */
  canOccupy(x: number, z: number, heading = this.heading) {
    const base = groundSurface(x, z),
      sin = Math.sin(heading),
      cos = Math.cos(heading);
    for (const [side, along] of [
      [0, 0],
      [-1.65, -2.4],
      [1.65, -2.4],
      [-1.65, 2.4],
      [1.65, 2.4],
      [-1.65, 0],
      [1.65, 0],
      [0, -2.4],
      [0, 2.4],
    ]) {
      const px = x + side * cos + along * sin,
        pz = z - side * sin + along * cos;
      const h = groundSurface(px, pz);
      if (
        h < 0.8 ||
        Math.abs(px) > 595 ||
        Math.abs(pz) > 595 ||
        Math.abs(h - base) > 1.8 ||
        stationSurface(px, pz) !== null ||
        stationBlocked(px, pz) ||
        placeBlocked(px, pz, 0.7) ||
        bridgeRailBlocked(px, pz) ||
        Math.hypot(px - LAUNCH.x, pz - LAUNCH.z) < 10.5
      )
        return false;
      for (const r of this.resources) {
        if (this.collected.has(r.id)) continue;
        const radius =
          r.kind === 'wood' ? 1.05 * r.scale : r.kind === 'stone' ? 2.2 * r.scale : 0.9;
        if (Math.hypot(px - r.x, pz - r.z) < radius + 0.65) return false;
      }
    }
    return true;
  }
  blocksPedestrian(x: number, z: number) {
    if (this.riding) return false;
    const dx = x - this.position.x,
      dz = z - this.position.z,
      sin = Math.sin(this.heading),
      cos = Math.cos(this.heading);
    return Math.abs(dx * cos - dz * sin) < 2.2 && Math.abs(dx * sin + dz * cos) < 3.2;
  }
  nearby(position: { x: number; y: number; z: number }) {
    return (
      Math.hypot(position.x - this.position.x, position.z - this.position.z) < 5.5 &&
      Math.abs(position.y - this.position.y) < 2.5
    );
  }
  board(position: { x: number; y: number; z: number }) {
    if (this.riding || !this.nearby(position)) return false;
    this.riding = true;
    this.speed = 0;
    return true;
  }
  exit(): THREE.Vector3 | null {
    if (!this.riding || Math.abs(this.speed) > 1.2) return null;
    for (const radius of [4.5, 6, 8])
      for (let i = 0; i < 16; i++) {
        const angle = this.heading + Math.PI / 2 + (i * Math.PI) / 8,
          x = this.position.x + Math.sin(angle) * radius,
          z = this.position.z + Math.cos(angle) * radius,
          y = groundSurface(x, z);
        if (
          y < 0.8 ||
          Math.abs(y - this.position.y) > 1.2 ||
          stationBlocked(x, z) ||
          placeBlocked(x, z) ||
          bridgeRailBlocked(x, z)
        )
          continue;
        if (
          this.resources.some(
            (r) =>
              !this.collected.has(r.id) &&
              Math.hypot(x - r.x, z - r.z) <
                (r.kind === 'stone' ? 2.2 * r.scale : r.kind === 'wood' ? 1.05 * r.scale : 0.9) +
                  0.8,
          )
        )
          continue;
        this.riding = false;
        this.speed = 0;
        this.steering = 0;
        return new THREE.Vector3(x, y, z);
      }
    return null;
  }
  update(dt: number, throttle: number, steer: number, brake: boolean) {
    if (!this.riding) return 0;
    let distance = 0;
    this.blocked = false;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))),
      delta = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.steering += (clamp(steer, -1, 1) - this.steering) * (1 - Math.exp(-delta * 8));
      const opposite =
        throttle !== 0 &&
        Math.sign(throttle) !== Math.sign(this.speed) &&
        Math.abs(this.speed) > 0.8;
      if (brake || opposite)
        this.speed =
          Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - (brake ? 24 : 18) * delta);
      else if (throttle)
        this.speed = clamp(this.speed + clamp(throttle, -1, 1) * 10 * delta, -8, 24);
      else this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - 5 * delta);
      const heading = this.heading - this.steering * (this.speed / 3.6) * Math.tan(0.4) * delta;
      const dx = -Math.sin(heading) * this.speed * delta,
        dz = -Math.cos(heading) * this.speed * delta;
      const x = this.position.x + dx,
        z = this.position.z + dz,
        h = groundSurface(x, z);
      if (
        !this.canOccupy(x, z, heading) ||
        Math.abs(h - this.position.y) > Math.hypot(dx, dz) * 0.85 + 0.035
      ) {
        this.speed = 0;
        this.blocked = true;
        continue;
      }
      this.heading = Math.atan2(Math.sin(heading), Math.cos(heading));
      this.position.set(x, h, z);
      distance += Math.hypot(dx, dz);
    }
    this.travel += distance * Math.sign(this.speed);
    return distance;
  }
  snapshot(): VehicleSave {
    return { x: this.position.x, z: this.position.z, heading: this.heading, riding: this.riding };
  }
  restore(saved?: VehicleSave) {
    this.reset();
    if (saved && this.canOccupy(saved.x, saved.z, saved.heading)) {
      this.position.set(saved.x, groundSurface(saved.x, saved.z), saved.z);
      this.heading = saved.heading;
      this.riding = saved.riding;
    }
  }
  reset() {
    this.position.set(GARAGE.x, groundSurface(GARAGE.x, GARAGE.z), GARAGE.z);
    this.heading = GARAGE.heading;
    this.speed = 0;
    this.steering = 0;
    this.riding = false;
    this.travel = 0;
    this.blocked = false;
  }
}
