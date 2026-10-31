import * as THREE from 'three';
import { ITEMS } from './catalog';
import type { ItemId } from './catalog';
import type { ItemDrop } from './item-system';
import { groundSurface } from '../world/ground-surface';
import { mat, mesh } from '../shared/meshes';
/** Only nearby drops have scene nodes; meshes and materials are reused across stacks. */
export class DropView {
  readonly root = new THREE.Group();
  private active = new Map<
    string,
    { group: THREE.Group; body: THREE.Group; born: number; drop: ItemDrop; hover: number }
  >();
  private sphere = new THREE.IcosahedronGeometry(0.2, 1);
  private box = new THREE.BoxGeometry(0.65, 0.38, 0.45);
  private ore = new THREE.DodecahedronGeometry(0.35, 0);
  private coin = new THREE.CylinderGeometry(0.3, 0.3, 0.085, 12);
  private ring = new THREE.RingGeometry(0.42, 0.55, 24);
  private materials = new Map<ItemId, THREE.MeshStandardMaterial>();
  private glow = new THREE.MeshBasicMaterial({
    color: 0xf3d999,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  constructor(scene: THREE.Scene) {
    this.root.name = 'world-item-drops';
    scene.add(this.root);
  }
  private create(drop: ItemDrop, t: number) {
    const group = new THREE.Group(),
      body = new THREE.Group();
    group.name = `drop-${drop.id}`;
    body.name = 'drop-body';
    group.add(body);
    let material = this.materials.get(drop.item);
    if (!material) {
      material = mat(ITEMS[drop.item].color, {
        roughness: 0.7,
        metalness: drop.item === 'ancientCoin' ? 0.6 : 0,
      });
      this.materials.set(drop.item, material);
    }
    if (drop.item === 'berry') {
      for (const [x, y, z] of [
        [-0.14, 0, 0],
        [0.15, 0, 0.03],
        [0, 0.21, -0.03],
      ])
        mesh(this.sphere, material, body, x, y, z);
    } else if (drop.item === 'ancientCoin') {
      const coin = mesh(this.coin, material, body);
      coin.rotation.z = Math.PI / 2;
    } else {
      const model = mesh(drop.item === 'wood' ? this.box : this.ore, material, body);
      if (drop.item === 'crystal') model.scale.set(0.7, 1.5, 0.7);
      if (drop.item === 'ironOre') model.scale.set(1.1, 0.7, 0.9);
    }
    const ring = mesh(this.ring, this.glow, group, 0, 0.05, 0);
    ring.name = 'drop-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    this.root.add(group);
    const hover = -new THREE.Box3().setFromObject(body).min.y + 0.08;
    return { group, body, born: t, drop, hover };
  }
  update(t: number, position: THREE.Vector3, drops: ReadonlyMap<string, ItemDrop>) {
    for (const [id, view] of this.active)
      if (
        !drops.has(id) ||
        Math.hypot(view.drop.x - position.x, view.drop.z - position.z) > 85 ||
        Math.abs(position.y - groundSurface(view.drop.x, view.drop.z)) > 35
      ) {
        this.root.remove(view.group);
        this.active.delete(id);
      }
    for (const drop of drops.values()) {
      const y = groundSurface(drop.x, drop.z);
      if (
        Math.hypot(drop.x - position.x, drop.z - position.z) > 80 ||
        Math.abs(position.y - y) > 35
      )
        continue;
      let view = this.active.get(drop.id);
      if (!view) {
        view = this.create(drop, t);
        this.active.set(drop.id, view);
      }
      view.group.visible = Math.abs(position.y - y) < 35;
      view.group.position.set(drop.x, y, drop.z);
      const age = t - view.born,
        fall = age < 0.55 ? Math.abs(Math.sin((age / 0.55) * Math.PI)) * 1.1 * (1 - age / 0.55) : 0;
      view.body.position.y = view.hover + fall + Math.sin(t * 2 + drop.sourceId) * 0.035;
      view.body.rotation.y = t * 0.35 + drop.sourceId;
    }
  }
  reset() {
    this.active.clear();
    this.root.clear();
  }
  dispose() {
    this.reset();
    for (const geometry of [this.sphere, this.box, this.ore, this.coin, this.ring])
      geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.glow.dispose();
  }
}
