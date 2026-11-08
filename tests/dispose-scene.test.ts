import { expect, it, vi } from 'vite-plus/test';
import * as THREE from 'three';
import { disposeScene } from '../src/game/shared/dispose';
import { PlayerView } from '../src/game/player/player-view';
import { DEFAULT_APPEARANCE } from '../src/game/player/appearance';

it('releases shared mesh assets once and disposes the scene’s shadow targets', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  const geometryDisposed = vi.fn();
  const materialDisposed = vi.fn();
  geometry.addEventListener('dispose', geometryDisposed);
  material.addEventListener('dispose', materialDisposed);
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));

  const sun = new THREE.DirectionalLight();
  const shadowMap = new THREE.WebGLRenderTarget();
  const shadowDisposed = vi.fn();
  shadowMap.addEventListener('dispose', shadowDisposed);
  sun.shadow.map = shadowMap;
  scene.add(sun);

  disposeScene(scene);

  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
  expect(shadowDisposed).toHaveBeenCalledOnce();
});

it('shares character vertex data and releases each scene’s geometry at its last owner', () => {
  const world = new THREE.Scene();
  const preview = new THREE.Scene();
  const explorer = new PlayerView(world);
  const driver = new PlayerView(world);
  const model = new PlayerView(preview);
  const thigh = (actor: PlayerView) => actor.group.getObjectByName('left-thigh') as THREE.Mesh;
  const worldGeometry = thigh(explorer).geometry;
  const previewGeometry = thigh(model).geometry;
  const worldDisposed = vi.fn();
  const previewDisposed = vi.fn();
  worldGeometry.addEventListener('dispose', worldDisposed);
  previewGeometry.addEventListener('dispose', previewDisposed);

  expect(thigh(driver).geometry).toBe(worldGeometry);
  expect(thigh(driver).material).not.toBe(thigh(explorer).material);
  expect(previewGeometry).not.toBe(worldGeometry);
  expect(previewGeometry.getAttribute('position').array).toBe(
    worldGeometry.getAttribute('position').array,
  );

  explorer.setAppearance(DEFAULT_APPEARANCE);
  expect(thigh(explorer).geometry).toBe(worldGeometry);
  disposeScene(preview);
  expect(previewDisposed).toHaveBeenCalledOnce();
  expect(worldDisposed).not.toHaveBeenCalled();
  disposeScene(world);
  expect(worldDisposed).toHaveBeenCalledOnce();

  const reopened = new THREE.Scene();
  const next = thigh(new PlayerView(reopened)).geometry;
  expect(next.getAttribute('position').array).not.toBe(
    worldGeometry.getAttribute('position').array,
  );
  disposeScene(reopened);
});
