// Extract reusable human joint motion from the CC-BY-4.0 Cesium Man animation.
// Source/attribution: public/licenses/cesium-human-motion.txt
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const data = await fs.readFile(process.argv[2]);
const jsonLength = data.readUInt32LE(12);
const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
const binaryLength = data.readUInt32LE(20 + jsonLength);
const binary = data.subarray(28 + jsonLength, 28 + jsonLength + binaryLength);
for (const node of gltf.nodes) {
  delete node.mesh;
  delete node.skin;
}
for (const key of ['meshes', 'skins', 'materials', 'textures', 'images']) delete gltf[key];
gltf.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`;
globalThis.ProgressEvent ??= class extends Event {
  constructor(type, init) {
    super(type);
    Object.assign(this, init);
  }
};
const model = await new GLTFLoader().parseAsync(JSON.stringify(gltf), '');
const mixer = new THREE.AnimationMixer(model.scene),
  clip = model.animations[0];
mixer.clipAction(clip).play();
const axis = new THREE.Vector3(0, 1, 0);
const point = (name) =>
  model.scene
    .getObjectByName(name)
    .getWorldPosition(new THREE.Vector3())
    .applyAxisAngle(axis, Math.PI);
const direction = (a, b) => point(b).sub(point(a)).normalize();
const frames = [];
for (let frame = 0; frame < 64; frame++) {
  mixer.setTime((frame / 64) * clip.duration);
  model.scene.updateMatrixWorld(true);
  const hips = point('leg_joint_R_1').sub(point('leg_joint_L_1'));
  const shoulders = point('Skeleton_arm_joint_R').sub(point('Skeleton_arm_joint_L__4_'));
  const spine = direction('Skeleton_torso_joint_1', 'torso_joint_3');
  const hipYaw = Math.atan2(-hips.z, hips.x),
    hipRoll = Math.atan2(hips.y, Math.hypot(hips.x, hips.z));
  const chestYaw = Math.atan2(-shoulders.z, shoulders.x),
    chestRoll = Math.atan2(shoulders.y, Math.hypot(shoulders.x, shoulders.z));
  const chestPitch = Math.atan2(spine.z, spine.y);
  const inverseChest = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(chestPitch, chestYaw, chestRoll))
    .invert();
  const pose = [
    point('Skeleton_torso_joint_1').y,
    hipYaw,
    hipRoll,
    chestYaw,
    chestPitch,
    chestRoll,
  ];
  for (const names of [
    ['Skeleton_arm_joint_L__4_', 'Skeleton_arm_joint_L__3_', 'Skeleton_arm_joint_L__2_'],
    ['Skeleton_arm_joint_R', 'Skeleton_arm_joint_R__2_', 'Skeleton_arm_joint_R__3_'],
  ]) {
    const upper = direction(names[0], names[1]).applyQuaternion(inverseChest);
    const x = Math.atan2(-upper.z, -upper.y),
      z = Math.asin(upper.x);
    const inverseArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z)).invert();
    const lower = direction(names[1], names[2])
      .applyQuaternion(inverseChest)
      .applyQuaternion(inverseArm);
    pose.push(x, z, Math.atan2(-lower.z, -lower.y), Math.asin(lower.x));
  }
  frames.push(pose);
}
const mean = frames.reduce((n, f) => n + f[0], 0) / frames.length;
for (const pose of frames) pose[0] = (pose[0] - mean) * 3.5;
const output =
  '// Derived from Cesium Man (© 2017 Cesium), CC-BY-4.0.\n// Resampled and retargeted; no source mesh or logo is included.\n// See public/licenses/cesium-human-motion.txt. Regenerate with scripts/extract-human-motion.mjs.\nexport const HUMAN_WALK = ' +
  JSON.stringify(frames.map((p) => p.map((v) => +v.toFixed(5)))) +
  ' as const;\n';
await fs.writeFile(process.argv[3], output);
