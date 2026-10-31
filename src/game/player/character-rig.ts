import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { createHikingBoot } from './hiking-boots';
import { BODY_TYPES, SKIN_TONES, OUTFITS } from './appearance';
import type { Appearance } from './appearance';
export const LEG_LENGTH = 0.96;
export const HIP_HEIGHT = 2.1;
export const ANKLE_HEIGHT = 0.2;
const up = new THREE.Vector3(0, 1, 0);
export function placeBone(bone: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const direction = to.clone().sub(from);
  bone.position.copy(from).add(to).multiplyScalar(0.5);
  bone.scale.y = direction.length();
  bone.quaternion.setFromUnitVectors(up, direction.normalize());
}
/** Two fixed-length segments; the pole makes knees bend forward, not sideways. */
export function kneePosition(hip: THREE.Vector3, ankle: THREE.Vector3, length = LEG_LENGTH) {
  const axis = ankle.clone().sub(hip);
  const distance = Math.min(length * 2 - 0.0001, Math.max(0.001, axis.length()));
  axis.normalize();
  const pole = new THREE.Vector3(0, 0, -1);
  pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  return hip
    .clone()
    .addScaledVector(axis, distance / 2)
    .addScaledVector(pole, Math.sqrt(Math.max(0, length * length - (distance * distance) / 4)));
}
export interface LegRig {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  knee: THREE.Mesh;
  boot: THREE.Group;
  cuff: THREE.Group;
  side: number;
}
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly head = new THREE.Group();
  readonly legs: LegRig[] = [];
  readonly shoulders: THREE.Group[] = [];
  readonly elbows: THREE.Group[] = [];
  readonly hands: THREE.Group[] = [];
  readonly axe = new THREE.Group();
  readonly pickaxe = new THREE.Group();
  readonly width: number;
  constructor(appearance: Appearance) {
    this.width = BODY_TYPES.find((v) => v.id === appearance.body)!.width;
    const skin = mat(SKIN_TONES.find((v) => v.id === appearance.skin)!.color);
    const outfit = OUTFITS.find((v) => v.id === appearance.outfit)!;
    const jacket = mat(outfit.color),
      pants = mat(outfit.pants),
      accent = mat(outfit.accent);
    const leather = mat(0x4e3c32),
      hair = mat(0x3b2a25),
      dark = mat(0x292c2b);
    const g = this.chest;
    this.torso.name = 'character-torso';
    this.hips.name = 'character-pelvis';
    this.chest.name = 'character-chest';
    this.head.name = 'character-head';
    this.root.add(this.torso);
    this.torso.add(this.hips, this.chest);
    mesh(
      new THREE.CylinderGeometry(0.53 * this.width, 0.43 * this.width, 1.05, 10),
      jacket,
      g,
      0,
      0.72,
    );
    mesh(new THREE.SphereGeometry(0.43, 10, 8), pants, this.hips, 0, 0).scale.set(
      this.width * 1.1,
      0.6,
      0.78,
    );
    mesh(
      new THREE.CylinderGeometry(0.45 * this.width, 0.45 * this.width, 0.13, 10),
      leather,
      this.hips,
      0,
      0.19,
    );
    mesh(new THREE.BoxGeometry(0.15, 0.14, 0.06), accent, this.hips, 0, 0.19, -0.45);
    // Collar, shirt opening, buttons and pockets make the silhouette readable at game scale.
    mesh(new THREE.BoxGeometry(0.19, 0.72, 0.08), accent, g, 0, 0.88, -0.47);
    for (const side of [-1, 1]) {
      mesh(
        new THREE.BoxGeometry(0.25, 0.23, 0.08),
        jacket,
        g,
        side * 0.3 * this.width,
        0.77,
        -0.45,
      );
      mesh(
        new THREE.BoxGeometry(0.105, 0.93, 0.08),
        leather,
        g,
        side * 0.35 * this.width,
        0.81,
        -0.46,
      );
    }
    mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.24, 8), skin, g, 0, 1.35);
    const head = this.head;
    head.position.y = 1.89;
    g.add(head);
    mesh(new THREE.SphereGeometry(0.48, 14, 10), skin, head).scale.set(0.88, 1.08, 0.91);
    for (const side of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.1, 8, 6), skin, head, side * 0.41, 0, 0);
      mesh(new THREE.SphereGeometry(0.043, 8, 6), dark, head, side * 0.16, 0.055, -0.411).scale.set(
        1,
        1.15,
        0.5,
      );
      mesh(new THREE.BoxGeometry(0.12, 0.035, 0.025), hair, head, side * 0.16, 0.16, -0.402);
    }
    mesh(new THREE.SphereGeometry(0.09, 8, 6), skin, head, 0, -0.045, -0.43).scale.set(
      0.65,
      0.8,
      1,
    );
    mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), mat(0x8b5546), head, 0, -0.22, -0.391);
    mesh(
      new THREE.SphereGeometry(0.49, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
      hair,
      head,
      0,
      0.08,
      0,
    ).scale.set(0.91, 1.05, 0.95);
    if (appearance.hair === 'bob') {
      for (const side of [-1, 1])
        mesh(new THREE.SphereGeometry(0.24, 8, 6), hair, head, side * 0.35, -0.12, 0.12).scale.set(
          0.65,
          1.4,
          1,
        );
      mesh(new THREE.SphereGeometry(0.37, 10, 8), hair, head, 0, -0.04, 0.22).scale.set(
        1,
        1.15,
        0.65,
      );
    }
    if (appearance.hair === 'tied') {
      mesh(new THREE.SphereGeometry(0.24, 9, 7), hair, head, 0, 0.02, 0.48);
      mesh(new THREE.SphereGeometry(0.22, 9, 7), hair, head, 0, -0.3, 0.5).scale.set(
        0.65,
        1.6,
        0.7,
      );
    }
    if (appearance.hat === 'brim') {
      mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.07, 16), accent, head, 0, 0.32);
      mesh(new THREE.CylinderGeometry(0.37, 0.46, 0.3, 12), accent, head, 0, 0.49);
      mesh(new THREE.CylinderGeometry(0.445, 0.455, 0.08, 12), leather, head, 0, 0.38);
    } else if (appearance.hat === 'beanie') {
      mesh(
        new THREE.SphereGeometry(0.49, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        accent,
        head,
        0,
        0.25,
      );
      mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.15, 12), accent, head, 0, 0.26);
    }
    const pack = mesh(
      new THREE.BoxGeometry(0.84 * this.width, 0.97, 0.44),
      mat(0x596b54),
      g,
      0,
      0.79,
      0.51,
    );
    pack.name = 'backpack';
    mesh(new THREE.BoxGeometry(0.65 * this.width, 0.3, 0.1), leather, g, 0, 0.59, 0.77);
    const roll = mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 1.08 * this.width, 10),
      mat(0xb5b49a),
      g,
      0,
      1.22,
      0.54,
    );
    roll.rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.17, 10), accent, g, 0, 1.34);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(),
        elbow = new THREE.Group(),
        hand = new THREE.Group();
      shoulder.name = side < 0 ? 'left-shoulder' : 'right-shoulder';
      elbow.name = side < 0 ? 'left-elbow' : 'right-elbow';
      shoulder.position.set(side * 0.65 * this.width, 1.15, 0);
      shoulder.rotation.z = side * 0.1;
      mesh(new THREE.SphereGeometry(0.21, 10, 8), jacket, shoulder);
      mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.57, 10), jacket, shoulder, 0, -0.28);
      elbow.position.y = -0.57;
      shoulder.add(elbow);
      mesh(new THREE.SphereGeometry(0.15, 8, 6), jacket, elbow);
      mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.51, 10), jacket, elbow, 0, -0.25);
      hand.position.y = -0.55;
      elbow.add(hand);
      mesh(new THREE.SphereGeometry(0.14, 10, 8), skin, hand).scale.set(0.85, 1.2, 1);
      g.add(shoulder);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
      this.hands.push(hand);
      const upper = mesh(
        new THREE.CylinderGeometry(0.23 * this.width, 0.19 * this.width, 1, 10),
        pants,
        this.root,
      );
      const lower = mesh(
        new THREE.CylinderGeometry(0.18 * this.width, 0.15 * this.width, 1, 10),
        pants,
        this.root,
      );
      const knee = mesh(new THREE.SphereGeometry(0.19 * this.width, 10, 8), pants, this.root);
      upper.name = side < 0 ? 'left-thigh' : 'right-thigh';
      lower.name = side < 0 ? 'left-shin' : 'right-shin';
      knee.name = side < 0 ? 'left-knee' : 'right-knee';
      const boot = createHikingBoot(this.width, side);
      this.root.add(boot);
      this.legs.push({
        upper,
        lower,
        knee,
        boot,
        cuff: boot.getObjectByName('boot-cuff') as THREE.Group,
        side,
      });
    }
    this.axe.name = 'axe';
    this.pickaxe.name = 'pickaxe';
    for (const tool of [this.axe, this.pickaxe]) {
      mesh(new THREE.CylinderGeometry(0.065, 0.075, 1.25, 8), mat(0x8d6b46), tool, 0, 0.35, 0);
      tool.rotation.x = -Math.PI / 2;
      tool.visible = false;
      this.hands[1].add(tool);
    }
    mesh(
      new THREE.BoxGeometry(0.16, 0.4, 0.6),
      mat(0xb9c8bd, { metalness: 0.35 }),
      this.axe,
      0,
      0.85,
      -0.18,
    );
    const pick = mesh(
      new THREE.CylinderGeometry(0.08, 0.055, 1.2, 8),
      mat(0xa9bdba, { metalness: 0.4 }),
      this.pickaxe,
      0,
      0.85,
    );
    pick.rotation.x = Math.PI / 2;
    // Chest pivots above the belt; head and arms can counter-rotate independently of the pelvis.
    for (const child of this.chest.children) child.position.y -= 0.3;
    this.chest.position.y = 0.3;
  }
}
