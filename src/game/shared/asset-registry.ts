import * as THREE from 'three';

export type GeometryFactory = (
  key: string,
  create: () => THREE.BufferGeometry,
) => THREE.BufferGeometry;

interface SceneGeometry {
  geometry: THREE.BufferGeometry;
  references: number;
}

interface GeometryEntry {
  template: THREE.BufferGeometry;
  scenes: WeakMap<THREE.Scene, SceneGeometry>;
  references: number;
}

class AssetRegistry {
  private entries = new Map<string, GeometryEntry>();
  private owners = new WeakMap<
    THREE.Object3D,
    Map<string, { scene: THREE.Scene; variant: SceneGeometry }>
  >();
  private managed = new WeakSet<THREE.BufferGeometry>();

  acquireGeometry(
    scene: THREE.Scene,
    owner: THREE.Object3D,
    key: string,
    create: () => THREE.BufferGeometry,
  ) {
    let leases = this.owners.get(owner);
    if (!leases) {
      leases = new Map();
      this.owners.set(owner, leases);
    }
    const existing = leases.get(key);
    if (existing) return existing.variant.geometry;

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { template: create(), scenes: new WeakMap(), references: 0 };
      this.entries.set(key, entry);
    }
    let variant = entry.scenes.get(scene);
    if (!variant) {
      const { template } = entry;
      // Each renderer needs its own disposal events. The static vertex data can be shared.
      const geometry = Object.assign(new THREE.BufferGeometry(), { type: template.type });
      if ('parameters' in template) Object.assign(geometry, { parameters: template.parameters });
      geometry.setIndex(template.getIndex());
      for (const [name, attribute] of Object.entries(template.attributes))
        geometry.setAttribute(name, attribute);
      for (const { start, count, materialIndex } of template.groups)
        geometry.addGroup(start, count, materialIndex);
      geometry.setDrawRange(template.drawRange.start, template.drawRange.count);
      variant = { geometry, references: 0 };
      entry.scenes.set(scene, variant);
      this.managed.add(geometry);
    }
    variant.references++;
    entry.references++;
    leases.set(key, { scene, variant });
    return variant.geometry;
  }

  ownsGeometry(geometry: THREE.BufferGeometry) {
    return this.managed.has(geometry);
  }

  releaseOwner(owner: THREE.Object3D) {
    const leases = this.owners.get(owner);
    if (!leases) return;
    this.owners.delete(owner);
    for (const [key, { scene, variant }] of leases) {
      const entry = this.entries.get(key)!;
      if (--entry.references === 0) this.entries.delete(key);
      if (--variant.references > 0) continue;
      entry.scenes.delete(scene);
      variant.geometry.dispose();
    }
  }
}

export const assetRegistry = new AssetRegistry();
