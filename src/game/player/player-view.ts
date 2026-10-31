import * as THREE from 'three';
import type { Resource } from '../resources/catalog';
import { HARVEST_RULES } from '../resources/catalog';
import { skySurface } from '../sky/sky-world';
import { groundSurface } from '../world/ground-surface';
import { disposeScene } from '../shared/dispose';
import {
  CharacterRig,
  HIP_HEIGHT,
  ANKLE_HEIGHT,
  LEG_LENGTH,
  kneePosition,
  placeBone,
} from './character-rig';
import { DEFAULT_APPEARANCE } from './appearance';
import type { Appearance } from './appearance';
import { humanGait, footRoll, descendingFootRoll } from './motion/human-gait';
export interface MotionContext {
  grounded?: boolean;
  platformHeight?: number;
  surface?: (x: number, z: number) => number | null;
}
interface FootState {
  world: THREE.Vector3;
  start: THREE.Vector3;
  target: THREE.Vector3;
  liftPhase: number;
  targetYaw: number;
  stance: number;
  phase: number;
  airLocal?: THREE.Vector3;
  planted: boolean;
  swinging: boolean;
  yaw: number;
}
const axis = new THREE.Vector3(0, 1, 0);
export class PlayerView {
  readonly group = new THREE.Group();
  private rig: CharacterRig;
  private feet: FootState[] = [];
  private swingStart = -10;
  private animationTime = 0;
  private phase = 0.25;
  private blend = 0;
  private runBlend = 0;
  private previousTravelSpeed = 0;
  private accelerationLean = 0;
  private turnLean = 0;
  private airBlend = 0;
  private airTime = 0;
  private airLead = 0;
  private verticalSpeed = 0;
  private landingAge = Infinity;
  private landingImpact = 0;
  private airRootOffset = 0;
  private pelvis = 0;
  private terrainBlend = 0;
  private settling = -1;
  private settleTime = 0;
  private wasGrounded = false;
  private platformHeight?: number;
  private previousPosition: THREE.Vector3 | null = null;
  private facingYaw: number | null = null;
  private tool: 'axe' | 'pickaxe' = 'axe';
  constructor(scene: THREE.Scene) {
    this.rig = new CharacterRig(DEFAULT_APPEARANCE);
    this.group.add(this.rig.root);
    scene.add(this.group);
  }
  setAppearance(appearance: Appearance) {
    const old = new THREE.Scene();
    old.add(this.rig.root);
    disposeScene(old);
    this.rig = new CharacterRig(appearance);
    this.group.add(this.rig.root);
    this.reset();
  }
  /** Rebase a looping preview without resetting gait phase or planted contacts. */
  shiftOrigin(offset: THREE.Vector3) {
    this.group.position.add(offset);
    this.previousPosition?.add(offset);
    for (const foot of this.feet) {
      foot.world.add(offset);
      foot.start.add(offset);
      foot.target.add(offset);
    }
    if (this.platformHeight !== undefined) this.platformHeight += offset.y;
  }
  strike(resource: Resource) {
    this.swingStart = this.animationTime;
    this.tool = HARVEST_RULES[resource.kind].tool;
    this.group.rotation.y = Math.atan2(
      this.group.position.x - resource.x,
      this.group.position.z - resource.z,
    );
  }
  reset() {
    this.swingStart = -10;
    this.phase = 0.25;
    this.blend = 0;
    this.runBlend = 0;
    this.previousTravelSpeed = 0;
    this.accelerationLean = 0;
    this.turnLean = 0;
    this.airBlend = 0;
    this.airTime = 0;
    this.airLead = 0;
    this.verticalSpeed = 0;
    this.landingAge = Infinity;
    this.landingImpact = 0;
    this.airRootOffset = 0;
    this.pelvis = 0;
    this.terrainBlend = 0;
    this.settling = -1;
    this.settleTime = 0;
    this.feet = [];
    this.wasGrounded = false;
    this.platformHeight = undefined;
    this.previousPosition = null;
    this.facingYaw = null;
    this.rig.axe.visible = this.rig.pickaxe.visible = false;
  }
  update(
    t: number,
    player: THREE.Vector3,
    moving: boolean,
    speed: number,
    elevated = false,
    context: MotionContext = {},
  ) {
    const dt = Math.max(0, Math.min(t - this.animationTime, 0.05));
    this.animationTime = t;
    const surface =
      context.surface ??
      (context.platformHeight !== undefined
        ? () => context.platformHeight!
        : elevated
          ? skySurface
          : groundSurface);
    if (context.platformHeight !== undefined && this.platformHeight !== undefined) {
      const delta = context.platformHeight - this.platformHeight;
      for (const foot of this.feet) {
        foot.world.y += delta;
        foot.start.y += delta;
        foot.target.y += delta;
      }
    } else if (context.platformHeight !== this.platformHeight) this.feet = [];
    this.platformHeight = context.platformHeight;
    const floor = surface(player.x, player.z);
    const grounded = context.grounded ?? (floor !== null && Math.abs(floor - player.y) < 0.02);
    const contactRange = elevated ? 1.2 : 0.5;
    if (
      grounded &&
      !moving &&
      this.feet.some(
        (foot) => foot.planted && Math.abs(foot.world.y - ANKLE_HEIGHT - player.y) > contactRange,
      )
    ) {
      this.feet = [];
      this.settling = -1;
      this.settleTime = 0;
    }
    const distance = this.previousPosition
      ? Math.hypot(player.x - this.previousPosition.x, player.z - this.previousPosition.z)
      : 0;
    const teleported =
      !this.previousPosition || distance > 2 || Math.abs(player.y - this.previousPosition.y) > 3;
    const landed = grounded && !this.wasGrounded && !teleported;
    if (teleported) {
      this.airRootOffset = 0;
      this.airTime = 0;
      this.airBlend = 0;
      this.landingAge = Infinity;
      this.landingImpact = 0;
      if (grounded) {
        this.feet = [];
        this.phase = 0.25;
      }
    }
    if (landed) {
      this.landingAge = 0;
      this.landingImpact = THREE.MathUtils.clamp(-this.verticalSpeed / 18, 0, 1) * 0.28;
      this.airTime = 0;
      this.settling = -1;
    } else if (grounded) this.landingAge += dt;
    else {
      this.airTime += dt;
      this.landingAge = Infinity;
    }
    this.verticalSpeed = !teleported && dt > 0 ? (player.y - this.previousPosition!.y) / dt : 0;
    this.airBlend = THREE.MathUtils.lerp(this.airBlend, grounded ? 0 : 1, 1 - Math.exp(-dt * 14));
    const approach =
      !grounded && this.verticalSpeed < -0.5 && floor !== null
        ? 1 - THREE.MathUtils.smoothstep(player.y - floor, 0, 1.3)
        : 0;
    const fold = grounded ? 0 : THREE.MathUtils.smoothstep(this.airTime, 0, 0.16) * (1 - approach);
    const travelSpeed = teleported ? 0 : distance / Math.max(dt, 0.001);
    const targetRun = moving
      ? speed > 9.5
        ? THREE.MathUtils.clamp(travelSpeed / 6, 0, 1)
        : THREE.MathUtils.clamp((travelSpeed - 5.5) / 3.5, 0, 1)
      : 0;
    this.runBlend = THREE.MathUtils.lerp(this.runBlend, targetRun, 1 - Math.exp(-dt * 10));
    const run = this.runBlend;
    const requestedYaw = this.group.rotation.y;
    const previousYaw = this.facingYaw ?? requestedYaw;
    if (teleported || this.facingYaw === null) this.facingYaw = requestedYaw;
    else {
      const turn = Math.atan2(
        Math.sin(requestedYaw - this.facingYaw),
        Math.cos(requestedYaw - this.facingYaw),
      );
      this.facingYaw += THREE.MathUtils.clamp(turn, -dt * 5, dt * 5);
    }
    const yaw = (this.group.rotation.y = this.facingYaw);
    if (!grounded && this.wasGrounded) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      this.airLead =
        this.feet.length === 2 && this.feet[1].world.dot(forward) > this.feet[0].world.dot(forward)
          ? 1
          : 0;
    }
    const acceleration =
      !teleported && grounded && dt > 0
        ? THREE.MathUtils.clamp((travelSpeed - this.previousTravelSpeed) / dt / 40, -1, 1) * run
        : 0;
    const turnRate =
      !teleported && grounded && dt > 0
        ? THREE.MathUtils.clamp((yaw - previousYaw) / dt / 5, -1, 1) *
          run *
          Math.min(1, travelSpeed / 5.5)
        : 0;
    this.accelerationLean = THREE.MathUtils.lerp(
      this.accelerationLean,
      acceleration,
      1 - Math.exp(-dt * 8),
    );
    this.turnLean = THREE.MathUtils.lerp(this.turnLean, turnRate, 1 - Math.exp(-dt * 8));
    this.previousTravelSpeed = travelSpeed;
    const ahead = surface(player.x - Math.sin(yaw) * 0.9, player.z - Math.cos(yaw) * 0.9);
    const behind = surface(player.x + Math.sin(yaw) * 0.9, player.z + Math.cos(yaw) * 0.9);
    const grade = ahead !== null && behind !== null ? (ahead - behind) / 1.8 : 0;
    this.terrainBlend = THREE.MathUtils.lerp(
      this.terrainBlend,
      grounded && Math.abs(grade) > 0.06 ? 1 : 0,
      1 - Math.exp(-dt * 12),
    );
    // Shorter steps and a longer support phase transfer weight one tread at a time.
    const stride = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(3.3, 4.6, run),
      THREE.MathUtils.lerp(2.4, 3.2, run),
      this.terrainBlend,
    );
    const stance = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.58, 0.4, run),
      THREE.MathUtils.lerp(0.64, 0.48, run),
      this.terrainBlend,
    );
    if (landed) this.phase = this.airLead === 0 ? 0.02 : 0.52;
    if (!teleported && grounded) this.phase = (this.phase + distance / stride) % 1;
    this.blend = THREE.MathUtils.lerp(
      this.blend,
      moving && grounded
        ? THREE.MathUtils.clamp(travelSpeed / THREE.MathUtils.lerp(3, 7, run), 0, 1)
        : 0,
      1 - Math.exp(-dt * 9),
    );
    const previousY = this.group.position.y;
    if (!grounded && this.wasGrounded && this.previousPosition)
      this.airRootOffset = previousY - this.previousPosition.y;
    this.group.position.copy(player);
    if (!teleported && !landed && grounded && context.platformHeight === undefined)
      this.group.position.y = THREE.MathUtils.lerp(previousY, player.y, 1 - Math.exp(-dt * 28));
    if (!grounded) {
      this.airRootOffset *= Math.exp(-dt * 20);
      this.group.position.y += this.airRootOffset;
    }
    const worldFoot = (side: number, ahead: number) =>
      new THREE.Vector3(side * 0.3 * this.rig.width, 0, -ahead)
        .applyAxisAngle(axis, yaw)
        .add(player);
    const ankleOnFloor = (point: THREE.Vector3) => {
      let height: number | null = null;
      const center = surface(point.x, point.z) ?? player.y;
      // Support the entire sole, including the toe when it overlaps a higher tread.
      for (const x of [-0.21 * this.rig.width, 0.21 * this.rig.width]) {
        for (const z of [-0.455, 0.235]) {
          const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(axis, yaw);
          const sample = surface(point.x + offset.x, point.z + offset.z);
          if (sample !== null && Math.abs(sample - center) <= contactRange)
            height = height === null ? sample : Math.max(height, sample);
        }
      }
      point.y = (height ?? center) + ANKLE_HEIGHT;
      return point;
    };
    const supportedPoint = (point: THREE.Vector3) => {
      const direction = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      if (this.terrainBlend > 0.2) {
        for (const offset of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36]) {
          const candidate = point.clone().addScaledVector(direction, offset);
          const toe = candidate.clone().addScaledVector(direction, 0.455);
          const heel = candidate.clone().addScaledVector(direction, -0.235);
          const a = surface(toe.x, toe.z),
            b = surface(heel.x, heel.z);
          if (a !== null && b !== null && Math.abs(a - b) < 0.04) return ankleOnFloor(candidate);
        }
      }
      return ankleOnFloor(point);
    };
    const landingPoint = (side: number, lead: number, phase: number) => {
      // Anticipate the first tread before the body's smoothed stair gait has caught up.
      let point = worldFoot(side, lead + (1 - phase) * stride);
      const height = surface(point.x, point.z);
      if (height !== null && Math.abs(height - player.y) > 0.08) {
        const plannedStride = THREE.MathUtils.lerp(2.4, 3.2, run);
        point = worldFoot(
          side,
          plannedStride * (THREE.MathUtils.lerp(0.64, 0.48, run) / 2 + 1 - phase),
        );
      }
      // Shorten a step at a stair edge or a steep drop instead of reaching through its side.
      const neutral = worldFoot(side, 0);
      for (let attempt = 0; attempt <= 8; attempt++) {
        const candidate = supportedPoint(point.clone().lerp(neutral, attempt / 8));
        const heights: number[] = [];
        for (const x of [-0.21 * this.rig.width, 0.21 * this.rig.width])
          for (const z of [-0.455, 0.235]) {
            const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(axis, yaw);
            const h = surface(candidate.x + offset.x, candidate.z + offset.z);
            if (h !== null) heights.push(h);
          }
        if (heights.length === 4 && heights.every((h) => Math.abs(h - player.y) <= contactRange))
          return candidate;
      }
      return ankleOnFloor(neutral);
    };
    const restingPoint = (side: number) => supportedPoint(worldFoot(side, 0));
    if (moving && this.settling >= 0 && this.feet[this.settling]) {
      // Continue the foot already in the air instead of dropping it when idle is interrupted.
      const foot = this.feet[this.settling];
      this.phase = (stance - this.settling * 0.5 + 1) % 1;
      foot.stance = stance;
      foot.planted = false;
      foot.swinging = false;
    }
    if (moving || !grounded || context.platformHeight !== undefined) {
      this.settling = -1;
      this.settleTime = 0;
    } else if (this.blend < 0.12 && this.landingAge > 0.18) {
      if (this.settling < 0) {
        const index = this.feet.findIndex(
          (foot, i) => foot.world.distanceTo(restingPoint(this.rig.legs[i].side)) > 0.06,
        );
        if (index >= 0) {
          this.settling = index;
          this.settleTime = 0;
          this.feet[index].start.copy(this.feet[index].world);
        }
      }
      if (this.settling >= 0) this.settleTime = Math.min(1, this.settleTime + dt / 0.24);
    }
    const localFeet: THREE.Vector3[] = [];
    const footAngles: number[] = [];
    for (let i = 0; i < 2; i++) {
      const leg = this.rig.legs[i],
        phase = (this.phase + i * 0.5) % 1;
      if (teleported || !this.feet[i]) {
        const position = ankleOnFloor(worldFoot(leg.side, 0));
        this.feet[i] = {
          world: position,
          start: position.clone(),
          target: position.clone(),
          liftPhase: phase,
          targetYaw: yaw,
          stance,
          phase,
          planted: false,
          swinging: false,
          yaw,
        };
      }
      const foot = this.feet[i];
      if (landed) {
        // Keep the flight contact instead of resetting both feet beneath the body.
        ankleOnFloor(foot.world);
        foot.start.copy(foot.world);
        foot.target.copy(foot.world);
        foot.airLocal = undefined;
        foot.planted = true;
        foot.swinging = false;
        foot.stance = stance;
        foot.phase = phase;
      }
      // A speed change must not reclassify an airborne foot as planted mid-step.
      if (phase < foot.phase) foot.stance = stance;
      foot.phase = phase;
      const supportPhase = foot.stance;
      const lead = (stride * supportPhase) / 2;
      if (!grounded) {
        foot.airLocal ??= foot.world
          .clone()
          .sub(this.previousPosition ?? player)
          .applyAxisAngle(axis, -yaw);
        const leading = i === this.airLead;
        const airTarget = new THREE.Vector3(
          leg.side * 0.3 * this.rig.width,
          ANKLE_HEIGHT + (leading ? 0.5 : 0.32) * fold,
          (leading ? -0.28 - run * 0.18 : 0.18 + run * 0.12) * (0.35 + fold * 0.65),
        );
        foot.airLocal.lerp(airTarget, 1 - Math.exp(-dt * 16));
        foot.world.copy(foot.airLocal).applyAxisAngle(axis, yaw).add(player);
        // Tuck away from a tall side wall instead of putting a boot through its edge in flight.
        for (let attempt = 0; attempt < 5 && floor !== null; attempt++) {
          let obstacle = -Infinity;
          for (const x of [-0.21 * this.rig.width, 0.21 * this.rig.width])
            for (const z of [-0.455, 0.235]) {
              const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(axis, foot.yaw);
              const h = surface(foot.world.x + offset.x, foot.world.z + offset.z);
              if (h !== null) obstacle = Math.max(obstacle, h);
            }
          if (obstacle - floor <= contactRange || player.y > obstacle + 0.5) break;
          foot.airLocal.x = THREE.MathUtils.lerp(
            foot.airLocal.x,
            leg.side * 0.3 * this.rig.width,
            0.5,
          );
          foot.airLocal.z *= 0.5;
          foot.world.copy(foot.airLocal).applyAxisAngle(axis, yaw).add(player);
        }
        foot.planted = false;
        foot.swinging = false;
      } else if (!moving && this.blend < 0.12) {
        if (this.settling === i) {
          const u = this.settleTime,
            ease = u * u * (3 - 2 * u);
          foot.world.lerpVectors(foot.start, restingPoint(leg.side), ease);
          foot.world.y += Math.sin(u * Math.PI) * 0.14;
          if (u === 1) this.settling = -1;
        }
        foot.planted = this.settling !== i;
        foot.swinging = false;
      } else if (phase < supportPhase) {
        if (!foot.planted) {
          if (foot.swinging) foot.world.copy(foot.target);
          foot.planted = true;
          foot.swinging = false;
        }
      } else {
        if (foot.planted || !foot.swinging) {
          foot.start.copy(foot.world);
          foot.target.copy(landingPoint(leg.side, lead, phase));
          foot.liftPhase = Math.max(supportPhase, phase - distance / stride);
          foot.targetYaw = yaw;
          foot.planted = false;
          foot.swinging = true;
        }
        const u = Math.max(0, (phase - foot.liftPhase) / (1 - foot.liftPhase)),
          smooth = u * u * (3 - 2 * u);
        const redirected =
          Math.abs(Math.atan2(Math.sin(yaw - foot.targetYaw), Math.cos(yaw - foot.targetYaw))) >
          0.15;
        if (redirected) {
          // Keep following a changed direction without teleporting to a new landing target.
          foot.target.lerp(landingPoint(leg.side, lead, phase), 1 - Math.exp(-dt * 16));
        }
        const target = foot.target;
        foot.world.lerpVectors(foot.start, target, smooth);
        // Keep the recovering toe above the old riser, then lower it onto the next tread.
        if (target.y < foot.start.y - 0.08) {
          const lower = THREE.MathUtils.clamp((u - 0.2) / 0.8, 0, 1);
          foot.world.y = THREE.MathUtils.lerp(
            foot.start.y,
            target.y,
            lower * lower * (3 - 2 * lower),
          );
        }
        const clearance =
          THREE.MathUtils.lerp(0.22, 0.5, run) +
          Math.min(0.4, Math.max(0, target.y - foot.start.y) * 0.45);
        foot.world.y += Math.sin(u * Math.PI) * clearance * this.blend;
      }
      if (grounded && !foot.planted)
        foot.world.y = Math.max(foot.world.y, ankleOnFloor(foot.world.clone()).y);
      const local = foot.world.clone().sub(this.group.position).applyAxisAngle(axis, -yaw);
      // Keep contacts within leg reach during a tight pivot; never cross the other hip.
      if (
        grounded &&
        (local.x * leg.side < 0.24 * this.rig.width ||
          local.x * leg.side > 0.7 * this.rig.width ||
          Math.abs(local.z) > 1.2)
      ) {
        local.x =
          leg.side *
          THREE.MathUtils.clamp(local.x * leg.side, 0.3 * this.rig.width, 0.7 * this.rig.width);
        local.z = THREE.MathUtils.clamp(local.z, -1.2, 1.2);
        foot.world.copy(local.clone().applyAxisAngle(axis, yaw).add(this.group.position));
        const support = ankleOnFloor(foot.world.clone()).y;
        foot.world.y = foot.planted ? support : Math.max(foot.world.y, support);
        local.copy(foot.world).sub(this.group.position).applyAxisAngle(axis, -yaw);
      }
      const footTurn = Math.atan2(Math.sin(yaw - foot.yaw), Math.cos(yaw - foot.yaw));
      foot.yaw += THREE.MathUtils.clamp(footTurn, -dt * 6, dt * 6);
      let pitch =
        grounded && context.platformHeight === undefined
          ? footRoll(phase, supportPhase) * this.blend
          : 0;
      if (grounded && context.platformHeight === undefined) {
        if (grade < -0.06) {
          // Descending starts with the forefoot, rather than the level walk's heel strike.
          pitch = THREE.MathUtils.lerp(
            pitch,
            descendingFootRoll(phase, supportPhase) * this.blend,
            this.terrainBlend,
          );
        } else pitch *= 1 - this.terrainBlend * 0.45;
      }
      if (!moving && this.blend < 0.12) pitch = 0;
      const pivot = new THREE.Vector3(0, -ANKLE_HEIGHT, pitch >= 0 ? 0.235 : -0.455);
      const rolled = pivot.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
      const posed = foot.world.clone().add(pivot.sub(rolled).applyAxisAngle(axis, foot.yaw));
      if (grounded || !teleported) {
        let support = -Infinity;
        const center = surface(posed.x, posed.z) ?? player.y;
        for (const x of [-0.21 * this.rig.width, 0.21 * this.rig.width])
          for (const z of [-0.455, 0.235]) {
            const corner = new THREE.Vector3(x, -ANKLE_HEIGHT, z)
              .applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch)
              .applyAxisAngle(axis, foot.yaw);
            const height = surface(posed.x + corner.x, posed.z + corner.z);
            if (
              height !== null &&
              (grounded ? Math.abs(height - center) <= contactRange : height <= player.y + 0.75)
            )
              support = Math.max(support, height - corner.y);
          }
        if (Number.isFinite(support)) posed.y = foot.planted ? support : Math.max(posed.y, support);
      }
      localFeet.push(posed.sub(this.group.position).applyAxisAngle(axis, -yaw));
      footAngles.push(pitch);
    }
    // Let the pelvis follow the support foot; never lift an entire leg out of its hip socket.
    const pose = humanGait(this.phase + 0.5);
    const cycle = this.phase * Math.PI * 2;
    const hipRotation = new THREE.Euler(
      0,
      (pose[1] + Math.sin(cycle) * 0.045) * this.blend,
      (pose[2] + 0.015 + this.turnLean * 0.025) * this.blend,
    );
    const sway = -Math.sin(cycle) * 0.045 * this.blend,
      lean = (-0.025 - Math.max(0, grade) * 0.15) * this.blend;
    const hips = this.rig.legs.map((leg) =>
      new THREE.Vector3(leg.side * 0.3 * this.rig.width, 0, 0).applyEuler(hipRotation),
    );
    let targetPelvis = this.blend * (-0.17 + pose[0] * THREE.MathUtils.lerp(0.4, 0.7, run));
    targetPelvis = THREE.MathUtils.lerp(targetPelvis, -0.08 - fold * 0.06, this.airBlend);
    if (this.landingAge < 0.6) {
      const compression = this.landingAge / 0.08;
      targetPelvis -= this.landingImpact * compression * Math.exp(1 - compression);
    }
    for (let i = 0; i < 2; i++) {
      const foot = localFeet[i],
        hip = hips[i];
      const horizontal = (foot.x - hip.x - sway) ** 2 + (foot.z - hip.z - lean) ** 2;
      const reach = Math.sqrt(Math.max(0.01, (LEG_LENGTH * 2 - 0.04) ** 2 - horizontal));
      targetPelvis = Math.min(targetPelvis, foot.y + reach - HIP_HEIGHT - hip.y);
    }
    this.pelvis = Math.min(
      targetPelvis,
      THREE.MathUtils.lerp(this.pelvis, targetPelvis, 1 - Math.exp(-dt * 10)),
    );
    this.rig.torso.position.set(sway, HIP_HEIGHT + this.pelvis, lean);
    this.rig.torso.rotation.set(0, 0, 0);
    this.rig.hips.rotation.copy(hipRotation);
    this.rig.chest.rotation.set(
      THREE.MathUtils.lerp(
        (pose[4] * 0.7 - run * 0.06 - this.accelerationLean * 0.1 - Math.abs(grade) * 0.3) *
          this.blend,
        -0.08 * fold - run * 0.03,
        this.airBlend,
      ),
      (pose[3] - 0.1) * this.blend * 0.75,
      ((pose[5] + 0.04) * 0.35 + this.turnLean * 0.08) * this.blend,
    );
    // Keep the gaze steady while shoulders and pelvis counter-rotate beneath it.
    this.rig.head.rotation.set(
      -this.rig.chest.rotation.x * 0.6,
      -this.rig.chest.rotation.y * 0.75,
      -this.rig.chest.rotation.z * 0.65,
    );
    this.rig.chest.scale.y = 1 + Math.sin(t * 1.8) * 0.003 * (1 - this.blend);
    const poseJoint = (joint: THREE.Group, x: number, y: number, z: number) => {
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
      if (teleported) joint.quaternion.copy(target);
      else joint.quaternion.rotateTowards(target, dt * 12);
    };
    for (let i = 0; i < 2; i++) {
      const leg = this.rig.legs[i],
        ankle = localFeet[i];
      const hip = new THREE.Vector3(leg.side * 0.3 * this.rig.width, 0, 0)
        .applyEuler(this.rig.hips.rotation)
        .add(this.rig.torso.position);
      const knee = kneePosition(hip, ankle);
      placeBone(leg.upper, hip, knee);
      placeBone(leg.lower, knee, ankle);
      leg.knee.position.copy(knee);
      leg.boot.position.copy(ankle);
      leg.boot.rotation.set(0, this.feet[i].yaw - yaw, 0);
      leg.boot.rotateX(footAngles[i]);
      // The padded ankle follows the shin while the sole rolls against the ground.
      const shin = knee
        .clone()
        .sub(ankle)
        .normalize()
        .applyQuaternion(leg.boot.quaternion.clone().invert());
      shin.x *= leg.boot.scale.x;
      leg.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shin);
      const offset = i === 0 ? 6 : 10;
      poseJoint(
        this.rig.shoulders[i],
        THREE.MathUtils.lerp(
          pose[offset] * this.blend * THREE.MathUtils.lerp(0.7, 1, run),
          -0.15 - fold * (i === this.airLead ? 0.2 : 0.45),
          this.airBlend,
        ),
        0,
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(leg.side * 0.08, pose[offset + 1] * 0.65, this.blend),
          leg.side * 0.16,
          this.airBlend,
        ),
      );
      poseJoint(
        this.rig.elbows[i],
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(
            0.16,
            THREE.MathUtils.lerp(pose[offset + 2] * 0.8, 0.9 + pose[offset + 2] * 0.45, run),
            this.blend,
          ),
          0.75 + fold * 0.35,
          this.airBlend,
        ),
        0,
        pose[offset + 3] * this.blend * 0.5,
      );
    }
    const swing = (t - this.swingStart) / 0.45,
      swinging = swing >= 0 && swing < 1;
    this.rig.axe.visible = swinging && this.tool === 'axe';
    this.rig.pickaxe.visible = swinging && this.tool === 'pickaxe';
    if (swinging) {
      this.rig.shoulders[1].rotation.x = 1.9 - Math.sin((swing * Math.PI) / 2) * 1.7;
      this.rig.elbows[1].rotation.x = 0.55 * (1 - swing) + 0.15;
    }
    this.wasGrounded = grounded;
    this.previousPosition ??= player.clone();
    this.previousPosition.copy(player);
  }
}
