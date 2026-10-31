import { describe, expect, it } from 'vite-plus/test';
import * as THREE from 'three';
import { WALK_SPEED, RUN_SPEED } from '../src/game/player/movement';
import { humanGait, footRoll } from '../src/game/player/motion/human-gait';
import { PlayerView } from '../src/game/player/player-view';
import { CharacterRig, LEG_LENGTH, kneePosition } from '../src/game/player/character-rig';
import { CHARACTER_PRESETS, DEFAULT_APPEARANCE, isAppearance } from '../src/game/player/appearance';
import { CharacterPreferences } from '../src/game/persistence/character-preferences';
import { ExpeditionState } from '../src/game/expedition/expedition-state';
import { validateSave } from '../src/game/persistence/save-data';
import { SPAWN, terrainHeight } from '../src/game/world/terrain';
import { disposeScene } from '../src/game/shared/dispose';

it('bends knees forward while preserving both segment lengths', () => {
  const hip = new THREE.Vector3(0, 1.7, 0);
  for (const ankle of [new THREE.Vector3(0, 0.2, -0.5), new THREE.Vector3(0, 0.5, 0.6)]) {
    const knee = kneePosition(hip, ankle);
    expect(knee.distanceTo(hip)).toBeCloseTo(LEG_LENGTH, 6);
    expect(knee.distanceTo(ankle)).toBeCloseTo(LEG_LENGTH, 6);
    expect(knee.z).toBeLessThan((hip.z + ankle.z) / 2);
  }
});
describe.each(CHARACTER_PRESETS)('$name movement and appearance', ({ appearance }) => {
  it('keeps feet planted without detaching or stretching legs while walking, running and climbing', () => {
    for (const speed of [WALK_SPEED, RUN_SPEED])
      for (const slope of [0, 0.24, -0.24]) {
        const scene = new THREE.Scene(),
          actor = new PlayerView(scene);
        actor.setAppearance(appearance);
        const position = new THREE.Vector3();
        const surface = (_x: number, z: number) => Math.floor(-z / 0.9) * slope;
        let plantedFrames = 0;
        for (let frame = 0; frame < 180; frame++) {
          position.z = (-frame * speed) / 60;
          position.y = surface(0, position.z);
          actor.update(frame / 60, position, frame > 0, speed, false, { surface, grounded: true });
          scene.updateMatrixWorld(true);
          let planted = false;
          for (const side of ['left', 'right']) {
            const boot = actor.group.getObjectByName(`${side}-foot`)!;
            const width = (actor.group.getObjectByName(`${side}-thigh`) as THREE.Mesh)
              .geometry as THREE.CylinderGeometry;
            const bodyWidth = width.parameters.radiusTop / 0.23;
            const corners = [-0.21, 0.21].flatMap((x) =>
              [-0.455, 0.235].map((z) =>
                boot.localToWorld(new THREE.Vector3(x * bodyWidth, -0.2, z)),
              ),
            );
            const clearances = corners.map((p) => p.y - surface(p.x, p.z));
            expect(Math.min(...clearances), `sole penetrated at frame ${frame}`).toBeGreaterThan(
              -0.025,
            );
            if (Math.min(...clearances.map(Math.abs)) < 0.025) planted = true;
            for (const bone of ['thigh', 'shin'])
              expect(actor.group.getObjectByName(`${side}-${bone}`)!.scale.y).toBeCloseTo(
                LEG_LENGTH,
                3,
              );
          }
          if (planted) plantedFrames++;
        }
        // Running has a flight phase; walking always keeps a support foot after startup.
        expect(plantedFrames).toBeGreaterThan(speed > 9.5 ? 80 : 165);
        disposeScene(scene);
      }
  });
  it('has stable bounds and articulated arms for every preset', () => {
    const rig = new CharacterRig(appearance),
      scene = new THREE.Scene();
    scene.add(rig.root);
    expect(rig.shoulders).toHaveLength(2);
    expect(rig.elbows).toHaveLength(2);
    expect(rig.legs).toHaveLength(2);
    expect(rig.width).toBeGreaterThan(0.8);
    expect(rig.width).toBeLessThan(1.2);
    disposeScene(scene);
  });
});
it('fits ground terrain, and stops without restarting or snapping the gait phase', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene);
  const p = new THREE.Vector3(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z);
  for (let frame = 0; frame < 100; frame++) {
    if (frame < 40) p.z -= WALK_SPEED / 60;
    p.y = terrainHeight(p.x, p.z);
    actor.update(frame / 60, p, frame < 40, WALK_SPEED, false, { grounded: true });
  }
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const foot = actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(foot.y - 0.2 - terrainHeight(foot.x, foot.z))).toBeLessThan(0.2);
  }
  disposeScene(scene);
});
it('saves customization before starting and survives missing, old and corrupt preference data', () => {
  const values = new Map<string, string>();
  const preferences = new CharacterPreferences({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  });
  const appearance = CHARACTER_PRESETS[1].appearance;
  expect(preferences.load()).toBeNull();
  expect(preferences.save(appearance)).toBe(true);
  expect(preferences.load()).toEqual(appearance);
  const state = new ExpeditionState([]);
  state.appearance = { ...appearance };
  const data = state.snapshot(SPAWN),
    restored = new ExpeditionState([]);
  restored.restore(validateSave(data, 0)!);
  expect(restored.appearance).toEqual(appearance);
  delete data.appearance;
  restored.restore(data);
  expect(restored.appearance).toEqual(DEFAULT_APPEARANCE);
  const corrupt = validateSave({ ...data, appearance: { body: '<script>' } }, 0)!;
  restored.restore(corrupt);
  expect(restored.appearance).toEqual(DEFAULT_APPEARANCE);
  for (const key of values.keys()) values.set(key, 'not json');
  expect(preferences.load()).toBeNull();
  expect(new CharacterPreferences(null).save(appearance)).toBe(false);
  expect(isAppearance({ ...appearance, hat: 'bad' })).toBe(false);
});

it('keeps the support foot fixed and swings opposite arms while walking on level ground', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new THREE.Vector3();
  let previous: THREE.Vector3 | undefined,
    fixedFrames = 0;
  let opposingFrames = 0;
  const elbowAngles: number[] = [],
    chestAngles: number[] = [];
  for (let frame = 0; frame < 120; frame++) {
    p.z = (-frame * WALK_SPEED) / 60;
    actor.update(frame / 60, p, frame > 0, WALK_SPEED, false, { surface: () => 0, grounded: true });
    scene.updateMatrixWorld(true);
    const foot = actor.group.getObjectByName('left-foot')!.getWorldPosition(new THREE.Vector3());
    if (
      previous &&
      Math.abs(foot.y - 0.2) < 0.001 &&
      Math.abs(previous.y - 0.2) < 0.001 &&
      foot.distanceTo(previous) < 0.001
    )
      fixedFrames++;
    previous = foot;
    const left = actor.group.getObjectByName('left-shoulder')!.rotation.x;
    const right = actor.group.getObjectByName('right-shoulder')!.rotation.x;
    if (left * right < 0) opposingFrames++;
    elbowAngles.push(actor.group.getObjectByName('left-elbow')!.rotation.x);
    chestAngles.push(actor.group.getObjectByName('character-chest')!.rotation.y);
    expect(actor.group.getObjectByName('left-elbow')!.rotation.x).toBeGreaterThan(0);
  }
  expect(fixedFrames).toBeGreaterThan(12);
  expect(opposingFrames).toBeGreaterThan(85);
  expect(Math.max(...elbowAngles) - Math.min(...elbowAngles)).toBeGreaterThan(0.2);
  expect(Math.max(...chestAngles) - Math.min(...chestAngles)).toBeGreaterThan(0.1);
  disposeScene(scene);
});
it('keeps the legs on their own side when turning rather than crossing through the body', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new THREE.Vector3();
  for (let frame = 0; frame < 240; frame++) {
    const yaw = frame * 0.025;
    actor.group.rotation.y = yaw;
    p.x -= (Math.sin(yaw) * WALK_SPEED) / 60;
    p.z -= (Math.cos(yaw) * WALK_SPEED) / 60;
    actor.update(frame / 60, p, true, WALK_SPEED, false, { surface: () => 0, grounded: true });
    for (const [side, sign] of [
      ['left', -1],
      ['right', 1],
    ] as const) {
      const foot = actor.group.getObjectByName(`${side}-foot`)!;
      expect(foot.position.x * sign).toBeGreaterThan(0.23);
      for (const bone of ['thigh', 'shin'])
        expect(actor.group.getObjectByName(`${side}-${bone}`)!.scale.y).toBeCloseTo(LEG_LENGTH, 3);
    }
  }
  disposeScene(scene);
});
it('tucks the knees in the air and resets foot contacts immediately on landing', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene);
  actor.update(0, new THREE.Vector3(), false, WALK_SPEED, false, {
    surface: () => 0,
    grounded: true,
  });
  actor.update(0.1, new THREE.Vector3(0, 2, 0), false, WALK_SPEED, false, {
    surface: () => 0,
    grounded: false,
  });
  expect(actor.group.getObjectByName('left-foot')!.position.y).toBeGreaterThan(0.2);
  actor.update(0.2, new THREE.Vector3(), false, WALK_SPEED, false, {
    surface: () => 0,
    grounded: true,
  });
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const foot = actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3());
    expect(foot.y).toBeCloseTo(0.2, 4);
  }
  disposeScene(scene);
});

it('samples a seamless human joint cycle instead of mirrored sine-wave arms', () => {
  expect(humanGait(0)).toEqual(humanGait(1));
  const a = humanGait(0.99999),
    b = humanGait(0.00001);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.002);
  const arms = Array.from({ length: 60 }, (_, i) => humanGait(i / 60));
  expect(arms.some((pose) => Math.abs(pose[6] + pose[10]) > 0.1)).toBe(true);
  expect(arms.every((pose) => pose.every(Number.isFinite))).toBe(true);
});
it('rolls from heel contact to a flat sole and toe push-off before recovery', () => {
  expect(footRoll(0, 0.62)).toBeGreaterThan(0.15);
  expect(footRoll(0.3, 0.62)).toBe(0);
  expect(footRoll(0.6, 0.62)).toBeLessThan(-0.2);
  expect(Math.abs(footRoll(0.99999, 0.62) - footRoll(0, 0.62))).toBeLessThan(0.001);
});
it('finishes a footstep when stopping and returns to a balanced stance without a pose reset', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new THREE.Vector3();
  let previous: THREE.Vector3[] | undefined;
  for (let frame = 0; frame < 180; frame++) {
    if (frame < 65) p.z -= WALK_SPEED / 60;
    actor.update(frame / 60, p, frame < 65, WALK_SPEED, false, {
      surface: () => 0,
      grounded: true,
    });
    scene.updateMatrixWorld(true);
    const feet = ['left', 'right'].map((side) =>
      actor.group.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3()),
    );
    if (frame > 65 && previous)
      for (let i = 0; i < 2; i++) expect(feet[i].distanceTo(previous[i])).toBeLessThan(0.35);
    previous = feet;
  }
  for (const foot of previous!) {
    expect(foot.y).toBeCloseTo(0.2, 3);
    expect(Math.abs(foot.z - p.z)).toBeLessThan(0.08);
  }
  expect(actor.group.getObjectByName('character-chest')!.rotation.y).toBeCloseTo(0, 4);
  disposeScene(scene);
});
it('loops the preview without resetting the human gait or planted feet', () => {
  const scene = new THREE.Scene(),
    actor = new PlayerView(scene),
    p = new THREE.Vector3();
  for (let frame = 0; frame < 60; frame++) {
    p.z -= WALK_SPEED / 60;
    actor.update(frame / 60, p, true, WALK_SPEED, false, { surface: () => 0, grounded: true });
  }
  const left = actor.group.getObjectByName('left-shoulder')!.rotation.x;
  const feet = ['left', 'right'].map((side) =>
    actor.group.getObjectByName(`${side}-foot`)!.position.clone(),
  );
  const offset = new THREE.Vector3(0, 0, 18);
  actor.shiftOrigin(offset);
  p.add(offset);
  actor.update(59 / 60, p, true, WALK_SPEED, false, { surface: () => 0, grounded: true });
  expect(actor.group.getObjectByName('left-shoulder')!.rotation.x).toBeCloseTo(left, 6);
  for (const [i, side] of ['left', 'right'].entries())
    expect(actor.group.getObjectByName(`${side}-foot`)!.position.distanceTo(feet[i])).toBeLessThan(
      0.001,
    );
  disposeScene(scene);
});
