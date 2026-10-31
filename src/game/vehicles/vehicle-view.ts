import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { CharacterRig, placeBone } from '../player/character-rig';
import { DEFAULT_APPEARANCE } from '../player/appearance';
import type { Appearance } from '../player/appearance';
import { disposeScene } from '../shared/dispose';
import { groundSurface } from '../world/ground-surface';
import type { VehicleController } from './vehicle-controller';
export class VehicleView {
  readonly root = new THREE.Group();
  private chassis = new THREE.Group();
  private wheels: { pivot: THREE.Group; tire: THREE.Mesh; front: boolean }[] = [];
  private driver = new CharacterRig(DEFAULT_APPEARANCE);
  private wheel = new THREE.Group();
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
    box(2.7, 0.75, 1.6, green, 0, 1.55, -1.65);
    box(2.7, 0.7, 1.3, green, 0, 1.5, 1.75);
    box(2.9, 0.18, 0.3, metal, 0, 0.85, -2.65);
    box(2.9, 0.18, 0.3, metal, 0, 0.85, 2.6);
    for (const side of [-1, 1]) {
      box(0.25, 0.65, 3.7, green, side * 1.3, 1.25, 0);
      box(0.18, 3.1, 0.18, dark, side * 1.2, 3.05, 1.3);
      box(0.18, 3.1, 0.18, dark, side * 1.2, 3.05, -1.2);
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
    box(2.75, 0.14, 3.3, tan, 0, 4.65, 0).name = 'buggy-canopy';
    box(1.3, 0.22, 1.5, dark, 0, 1.36, 0.5);
    box(1.3, 1.25, 0.2, dark, 0, 1.95, 1.4);
    box(2.2, 0.2, 0.4, dark, 0, 2, -1.1);
    this.wheel.position.set(0, 2.45, -0.85);
    this.wheel.rotation.x = -0.6;
    this.chassis.add(this.wheel);
    mesh(new THREE.TorusGeometry(0.42, 0.055, 6, 16), dark, this.wheel);
    this.chassis.add(this.driver.root);
    this.poseDriver();
  }
  private poseDriver() {
    const rig = this.driver;
    rig.root.name = 'buggy-driver';
    rig.torso.position.set(0, 1.65, 0.35);
    rig.chest.rotation.x = 0.08;
    for (const [i, leg] of rig.legs.entries()) {
      const x = leg.side * 0.3 * rig.width,
        hip = new THREE.Vector3(x, 1.65, 0.35),
        knee = new THREE.Vector3(x, 1.48, -0.58),
        ankle = new THREE.Vector3(x, 0.55, -0.8);
      placeBone(leg.upper, hip, knee);
      placeBone(leg.lower, knee, ankle);
      leg.knee.position.copy(knee);
      leg.boot.position.copy(ankle);
      rig.shoulders[i].rotation.set(1.0, 0, -leg.side * 0.3);
      rig.elbows[i].rotation.x = 0.55;
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
  update(vehicle: VehicleController, dt: number) {
    this.root.position.copy(vehicle.position);
    this.root.rotation.y = vehicle.heading;
    const front = groundSurface(
        vehicle.position.x - Math.sin(vehicle.heading) * 1.8,
        vehicle.position.z - Math.cos(vehicle.heading) * 1.8,
      ),
      back = groundSurface(
        vehicle.position.x + Math.sin(vehicle.heading) * 1.8,
        vehicle.position.z + Math.cos(vehicle.heading) * 1.8,
      );
    const left = groundSurface(
        vehicle.position.x - Math.cos(vehicle.heading) * 1.5,
        vehicle.position.z + Math.sin(vehicle.heading) * 1.5,
      ),
      right = groundSurface(
        vehicle.position.x + Math.cos(vehicle.heading) * 1.5,
        vehicle.position.z - Math.sin(vehicle.heading) * 1.5,
      );
    const blend = dt === 0 ? 0 : 1 - Math.exp(-dt * 10);
    this.chassis.rotation.x = THREE.MathUtils.lerp(
      this.chassis.rotation.x,
      Math.atan2(back - front, 3.6),
      blend,
    );
    this.chassis.rotation.z = THREE.MathUtils.lerp(
      this.chassis.rotation.z,
      Math.atan2(right - left, 3),
      blend,
    );
    for (const { pivot, tire, front } of this.wheels) {
      pivot.rotation.y = front ? -vehicle.steering * 0.4 : 0;
      tire.rotation.x = -vehicle.travel / 0.8;
    }
    this.wheel.rotation.z = vehicle.steering * 0.7;
    this.driver.root.visible = vehicle.riding;
  }
}
