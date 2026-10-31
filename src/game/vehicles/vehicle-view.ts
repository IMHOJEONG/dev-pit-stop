import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import {
  CharacterRig,
  placeBone,
  kneePosition,
  HIP_HEIGHT,
  ANKLE_HEIGHT,
} from '../player/character-rig';
import { DEFAULT_APPEARANCE } from '../player/appearance';
import type { Appearance } from '../player/appearance';
import { disposeScene } from '../shared/dispose';
import { groundSurface } from '../world/ground-surface';
import type { VehicleTransition } from './vehicle-transition';
import type { VehicleController } from './vehicle-controller';
export class VehicleView {
  readonly root = new THREE.Group();
  private chassis = new THREE.Group();
  private wheels: { pivot: THREE.Group; tire: THREE.Mesh; front: boolean }[] = [];
  private driver = new CharacterRig(DEFAULT_APPEARANCE);
  private wheel = new THREE.Group();
  private initialized = false;
  private previousSpeed = 0;
  private lean = 0;
  constructor(scene: THREE.Scene) {
    this.root.name = 'exploration-buggy';
    this.root.add(this.chassis);
    scene.add(this.root);
    const green = mat(0x607858),
      tan = mat(0xd9c593),
      dark = mat(0x303b38),
      rubber = mat(0x26322c),
      metal = mat(0x9aa395),
      lamp = mat(0xffe3a1, { emissive: 0x70512b, emissiveIntensity: 0.5 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
      mesh(new THREE.BoxGeometry(w, h, d), m, this.chassis, x, y, z);
    box(2.8, 0.35, 4.8, dark, 0, 0.95);
    box(2.7, 0.75, 1, green, 0, 1.55, -2);
    box(2.7, 0.7, 1.3, green, 0, 1.5, 1.75);
    box(2.9, 0.18, 0.3, metal, 0, 0.85, -2.65);
    box(2.9, 0.18, 0.3, metal, 0, 0.85, 2.6);
    for (const side of [-1, 1]) {
      box(0.25, 0.65, 1.1, green, side * 1.3, 1.25, -1.85);
      box(0.25, 0.65, 1.1, green, side * 1.3, 1.25, 1.8);
      box(0.25, 0.15, 1.5, dark, side * 1.3, 0.65, 0);
      box(0.18, 3.6, 0.18, dark, side * 1.2, 3.3, 1.3);
      box(0.18, 3.6, 0.18, dark, side * 1.2, 3.3, -1.2);
      box(0.5, 0.32, 0.16, lamp, side * 0.8, 1.62, -2.49);
      box(0.4, 0.22, 0.12, mat(0xa75542), side * 0.9, 1.52, 2.42);
      for (const z of [-1.75, 1.8]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 1.6, 0.8, z);
        this.chassis.add(pivot);
        const tire = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.48, 12), rubber, pivot);
        tire.rotation.z = Math.PI / 2;
        mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 10), metal, tire);
        this.wheels.push({ pivot, tire, front: z < 0 });
      }
    }
    box(2.75, 0.14, 3.3, tan, 0, 5.1, 0).name = 'buggy-canopy';
    box(1.3, 0.22, 1.5, dark, 0, 1.85, 0.5);
    box(1.3, 1.25, 0.2, dark, 0, 2.4, 1.4);
    box(2.2, 0.2, 0.4, dark, 0, 2.5, -1.1);
    this.wheel.position.set(0, 2.9, -0.85);
    this.wheel.rotation.x = -0.6;
    this.chassis.add(this.wheel);
    mesh(new THREE.TorusGeometry(0.42, 0.055, 6, 16), dark, this.wheel);
    this.chassis.add(this.driver.root);
    this.poseDriver();
  }
  private poseDriver(seatBlend = 1) {
    const rig = this.driver;
    rig.root.name = 'buggy-driver';
    const hipY = HIP_HEIGHT,
      hipZ = 0.35 * seatBlend;
    rig.torso.position.set(0, hipY, hipZ);
    rig.chest.rotation.x = 0.08 * seatBlend;
    for (const [i, leg] of rig.legs.entries()) {
      const x = leg.side * 0.3 * rig.width,
        hip = new THREE.Vector3(x, hipY, hipZ),
        phase = Math.max(0, Math.min(1, i === 0 ? seatBlend / 0.6 : (seatBlend - 0.25) / 0.75)),
        stepBlend = phase * phase * (3 - 2 * phase),
        ankle = new THREE.Vector3(
          x,
          ANKLE_HEIGHT + (1.35 - ANKLE_HEIGHT) * stepBlend + Math.sin(Math.PI * phase) * 0.5,
          -0.95 * stepBlend,
        ),
        knee = kneePosition(hip, ankle);
      placeBone(leg.upper, hip, knee);
      placeBone(leg.lower, knee, ankle);
      leg.knee.position.copy(knee);
      leg.boot.position.copy(ankle);
      rig.shoulders[i].rotation.set(seatBlend, 0, -leg.side * 0.3 * seatBlend);
      rig.elbows[i].rotation.x = 0.55 * seatBlend;
    }
  }
  setAppearance(appearance: Appearance) {
    const old = new THREE.Scene();
    old.add(this.driver.root);
    disposeScene(old);
    this.driver = new CharacterRig(appearance);
    this.chassis.add(this.driver.root);
    this.poseDriver();
  }
  update(vehicle: VehicleController, dt: number, transition?: VehicleTransition) {
    const sin = Math.sin(vehicle.heading),
      cos = Math.cos(vehicle.heading);
    const contacts = this.wheels.map(({ pivot }) => {
      const x = vehicle.position.x + pivot.position.x * cos + pivot.position.z * sin,
        z = vehicle.position.z - pivot.position.x * sin + pivot.position.z * cos;
      return { x, z, y: groundSurface(x, z) };
    });
    const floor = contacts.reduce((sum, p) => sum + p.y, 0) / contacts.length;
    const snap = !this.initialized || this.root.position.distanceTo(vehicle.position) > 12;
    const blend = snap ? 1 : dt === 0 ? 0 : 1 - Math.exp(-dt * 12);
    this.initialized = true;
    this.root.position.x = vehicle.position.x;
    this.root.position.z = vehicle.position.z;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, floor, blend);
    this.root.rotation.y = vehicle.heading;
    const [leftFront, leftBack, rightFront, rightBack] = contacts;
    this.chassis.rotation.x = THREE.MathUtils.lerp(
      this.chassis.rotation.x,
      Math.atan2((leftBack.y + rightBack.y - leftFront.y - rightFront.y) / 2, 3.55),
      blend,
    );
    this.chassis.rotation.z = THREE.MathUtils.lerp(
      this.chassis.rotation.z,
      Math.atan2((rightFront.y + rightBack.y - leftFront.y - leftBack.y) / 2, 3.2),
      blend,
    );
    this.chassis.updateWorldMatrix(true, false);
    const inverse = this.chassis.matrixWorld.clone().invert();
    this.wheels.forEach(({ pivot, tire, front }, i) => {
      const p = contacts[i],
        local = new THREE.Vector3(p.x, p.y + 0.8, p.z).applyMatrix4(inverse);
      pivot.position.y = THREE.MathUtils.lerp(
        pivot.position.y,
        THREE.MathUtils.clamp(local.y, 0.35, 1.25),
        blend,
      );
      pivot.rotation.y = front ? -vehicle.steeringAngle : 0;
      tire.rotation.x = -vehicle.travel / 0.8;
    });
    this.wheel.rotation.z = vehicle.steering * 0.7;
    const seatBlend = transition?.seatBlend ?? 1;
    this.poseDriver(seatBlend);
    const acceleration = dt > 0 ? (vehicle.speed - this.previousSpeed) / dt : 0;
    this.previousSpeed = vehicle.speed;
    this.lean = THREE.MathUtils.lerp(
      this.lean,
      THREE.MathUtils.clamp(acceleration * 0.004, -0.07, 0.05),
      blend,
    );
    this.driver.torso.rotation.x = this.lean * seatBlend;
    this.driver.chest.rotation.z =
      -vehicle.steeringAngle * Math.abs(vehicle.speed) * 0.008 * seatBlend;
    this.driver.root.position.set(0, 0, 0);
    this.driver.root.rotation.y = 0;
    if (transition) {
      this.driver.root.position.copy(transition.position).applyMatrix4(inverse);
      this.driver.root.position.y *= 1 - seatBlend;
      const delta = Math.atan2(
        Math.sin(transition.heading - vehicle.heading),
        Math.cos(transition.heading - vehicle.heading),
      );
      this.driver.root.rotation.y = delta * (1 - seatBlend);
    }
    this.driver.root.visible = (vehicle.riding || !!transition) && !transition?.walking;
  }
}
