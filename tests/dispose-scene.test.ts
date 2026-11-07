import { expect, it, vi } from 'vite-plus/test';
import * as THREE from 'three';
import { disposeScene } from '../src/game/shared/dispose';

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
