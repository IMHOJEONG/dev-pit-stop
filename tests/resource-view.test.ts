import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { ResourceView } from '../src/game/resources/resource-view';
import { PlayerView } from '../src/game/player/player-view';
import { HARVEST_RULES, RESOURCE_KINDS } from '../src/game/resources/catalog';
import type { Resource } from '../src/game/resources/catalog';
import { disposeScene } from '../src/game/shared/dispose';
import { FragmentEffects } from '../src/game/resources/fragments';
const resources: Resource[] = RESOURCE_KINDS.map((kind, id) => ({
  id,
  kind,
  x: id * 20,
  z: 180,
  scale: 1,
}));
const scaleOf = (mesh: THREE.InstancedMesh, index: number) => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixScale(matrix).length();
};
describe('resource animation and saved appearance', () => {
  let scene: THREE.Scene, view: ResourceView;
  beforeAll(() => {
    scene = new THREE.Scene();
    view = new ResourceView(scene, resources);
  });
  beforeEach(() => {
    view.restoreResources();
    view.update(0, 0);
  });
  afterAll(() => disposeScene(scene));
  it.each(RESOURCE_KINDS)('keeps %s visible on a non-finishing hit, with particles', (kind) => {
    const resource = resources.find((r) => r.kind === kind)!,
      index = view.resourceIndex.get(resource.id)!;
    const instance = view.resourceInstances.get(kind)![0].mesh,
      initial = scaleOf(instance, index);
    view.playHit({ resource, hits: 1, finishing: false });
    view.update(0.2, 0.2);
    expect(scaleOf(instance, index)).toBeGreaterThan(0);
    expect(view.fragments.activeCount).toBeGreaterThan(0);
    view.update(0.6, 0.4);
    expect(scaleOf(instance, index)).toBeCloseTo(initial);
  });
  it.each(['stone', 'crystal'] as const)(
    'breaks %s gradually, leaving a small deposit behind',
    (kind) => {
      const resource = resources.find((r) => r.kind === kind)!,
        index = view.resourceIndex.get(resource.id)!;
      const instance = view.resourceInstances.get(kind)![0].mesh,
        initial = scaleOf(instance, index);
      view.playHit({ resource, hits: 3, finishing: true });
      view.update(HARVEST_RULES[kind].duration / 2, 0.2);
      expect(scaleOf(instance, index)).toBeGreaterThan(initial * 0.22);
      expect(scaleOf(instance, index)).toBeLessThan(initial);
      view.setCollected(resource.id);
      const depleted = scaleOf(instance, index);
      expect(depleted).toBeGreaterThan(0);
      expect(depleted).toBeCloseTo(initial * 0.22);
      view.restoreResources();
      view.setCollected(resource.id);
      expect(scaleOf(instance, index)).toBeCloseTo(depleted);
    },
  );
  it('keeps the harvested tree trunk and stump, and restores a new tree on reset', () => {
    view.playHit({ resource: resources[0], hits: 3, finishing: true });
    view.update(0.5, 0.5);
    expect(scaleOf(view.resourceInstances.get('wood')![1].mesh, 0)).toBeGreaterThan(0);
    view.setCollected(0);
    expect(scaleOf(view.resourceInstances.get('wood')![1].mesh, 0)).toBe(0);
    expect(scaleOf(view.resourceInstances.get('wood')![0].mesh, 0)).toBeGreaterThan(0);
    expect(scaleOf(view.treeStumps, 0)).toBeGreaterThan(0);
    view.restoreResources();
    expect(scaleOf(view.treeStumps, 0)).toBe(0);
    expect(scaleOf(view.resourceInstances.get('wood')![1].mesh, 0)).toBeGreaterThan(0);
  });
});
describe('reusable tools and effects', () => {
  it('uses an axe for trees and a pickaxe for minerals, then hides the tool after a swing', () => {
    const scene = new THREE.Scene(),
      player = new PlayerView(scene),
      position = new THREE.Vector3();
    for (const resource of resources) {
      player.reset();
      player.strike(resource);
      player.update(0.2, position, false, 12);
      expect(
        player.group.getObjectByName(resource.kind === 'wood' ? 'axe' : 'pickaxe')?.visible,
      ).toBe(true);
      player.update(1, position, false, 12);
      expect(player.group.getObjectByName('axe')?.visible).toBe(false);
      expect(player.group.getObjectByName('pickaxe')?.visible).toBe(false);
      player.update(0, position, false, 12);
    }
    disposeScene(scene);
  });
  it('bounds particle allocation and clears effects on reset', () => {
    const scene = new THREE.Scene(),
      effects = new FragmentEffects(scene);
    for (let i = 0; i < 100; i++) effects.emit(resources[1], true);
    expect(effects.activeCount).toBeLessThanOrEqual(160);
    effects.update(3);
    expect(effects.activeCount).toBe(0);
    effects.emit(resources[2], true);
    effects.reset();
    expect(effects.activeCount).toBe(0);
    disposeScene(scene);
  });
});
