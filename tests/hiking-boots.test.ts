import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { createHikingBoot } from '../src/game/player/hiking-boots';
import { BODY_TYPES } from '../src/game/player/appearance';
import { PlayerView } from '../src/game/player/player-view';
import { WALK_SPEED } from '../src/game/player/movement';
import { disposeScene } from '../src/game/shared/dispose';
it.each(BODY_TYPES)(
  'has a rounded, outward-facing upper and grounded sole for $name',
  ({ width }) => {
    const scene = new THREE.Scene();
    const ray = new THREE.Raycaster();
    for (const side of [-1, 1]) {
      const boot = createHikingBoot(width, side);
      scene.add(boot);
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(boot);
      expect(bounds.min.y).toBeCloseTo(-0.2, 4);
      expect(bounds.max.y).toBeGreaterThan(0.3);
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(0.65);
      const upper = boot.getObjectByName('boot-leather-upper')!;
      ray.set(new THREE.Vector3(0, 1, -0.12), new THREE.Vector3(0, -1, 0));
      const instep = ray.intersectObject(upper, false)[0];
      expect(instep).toBeDefined();
      ray.set(new THREE.Vector3(0, 1, -0.39), new THREE.Vector3(0, -1, 0));
      const toe = ray.intersectObject(boot.getObjectByName('boot-toe-cap')!, false)[0];
      expect(toe).toBeDefined();
      expect(toe.point.y).toBeLessThan(instep.point.y - 0.06);
      ray.set(new THREE.Vector3(side, 0, -0.12), new THREE.Vector3(-side, 0, 0));
      expect(ray.intersectObject(upper, false).length).toBeGreaterThan(0);
    }
    disposeScene(scene);
  },
);
it('keeps the padded boot collar around the shin as the foot rolls and knees bend', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    position = new THREE.Vector3();
  for (let frame = 0; frame < 150; frame++) {
    position.z = (-frame * WALK_SPEED) / 60;
    actor.update(frame / 60, position, frame > 0, WALK_SPEED, false, {
      surface: () => 0,
      grounded: true,
    });
    scene.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const foot = actor.group.getObjectByName(`${side}-foot`)!;
      const cuff = foot.getObjectByName('boot-cuff')!;
      const knee = actor.group
        .getObjectByName(`${side}-knee`)!
        .getWorldPosition(new THREE.Vector3());
      const ankle = foot.getWorldPosition(new THREE.Vector3());
      const shin = knee.sub(ankle).normalize();
      const cuffAxis = new THREE.Vector3(0, 1, 0).transformDirection(cuff.matrixWorld);
      expect(cuffAxis.dot(shin)).toBeGreaterThan(0.999);
    }
  }
  disposeScene(scene);
});
