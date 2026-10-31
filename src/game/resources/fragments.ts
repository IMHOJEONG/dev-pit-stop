import * as THREE from 'three';
import type { Resource } from './catalog';
import { landSurface as terrainHeight } from '../world/routes';
import { random, clamp } from '../shared/math';
import { mat } from '../shared/meshes';
interface Fragment {
  slot: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  size: number;
  life: number;
}

/** A bounded pool shared by chopping, mining and crystal breaking. */
export class FragmentEffects {
  readonly mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), mat(0xffffff), 160);
  private particles = new Map<number, Fragment>();
  private cursor = 0;
  private burst = 0;
  private dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene) {
    this.reset();
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  get activeCount() {
    return this.particles.size;
  }
  emit(resource: Resource, finishing: boolean) {
    const rng = random(resource.id * 19 + this.burst++);
    const count = finishing ? 14 : 4;
    for (let i = 0; i < count; i++) {
      const slot = this.cursor++ % this.mesh.count,
        angle = rng() * Math.PI * 2;
      const speed = (finishing ? 3 : 1.5) + rng() * 3;
      this.particles.set(slot, {
        slot,
        x: resource.x,
        z: resource.z,
        y: terrainHeight(resource.x, resource.z) + 1.6 * resource.scale,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        vy: 3 + rng() * 5,
        age: 0,
        size: (0.1 + rng() * 0.22) * resource.scale,
        life: 1.1 + rng() * 0.5,
      });
      this.mesh.setColorAt(
        slot,
        new THREE.Color(
          resource.kind === 'wood' ? '#c8a46d' : resource.kind === 'stone' ? '#bac2ac' : '#9ef4dc',
        ),
      );
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    for (const [slot, p] of this.particles) {
      p.age += dt;
      if (p.age >= p.life) {
        this.hide(slot);
        this.particles.delete(slot);
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vy -= 15 * dt;
      p.y += p.vy * dt;
      const ground = terrainHeight(p.x, p.z) + p.size;
      if (p.y < ground) {
        p.y = ground;
        p.vy = Math.abs(p.vy) * 0.2;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.age * 3, p.age * 2, slot);
      this.dummy.scale.setScalar(p.size * clamp((p.life - p.age) / 0.4, 0, 1));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(slot, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  private hide(slot: number) {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(slot, this.dummy.matrix);
  }
  reset() {
    this.particles.clear();
    for (let i = 0; i < this.mesh.count; i++) this.hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
