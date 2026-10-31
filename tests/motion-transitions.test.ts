import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import { groundSurface } from '../src/game/world/ground-surface';
import { STATIONS } from '../src/game/world/landmarks';
import { LEG_LENGTH } from '../src/game/player/character-rig';
import { disposeScene } from '../src/game/shared/dispose';

const cases = [30, 60].flatMap((fps) =>
  [0, -Math.PI / 2, Math.PI / 2, -Math.PI, Math.PI].flatMap((turn) =>
    [0, 0.1, 0.4, 0.55, 1.2].map((pause) => ({ fps, turn, pause })),
  ),
);
it.each(cases)(
  'continues a stop/restart with a $turn turn after $pause seconds at $fps fps',
  ({ fps, turn, pause }) => {
    for (const terrain of ['flat', 'up', 'down']) {
      const stairs = terrain !== 'flat',
        initialYaw = terrain === 'down' ? Math.PI : 0;
      const scene = new THREE.Scene(),
        actor = new PlayerView(scene),
        p = new PlayerController([], new Set(), () => {}),
        s = STATIONS[1];
      const x = s.x + (stairs ? 0 : 12),
        z = s.z + (terrain === 'down' ? 11 : stairs ? 15 : -5);
      p.teleport(x, groundSurface(x, z), z, false);
      p.heading = initialYaw;
      const surface = stairs ? groundSurface : () => 0;
      let previous: THREE.Vector3[] | undefined, rotations: THREE.Quaternion[] | undefined;
      for (let frame = 0; frame < fps * (3 + pause); frame++) {
        const t = frame / fps,
          restart = t >= 1 + pause,
          walking = t < 1 || restart;
        const m = p.update(1 / fps, initialYaw + (restart ? turn : 0), walking ? 1 : 0, 0, false);
        if (m.moving) actor.group.rotation.y = p.heading;
        actor.update(
          t,
          new THREE.Vector3(p.position.x, surface(p.position.x, p.position.z), p.position.z),
          m.moving,
          m.speed,
          false,
          { grounded: p.isGrounded, surface },
        );
        scene.updateMatrixWorld(true);
        const feet: THREE.Vector3[] = [],
          angles: THREE.Quaternion[] = [];
        let contact = false;
        for (const [i, side] of ['left', 'right'].entries()) {
          const boot = actor.group.getObjectByName(`${side}-foot`)!;
          expect(boot.position.x * (i === 0 ? -1 : 1)).toBeGreaterThan(0.23);
          feet.push(boot.getWorldPosition(new THREE.Vector3()));
          angles.push(boot.getWorldQuaternion(new THREE.Quaternion()));
          const sole = [-0.21, 0.21].flatMap((x) =>
            [-0.455, 0.235].map((z) => {
              const c = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
              return c.y - surface(c.x, c.z);
            }),
          );
          expect(Math.min(...sole), `sole ${stairs}, frame ${frame}`).toBeGreaterThan(-0.025);
          contact ||= Math.min(...sole.map(Math.abs)) < 0.025;
          for (const bone of ['thigh', 'shin'])
            expect(actor.group.getObjectByName(`${side}-${bone}`)!.scale.y).toBeCloseTo(
              LEG_LENGTH,
              3,
            );
          if (previous && t >= 1)
            expect(
              feet[i].distanceTo(previous[i]),
              `position ${stairs}, frame ${frame}`,
            ).toBeLessThan((0.42 * 60) / fps);
          if (rotations && t >= 1)
            expect(angles[i].angleTo(rotations[i]), `angle ${stairs}, frame ${frame}`).toBeLessThan(
              (0.24 * 60) / fps,
            );
        }
        expect(contact, `support ${stairs}, frame ${frame}`).toBe(true);
        const hip = actor.group
          .getObjectByName('character-torso')!
          .getWorldPosition(new THREE.Vector3());
        expect(hip.y - surface(hip.x, hip.z), `body ${terrain}, frame ${frame}`).toBeGreaterThan(
          1.2,
        );
        previous = feet;
        rotations = angles;
      }
      disposeScene(scene);
    }
  },
);

it('continues the lifted settling foot when a new movement interrupts idle', () => {
  for (const walkingFrames of [35, 45, 65, 90]) {
    const scene = new THREE.Scene(),
      actor = new PlayerView(scene),
      position = new THREE.Vector3();
    let interrupted = false;
    for (let frame = 0; frame < walkingFrames + 120; frame++) {
      if (frame < walkingFrames) position.z -= 4.8 / 60;
      actor.update(frame / 60, position, frame < walkingFrames, 4.8, false, {
        surface: () => 0,
        grounded: true,
      });
      scene.updateMatrixWorld(true);
      if (frame < walkingFrames + 18) continue;
      for (const side of ['left', 'right']) {
        const foot = actor.group.getObjectByName(`${side}-foot`)!;
        const before = foot.getWorldPosition(new THREE.Vector3());
        if (before.y < 0.24 || before.y > 0.34 || Math.abs(foot.rotation.x) > 0.001) continue;
        position.z -= 0.01;
        actor.update((frame + 1) / 60, position, true, 4.8, false, {
          surface: () => 0,
          grounded: true,
        });
        scene.updateMatrixWorld(true);
        const after = foot.getWorldPosition(new THREE.Vector3());
        expect(after.y).toBeGreaterThan(before.y - 0.025);
        expect(after.distanceTo(before)).toBeLessThan(0.12);
        interrupted = true;
        break;
      }
      if (interrupted) break;
    }
    expect(interrupted).toBe(true);
    disposeScene(scene);
  }
});
