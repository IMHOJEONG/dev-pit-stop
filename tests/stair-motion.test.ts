import { it, expect } from 'vite-plus/test';
import * as THREE from 'three';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import { STATIONS } from '../src/game/world/landmarks';
import { groundSurface } from '../src/game/world/ground-surface';
import { LEG_LENGTH } from '../src/game/player/character-rig';
import { disposeScene } from '../src/game/shared/dispose';

const cases = [30, 60].flatMap((fps) =>
  [false, true].flatMap((down) => [false, true].map((sprint) => ({ fps, down, sprint }))),
);
it.each(cases)(
  'keeps stair contacts and limbs continuous at $fps fps (down=$down, sprint=$sprint)',
  ({ fps, down, sprint }) => {
    for (const s of STATIONS)
      for (const offset of [-1.5, 0, 1.5]) {
        const scene = new THREE.Scene(),
          actor = new PlayerView(scene),
          p = new PlayerController([], new Set(), () => {});
        const x = s.x + offset,
          z = s.z + (down ? 5.5 : 20.5),
          yaw = down ? Math.PI : 0;
        p.teleport(x, groundSurface(x, z), z, false);
        p.heading = yaw;
        let previous: THREE.Vector3[] | undefined,
          arrived = false;
        for (let frame = 0; frame < fps * 8 && !arrived; frame++) {
          const m = p.update(1 / fps, yaw, 1, 0, sprint);
          actor.group.rotation.y = p.heading;
          actor.update(frame / fps, p.position, m.moving, m.speed, false, {
            grounded: p.isGrounded,
          });
          scene.updateMatrixWorld(true);
          const feet: THREE.Vector3[] = [];
          let contact = false;
          const label = `${s.name}, offset ${offset}, frame ${frame}`;
          for (const side of ['left', 'right']) {
            const boot = actor.group.getObjectByName(`${side}-foot`)!;
            feet.push(boot.getWorldPosition(new THREE.Vector3()));
            const clearances = [-0.21, 0.21].flatMap((x) =>
              [-0.455, 0.235].map((z) => {
                const c = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
                return c.y - groundSurface(c.x, c.z);
              }),
            );
            if (Math.min(...clearances.map(Math.abs)) < 0.025) contact = true;
            expect(Math.min(...clearances), `sole clipping: ${label}`).toBeGreaterThan(-0.025);
            for (const name of ['thigh', 'shin']) {
              const bone = actor.group.getObjectByName(`${side}-${name}`)!;
              expect(bone.scale.y, `stretched leg: ${label}`).toBeCloseTo(LEG_LENGTH, 3);
              const middle = bone.getWorldPosition(new THREE.Vector3());
              expect(
                middle.y - groundSurface(middle.x, middle.z),
                `leg inside tread: ${label}`,
              ).toBeGreaterThan(0.1);
            }
          }
          if (frame > 0) {
            if (!sprint) expect(contact, `both feet floating: ${label}`).toBe(true);
            if (previous)
              for (let i = 0; i < 2; i++)
                expect(feet[i].distanceTo(previous[i]), `foot snapped: ${label}`).toBeLessThan(
                  ((sprint ? 0.7 : 0.38) * 60) / fps,
                );
          }
          const hip = actor.group
            .getObjectByName('character-torso')!
            .getWorldPosition(new THREE.Vector3());
          expect(
            hip.y - groundSurface(hip.x, hip.z),
            `body inside tread: ${label}`,
          ).toBeGreaterThan(1.4);
          previous = feet;
          arrived = down ? p.position.z > s.z + 20 : p.position.z < s.z + 5.8;
        }
        expect(arrived).toBe(true);
        disposeScene(scene);
      }
  },
);

it.each([false, true])('settles on the middle tread after stopping (down=%s)', (down) => {
  const s = STATIONS[1],
    scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new PlayerController([], new Set(), () => {}),
    yaw = down ? Math.PI : 0;
  const z = s.z + (down ? 5.5 : 20.5);
  p.teleport(s.x + 1.5, groundSurface(s.x + 1.5, z), z, false);
  p.heading = yaw;
  let stop = false;
  for (let frame = 0; frame < 360; frame++) {
    if (down ? p.position.z > s.z + 12 : p.position.z < s.z + 13) stop = true;
    const m = p.update(1 / 60, yaw, stop ? 0 : 1, 0, false);
    actor.group.rotation.y = p.heading;
    actor.update(frame / 60, p.position, m.moving, m.speed, false, { grounded: p.isGrounded });
  }
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const boot = actor.group.getObjectByName(`${side}-foot`)!;
    const center = boot.getWorldPosition(new THREE.Vector3());
    expect(center.y - 0.2).toBeCloseTo(groundSurface(center.x, center.z), 3);
    expect(Math.abs(center.z - p.position.z)).toBeLessThan(0.37);
  }
  expect(actor.group.getObjectByName('character-torso')!.position.y).toBeGreaterThan(1.7);
  disposeScene(scene);
});
