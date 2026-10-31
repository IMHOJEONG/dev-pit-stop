import { expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { PlayerView } from '../src/game/player/player-view';
import { PlayerController } from '../src/game/player/player-controller';
import { groundSurface } from '../src/game/world/ground-surface';
import { STATIONS } from '../src/game/world/landmarks';
import { LEG_LENGTH } from '../src/game/player/character-rig';
import { disposeScene } from '../src/game/shared/dispose';

const cases = [30, 60].flatMap((fps) =>
  [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI].flatMap((turn) =>
    [0, 0.15, 0.55, 1.2].map((pause) => ({ fps, turn, pause })),
  ),
);
it.each(cases)(
  'runs through a $turn turn and $pause second pause at $fps fps',
  ({ fps, turn, pause }) => {
    for (const terrain of ['flat', 'up', 'down']) {
      const scene = new THREE.Scene(),
        actor = new PlayerView(scene),
        p = new PlayerController([], new Set(), () => {}),
        s = STATIONS[1];
      const yaw = terrain === 'down' ? Math.PI : 0,
        x = s.x + (terrain === 'flat' ? 12 : 0),
        z = s.z + (terrain === 'flat' ? -5 : terrain === 'down' ? 9 : 18);
      const surface = terrain === 'flat' ? () => 0 : groundSurface;
      p.teleport(x, groundSurface(x, z), z, false);
      p.heading = yaw;
      let previous: THREE.Vector3[] | undefined,
        rotations: THREE.Quaternion[] | undefined,
        previousChest: THREE.Quaternion | undefined;
      let flight = 0;
      for (let frame = 0; frame < fps * (2.3 + pause); frame++) {
        const t = frame / fps,
          restart = t >= 0.8 + pause,
          moving = (t < 0.8 || restart) && (terrain === 'flat' || p.position.z < s.z + 20);
        const m = p.update(1 / fps, yaw + (restart ? turn : 0), moving ? 1 : 0, 0, moving);
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
          feet.push(boot.getWorldPosition(new THREE.Vector3()));
          angles.push(boot.getWorldQuaternion(new THREE.Quaternion()));
          const clearance = [-0.21, 0.21].flatMap((x) =>
            [-0.455, 0.235].map((z) => {
              const c = boot.localToWorld(new THREE.Vector3(x, -0.2, z));
              return c.y - surface(c.x, c.z);
            }),
          );
          expect(Math.min(...clearance), `${terrain}, frame ${frame} clipping`).toBeGreaterThan(
            -0.025,
          );
          contact ||= Math.min(...clearance.map(Math.abs)) < 0.025;
          expect(boot.position.x * (i === 0 ? -1 : 1)).toBeGreaterThan(0.23);
          for (const bone of ['thigh', 'shin'])
            expect(actor.group.getObjectByName(`${side}-${bone}`)!.scale.y).toBeCloseTo(
              LEG_LENGTH,
              3,
            );
          if (previous && frame > 1)
            expect(
              feet[i].distanceTo(previous[i]),
              `${terrain}, frame ${frame} foot jump`,
            ).toBeLessThan((0.65 * 60) / fps);
          if (rotations && frame > 1)
            expect(
              angles[i].angleTo(rotations[i]),
              `${terrain}, frame ${frame} foot turn`,
            ).toBeLessThan((0.28 * 60) / fps);
        }
        flight = contact ? 0 : flight + 1;
        expect(flight / fps, `${terrain}, frame ${frame} long flight`).toBeLessThan(0.2);
        const chest = actor.group.getObjectByName('character-chest')!.quaternion.clone();
        if (previousChest)
          expect(
            chest.angleTo(previousChest),
            `${terrain}, frame ${frame} chest jump`,
          ).toBeLessThan((0.18 * 60) / fps);
        const hip = actor.group
          .getObjectByName('character-torso')!
          .getWorldPosition(new THREE.Vector3());
        expect(
          hip.y - surface(hip.x, hip.z),
          `${terrain}, frame ${frame} collapsed body`,
        ).toBeGreaterThan(1.2);
        previous = feet;
        rotations = angles;
        previousChest = chest;
      }
      disposeScene(scene);
    }
  },
);

it.each([30, 60])('blends run/walk changes inside a step at %s fps', (fps) => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new THREE.Vector3();
  let previous: THREE.Vector3[] | undefined, previousArms: THREE.Quaternion[] | undefined;
  for (let frame = 0; frame < fps * 4; frame++) {
    const t = frame / fps,
      speed = t < 1 || t >= 2 ? 11 : 4.8;
    p.z -= speed / fps;
    actor.update(t, p, true, speed, false, { surface: () => 0, grounded: true });
    scene.updateMatrixWorld(true);
    const feet = ['left', 'right'].map((side) =>
      actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3()),
    );
    const arms = ['left-shoulder', 'right-shoulder'].map((name) =>
      actor.group.getObjectByName(name)!.quaternion.clone(),
    );
    if ((t > 0.7 && t < 1) || t > 2.7)
      for (const name of ['left-elbow', 'right-elbow'])
        expect(actor.group.getObjectByName(name)!.rotation.x).toBeGreaterThan(0.6);
    if (previous)
      for (let i = 0; i < 2; i++)
        expect(feet[i].distanceTo(previous[i]), `frame ${frame}`).toBeLessThan((0.65 * 60) / fps);
    if (previousArms)
      for (let i = 0; i < 2; i++)
        expect(arms[i].angleTo(previousArms[i]), `arm jumped at frame ${frame}`).toBeLessThan(
          (0.25 * 60) / fps,
        );
    previous = feet;
    previousArms = arms;
  }
  disposeScene(scene);
});

it.each([false, true])('finishes braking with both feet settled (sprint held=%s)', (holdSprint) => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new PlayerController([], new Set(), () => {}),
    s = STATIONS[1];
  p.teleport(s.x + 12, groundSurface(s.x + 12, s.z - 5), s.z - 5, false);
  for (let frame = 0; frame < 150; frame++) {
    const moving = frame < 42,
      m = p.update(1 / 60, 0, moving ? 1 : 0, 0, moving || holdSprint);
    actor.update(
      frame / 60,
      new THREE.Vector3(p.position.x, 0, p.position.z),
      m.moving,
      m.speed,
      false,
      { surface: () => 0, grounded: true },
    );
  }
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const foot = actor.group.getObjectByName(`${side}-foot`)!;
    const position = foot.getWorldPosition(new THREE.Vector3());
    expect(position.y).toBeCloseTo(0.2, 3);
    expect(Math.abs(position.z - p.position.z)).toBeLessThan(0.08);
    expect(Math.abs(foot.rotation.x)).toBeLessThan(0.001);
  }
  expect(Math.abs(actor.group.getObjectByName('character-chest')!.rotation.x)).toBeLessThan(0.001);
  disposeScene(scene);
});
