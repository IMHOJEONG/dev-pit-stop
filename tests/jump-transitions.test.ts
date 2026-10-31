import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import { groundSurface } from '../src/game/world/ground-surface';
import { STATIONS } from '../src/game/world/landmarks';
import { LEG_LENGTH } from '../src/game/player/character-rig';
import { disposeScene } from '../src/game/shared/dispose';
const cases = [30, 60].flatMap((fps) =>
  [0, 4.8, 11].flatMap((before) =>
    [0, 4.8, 11].flatMap((after) =>
      [0, Math.PI / 2, Math.PI].map((turn) => ({ fps, before, after, turn })),
    ),
  ),
);
it.each(cases)(
  'lands from $before into $after with a $turn turn at $fps fps',
  ({ fps, before, after, turn }) => {
    for (const stairs of [false, true]) {
      const scene = new THREE.Scene(),
        actor = new PlayerView(scene),
        p = new PlayerController([], new Set(), () => {}),
        s = STATIONS[1];
      const x = s.x + (stairs ? 0 : 12),
        z = s.z + (stairs ? 14 : 3);
      p.teleport(x, groundSurface(x, z), z, false);
      let jumped = false,
        landed = false,
        landingFrame = -1,
        previousFeet: THREE.Vector3[] | undefined,
        previousHip: THREE.Vector3 | undefined;
      for (let frame = 0; frame < fps * 2; frame++) {
        const t = frame / fps;
        if (!jumped && t >= 0.3) {
          p.jump();
          jumped = true;
        }
        const speed = jumped ? after : before;
        const m = p.update(1 / fps, jumped ? turn : 0, speed > 0 ? 1 : 0, 0, speed > 9.5);
        if (jumped && p.isGrounded && !landed) {
          landed = true;
          landingFrame = frame;
        }
        if (m.moving) actor.group.rotation.y = p.heading;
        actor.update(t, p.position, m.moving, m.speed, false, { grounded: p.isGrounded });
        scene.updateMatrixWorld(true);
        const feet: THREE.Vector3[] = [];
        let contact = false;
        for (const [i, side] of ['left', 'right'].entries()) {
          const boot = actor.group.getObjectByName(`${side}-foot`)!;
          feet.push(boot.getWorldPosition(new THREE.Vector3()));
          const clearances = [-0.21, 0.21].flatMap((x) =>
            [-0.455, 0.235].map((z) => {
              const v = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
              return v.y - groundSurface(v.x, v.z);
            }),
          );
          expect(
            Math.min(...clearances),
            `clipping stairs=${stairs} frame=${frame}`,
          ).toBeGreaterThan(-0.025);
          contact ||= Math.min(...clearances.map(Math.abs)) < 0.025;
          for (const bone of ['thigh', 'shin'])
            expect(actor.group.getObjectByName(`${side}-${bone}`)!.scale.y).toBeCloseTo(
              LEG_LENGTH,
              3,
            );
          if (previousFeet && frame > 0)
            expect(
              feet[i].distanceTo(previousFeet[i]),
              `foot pop stairs=${stairs} frame=${frame}`,
            ).toBeLessThan((0.65 * 60) / fps);
        }
        if (landingFrame === frame) expect(contact, 'no landing support').toBe(true);
        const hip = actor.group
          .getObjectByName('character-torso')!
          .getWorldPosition(new THREE.Vector3());
        if (previousHip && frame > 0)
          expect(
            hip.distanceTo(previousHip),
            `body pop stairs=${stairs} frame=${frame}`,
          ).toBeLessThan((0.5 * 60) / fps);
        previousFeet = feet;
        previousHip = hip;
        if (landed && frame > landingFrame + fps * 0.45) break;
      }
      expect(landed).toBe(true);
      disposeScene(scene);
    }
  },
);

it('extends the legs before contact and absorbs a stationary landing without floating soles', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new PlayerController([], new Set(), () => {}),
    s = STATIONS[1];
  p.teleport(s.x + 12, groundSurface(s.x + 12, s.z + 3), s.z + 3, false);
  let peakAnkle = 0,
    lastAirAnkle = 0,
    contactHip = 0,
    minHip = Infinity,
    finalHip = 0,
    landing = -1;
  for (let frame = 0; frame < 130; frame++) {
    if (frame === 18) p.jump();
    const m = p.update(1 / 60, 0, 0, 0, false);
    actor.update(frame / 60, p.position, m.moving, m.speed, false, { grounded: p.isGrounded });
    scene.updateMatrixWorld(true);
    const foot = actor.group.getObjectByName('left-foot')!,
      hip = actor.group.getObjectByName('character-torso')!;
    if (!p.isGrounded) {
      peakAnkle = Math.max(peakAnkle, foot.position.y);
      lastAirAnkle = foot.position.y;
    }
    if (frame > 18 && p.isGrounded && landing < 0) {
      landing = frame;
      contactHip = hip.position.y;
    }
    if (landing >= 0 && frame < landing + 12) minHip = Math.min(minHip, hip.position.y);
    let supported = false;
    if (landing >= 0)
      for (const side of ['left', 'right']) {
        const boot = actor.group.getObjectByName(`${side}-foot`)!;
        const contact = [-0.21, 0.21].flatMap((x) =>
          [-0.455, 0.235].map((z) => {
            const v = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
            return v.y - groundSurface(v.x, v.z);
          }),
        );
        expect(Math.min(...contact)).toBeGreaterThan(-0.025);
        supported ||= Math.min(...contact.map(Math.abs)) < 0.025;
      }
    if (landing >= 0) expect(supported).toBe(true);
    finalHip = hip.position.y;
  }
  expect(landing).toBeGreaterThan(18);
  expect(peakAnkle - lastAirAnkle).toBeGreaterThan(0.15);
  expect(contactHip - minHip).toBeGreaterThan(0.08);
  expect(finalHip - minHip).toBeGreaterThan(0.1);
  disposeScene(scene);
});

it('can jump again during landing recovery without restarting from a stiff pose', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new PlayerController([], new Set(), () => {}),
    s = STATIONS[1];
  p.teleport(s.x + 12, groundSurface(s.x + 12, s.z + 3), s.z + 3, false);
  let jumps = 0,
    landed = -1,
    previous: THREE.Vector3 | undefined;
  for (let frame = 0; frame < 220; frame++) {
    if (frame === 18 || (jumps < 3 && landed >= 0 && frame === landed + 6)) {
      p.jump();
      jumps++;
      landed = -1;
    }
    const m = p.update(1 / 60, 0, 0, 0, false);
    if (jumps && p.isGrounded && landed < 0) landed = frame;
    actor.update(frame / 60, p.position, m.moving, m.speed, false, { grounded: p.isGrounded });
    scene.updateMatrixWorld(true);
    const hip = actor.group
      .getObjectByName('character-torso')!
      .getWorldPosition(new THREE.Vector3());
    if (previous) expect(hip.distanceTo(previous)).toBeLessThan(0.4);
    previous = hip;
  }
  expect(jumps).toBe(3);
  expect(p.isGrounded).toBe(true);
  disposeScene(scene);
});
