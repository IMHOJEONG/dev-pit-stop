import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import { STATIONS } from '../src/game/world/landmarks';
import { groundSurface } from '../src/game/world/ground-surface';
import { WALK_SPEED } from '../src/game/player/movement';
import { disposeScene } from '../src/game/shared/dispose';
it('does not plant a stationary foot on a high tread beside the character', () => {
  const s = STATIONS[1],
    scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    controller = new PlayerController([], new Set(), () => {});
  controller.teleport(s.x - 2.5, groundSurface(s.x - 2.5, s.z + 12.5), s.z + 12.5, false);
  for (let frame = 0; frame < 90; frame++) {
    controller.update(1 / 60, 0, 0, 0, false);
    actor.update(frame / 60, controller.position, false, WALK_SPEED, false, {
      grounded: controller.isGrounded,
    });
  }
  scene.updateMatrixWorld(true);
  const feet = ['left', 'right'].map((side) =>
    actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3()),
  );
  const hip = actor.group.getObjectByName('character-torso')!.getWorldPosition(new THREE.Vector3());
  expect(Math.max(...feet.map((p) => p.y)) - controller.position.y).toBeLessThan(0.5);
  expect(hip.y - controller.position.y).toBeGreaterThan(1.6);
  disposeScene(scene);
});
it.each([-1, 1])('keeps both resting feet on the middle treads at the %s stair edge', (side) => {
  const s = STATIONS[1];
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const scene = new THREE.Scene(),
      actor = new PlayerView(scene),
      controller = new PlayerController([], new Set(), () => {});
    controller.teleport(
      s.x + side * 2.1,
      groundSurface(s.x + side * 2.1, s.z + 12.5),
      s.z + 12.5,
      false,
    );
    actor.group.rotation.y = yaw;
    for (let frame = 0; frame < 90; frame++) {
      controller.update(1 / 60, yaw, 0, 0, false);
      actor.update(frame / 60, controller.position, false, WALK_SPEED, false, {
        grounded: controller.isGrounded,
      });
    }
    scene.updateMatrixWorld(true);
    expect(Math.abs(controller.position.x - s.x)).toBeLessThan(1.6);
    for (const side of ['left', 'right']) {
      const foot = actor.group
        .getObjectByName(`${side}-foot`)!
        .getWorldPosition(new THREE.Vector3());
      expect(Math.abs(foot.y - 0.2 - controller.position.y)).toBeLessThan(0.26);
    }
    const hip = actor.group
      .getObjectByName('character-torso')!
      .getWorldPosition(new THREE.Vector3());
    expect(hip.y - controller.position.y).toBeGreaterThan(1.7);
    disposeScene(scene);
  }
});
it('blocks entering a tall stair riser from its side while leaving the bottom approach open', () => {
  const s = STATIONS[1],
    p = new PlayerController([], new Set(), () => {});
  p.teleport(s.x - 4, groundSurface(s.x - 4, s.z + 12.5), s.z + 12.5, false);
  for (let frame = 0; frame < 90; frame++) p.update(1 / 60, -Math.PI / 2, 1, 0, false);
  expect(p.position.x - s.x).toBeLessThan(-2.8);
  expect(p.position.y).toBeCloseTo(groundSurface(s.x - 4, s.z + 12.5), 5);
  p.teleport(s.x, groundSurface(s.x, s.z + 20), s.z + 20, false);
  for (let frame = 0; frame < 300; frame++) p.update(1 / 60, 0, 1, 0, false);
  expect(p.position.z).toBeLessThan(s.z + 7);
  expect(p.position.y).toBeGreaterThan(groundSurface(s.x, s.z + 20) + 2);
});
it('settles its feet after walking and stopping halfway up rather than holding a high knee pose', () => {
  const s = STATIONS[1],
    scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new PlayerController([], new Set(), () => {});
  p.teleport(s.x, groundSurface(s.x, s.z + 20), s.z + 20, false);
  for (let frame = 0; frame < 240; frame++) {
    const walking = frame < 92,
      m = p.update(1 / 60, 0, walking ? 1 : 0, 0, false);
    actor.update(frame / 60, p.position, m.moving, m.speed, false, { grounded: p.isGrounded });
  }
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const foot = actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(foot.y - 0.2 - p.position.y)).toBeLessThan(0.3);
  }
  expect(actor.group.getObjectByName('character-torso')!.position.y).toBeGreaterThan(1.7);
  disposeScene(scene);
});
