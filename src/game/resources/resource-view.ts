import * as THREE from 'three';
import { mat } from '../shared/meshes';
import { landSurface as terrainHeight } from '../world/routes';
import { random, clamp } from '../shared/math';
import { HARVEST_RULES } from './catalog';
import type { Resource, ResourceKind } from './catalog';
import type { HarvestHit } from './harvest';
import { FragmentEffects } from './fragments';
export class ResourceView {
  readonly resourceInstances = new Map<
    ResourceKind,
    { mesh: THREE.InstancedMesh; y: number; scale: THREE.Vector3 }[]
  >();
  readonly resourceIndex = new Map<number, number>();
  readonly treeStumps: THREE.InstancedMesh;
  readonly fragments: FragmentEffects;
  private harvestMarker = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.85, 40),
    new THREE.MeshBasicMaterial({
      color: 0xf3d293,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  private animations = new Map<number, { start: number; finishing: boolean }>();
  private animationTime = 0;
  private dummy = new THREE.Object3D();
  constructor(
    private scene: THREE.Scene,
    readonly resources: Resource[],
  ) {
    this.makeResources();
    this.treeStumps = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.7, 0.95, 0.9, 7),
      [mat(0x75684c), mat(0xd1b887), mat(0x75684c)],
      resources.filter((r) => r.kind === 'wood').length,
    );
    this.treeStumps.castShadow = this.treeStumps.receiveShadow = true;
    scene.add(this.treeStumps);
    this.harvestMarker.rotation.x = -Math.PI / 2;
    this.harvestMarker.visible = false;
    scene.add(this.harvestMarker);
    this.fragments = new FragmentEffects(scene);
    this.restoreResources();
  }
  private makeResources() {
    const trunkGeo = new THREE.CylinderGeometry(0.55, 0.9, 5, 5);
    const crownGeo = new THREE.ConeGeometry(4.1, 9, 6);
    const rockGeo = new THREE.DodecahedronGeometry(2.2, 0);
    const crystalGeo = new THREE.OctahedronGeometry(1.65, 0);
    const parts: Record<
      ResourceKind,
      { geo: THREE.BufferGeometry; color: number; y: number; scale: THREE.Vector3 }[]
    > = {
      wood: [
        { geo: trunkGeo, color: 0x75684c, y: 2.3, scale: new THREE.Vector3(1, 1, 1) },
        { geo: crownGeo, color: 0x315d4e, y: 7.1, scale: new THREE.Vector3(1, 1, 1) },
        { geo: crownGeo, color: 0x426e55, y: 10.3, scale: new THREE.Vector3(0.78, 0.8, 0.78) },
        { geo: crownGeo, color: 0x5b815b, y: 12.7, scale: new THREE.Vector3(0.53, 0.65, 0.53) },
      ],
      stone: [{ geo: rockGeo, color: 0x8c9b8e, y: 1.3, scale: new THREE.Vector3(1.25, 0.85, 1) }],
      crystal: [
        { geo: crystalGeo, color: 0x9fded0, y: 1.9, scale: new THREE.Vector3(0.7, 1.9, 0.7) },
        { geo: crystalGeo, color: 0x6bb4af, y: 1, scale: new THREE.Vector3(1.1, 0.9, 0.8) },
      ],
    };
    const rng = random(18);
    for (const kind of ['wood', 'stone', 'crystal'] as const) {
      const resources = this.resources.filter((r) => r.kind === kind);
      const instances = parts[kind].map((p) => {
        const material = mat(
          p.color,
          kind === 'crystal'
            ? { emissive: 0x215a57, emissiveIntensity: 0.55, metalness: 0.15, roughness: 0.35 }
            : {},
        );
        const inst = new THREE.InstancedMesh(p.geo, material, resources.length);
        inst.castShadow = true;
        inst.receiveShadow = true;
        resources.forEach((r, index) => {
          this.resourceIndex.set(r.id, index);
          this.dummy.position.set(r.x, terrainHeight(r.x, r.z) + p.y * r.scale, r.z);
          this.dummy.scale.copy(p.scale).multiplyScalar(r.scale);
          this.dummy.rotation.set(0, r.id * 2.4, kind === 'stone' ? 0.18 : 0);
          this.dummy.updateMatrix();
          inst.setMatrixAt(index, this.dummy.matrix);
          inst.setColorAt(index, new THREE.Color().setScalar(0.83 + rng() * 0.3));
        });
        this.scene.add(inst);
        return { mesh: inst, y: p.y, scale: p.scale };
      });
      this.resourceInstances.set(kind, instances);
    }
  }
  restoreResources() {
    this.animations.clear();
    this.fragments.reset();
    this.showHarvestTarget(null);
    for (let i = 0; i < this.treeStumps.count; i++)
      this.treeStumps.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.treeStumps.instanceMatrix.needsUpdate = true;
    for (const r of this.resources) {
      const index = this.resourceIndex.get(r.id)!;
      this.resourceInstances.get(r.kind)?.forEach((p) => {
        this.dummy.position.set(r.x, terrainHeight(r.x, r.z) + p.y * r.scale, r.z);
        this.dummy.scale.copy(p.scale).multiplyScalar(r.scale);
        this.dummy.rotation.set(0, r.id * 2.4, r.kind === 'stone' ? 0.18 : 0);
        this.dummy.updateMatrix();
        p.mesh.setMatrixAt(index, this.dummy.matrix);
        p.mesh.instanceMatrix.needsUpdate = true;
      });
    }
  }
  setTreePose(id: number, angle: number, foliage: number, stump: boolean) {
    const r = this.resources[id],
      index = this.resourceIndex.get(id)!;
    const yaw = r.id * 2.4;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle));
    this.resourceInstances.get('wood')!.forEach((part, partIndex) => {
      this.dummy.position.set(0, part.y * r.scale, 0).applyQuaternion(rotation);
      this.dummy.position.x += r.x;
      this.dummy.position.z += r.z;
      this.dummy.position.y += terrainHeight(r.x, r.z) + Math.sin(Math.abs(angle)) * 0.8 * r.scale;
      if (partIndex === 0 && foliage === 0)
        this.dummy.position.y =
          terrainHeight(this.dummy.position.x, this.dummy.position.z) + 0.8 * r.scale;
      this.dummy.quaternion.copy(rotation);
      this.dummy.scale.copy(part.scale).multiplyScalar(r.scale * (partIndex === 0 ? 1 : foliage));
      this.dummy.updateMatrix();
      part.mesh.setMatrixAt(index, this.dummy.matrix);
      part.mesh.instanceMatrix.needsUpdate = true;
    });
    if (stump) {
      this.dummy.position.set(r.x, terrainHeight(r.x, r.z) + 0.35 * r.scale, r.z);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.setScalar(r.scale);
      this.dummy.updateMatrix();
      this.treeStumps.setMatrixAt(index, this.dummy.matrix);
      this.treeStumps.instanceMatrix.needsUpdate = true;
      // Initially empty instanced bounds must grow when the first stump is created.
      this.treeStumps.computeBoundingSphere();
    }
  }
  showHarvestTarget(resourceId: number | null) {
    this.harvestMarker.visible = resourceId !== null;
    if (resourceId === null) return;
    const r = this.resources[resourceId];
    this.harvestMarker.position.set(r.x, terrainHeight(r.x, r.z) + 0.18, r.z);
    this.harvestMarker.scale.setScalar(
      r.scale * (r.kind === 'wood' ? 1 : r.kind === 'stone' ? 1.6 : 1.2),
    );
  }
  playHit(hit: HarvestHit) {
    this.animations.set(hit.resource.id, { start: this.animationTime, finishing: hit.finishing });
    this.fragments.emit(hit.resource, hit.finishing);
  }
  setCollected(id: number) {
    this.animations.delete(id);
    const r = this.resources[id];
    if (r.kind === 'wood') this.setTreePose(id, Math.PI / 2, 0, true);
    else this.setMineralPose(id, 0.22, 0, 0);
  }
  private setMineralPose(id: number, amount: number, shake: number, lift: number) {
    const r = this.resources[id],
      index = this.resourceIndex.get(id)!;
    this.resourceInstances.get(r.kind)!.forEach((part) => {
      this.dummy.position.set(
        r.x + shake,
        terrainHeight(r.x, r.z) + part.y * r.scale * amount + lift,
        r.z,
      );
      this.dummy.scale.copy(part.scale).multiplyScalar(r.scale * amount);
      this.dummy.rotation.set(
        shake * 0.7,
        id * 2.4,
        r.kind === 'stone' ? 0.18 + shake : shake * 0.5,
      );
      this.dummy.updateMatrix();
      part.mesh.setMatrixAt(index, this.dummy.matrix);
      part.mesh.instanceMatrix.needsUpdate = true;
    });
  }
  update(t: number, dt: number) {
    this.animationTime = t;
    for (const [id, animation] of this.animations) {
      const r = this.resources[id],
        age = t - animation.start;
      const duration = animation.finishing ? HARVEST_RULES[r.kind].duration : 0.42;
      const progress = clamp(age / duration, 0, 1);
      if (r.kind === 'wood') {
        if (animation.finishing)
          this.setTreePose(
            id,
            (progress * progress * Math.PI) / 2,
            1 - clamp((progress - 0.72) / 0.28, 0, 1),
            progress >= 0.35,
          );
        else
          this.setTreePose(id, Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.055, 1, false);
      } else {
        const shake = Math.sin(progress * Math.PI * 6) * (1 - progress) * 0.18;
        this.setMineralPose(
          id,
          animation.finishing ? 1 - 0.78 * progress : 1,
          shake,
          animation.finishing ? Math.sin(progress * Math.PI) * 0.4 : 0,
        );
      }
      if (progress === 1) this.animations.delete(id);
    }
    this.fragments.update(dt);
  }
}
