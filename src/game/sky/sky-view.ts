import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import {
  ISLANDS,
  LAUNCH,
  RUNES,
  SUMMIT,
  bridgeSteps,
  BRIDGE_WIDTH,
  SKY_SEGMENTS,
  LIFT_RADIUS,
  launchHeight,
  groundSurface,
  DOCK_APRON_RADIUS,
} from './sky-world';
import type { SkyJourney } from './sky-journey';
export class SkyView {
  readonly root = new THREE.Group();
  private lift = new THREE.Group();
  private runes: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private summit: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const root = this.root;
    root.name = 'sky-world';
    scene.add(root);
    const rock = mat(0x7e8b99),
      grass = mat(0xa0c6ae),
      gold = mat(0xe6c180);
    ISLANDS.forEach((island, index) => {
      const group = new THREE.Group();
      group.position.set(island.x, island.y, island.z);
      root.add(group);
      group.name = `sky-island-${index}`;
      if (index === 0) {
        // An open shaft lets the lift arrive through the island, flush with its floor.
        const shell = new THREE.LatheGeometry(
          [
            new THREE.Vector2(LIFT_RADIUS, -33),
            new THREE.Vector2(island.radius * 0.9, -3),
            new THREE.Vector2(island.radius, 0),
          ],
          SKY_SEGMENTS,
        );
        mesh(shell, rock, group);
        const floor = mesh(
          new THREE.RingGeometry(LIFT_RADIUS, island.radius, SKY_SEGMENTS),
          grass,
          group,
        );
        floor.rotation.x = -Math.PI / 2;
        // Align the floor polygon with CylinderGeometry/LatheGeometry.
        floor.rotation.z = Math.PI / 2;
        mesh(
          new THREE.CylinderGeometry(LIFT_RADIUS, LIFT_RADIUS, 33, SKY_SEGMENTS, 1, true),
          mat(0x586573, { side: THREE.BackSide }),
          group,
          0,
          -16.5,
        );
      } else {
        const base = mesh(
          new THREE.ConeGeometry(island.radius * 0.9, 30, SKY_SEGMENTS),
          rock,
          group,
          0,
          -18,
        );
        base.rotation.z = Math.PI;
        mesh(
          new THREE.CylinderGeometry(island.radius, island.radius * 0.9, 3, SKY_SEGMENTS),
          grass,
          group,
          0,
          -1.5,
        );
      }
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4,
          r = island.radius * 0.78;
        mesh(
          new THREE.OctahedronGeometry(2),
          mat(index === 2 ? 0xa2eddf : 0xc1a7ce),
          group,
          Math.cos(angle) * r,
          2,
          Math.sin(angle) * r,
        ).scale.y = 2;
      }
      for (let i = 0; i < 3; i++) {
        const pillar = mesh(
          new THREE.BoxGeometry(1.6, 10, 1.6),
          mat(0xb7c4bd),
          group,
          -island.radius + 6 + i * 4,
          5,
          -8,
        );
        mesh(new THREE.BoxGeometry(2.5, 0.7, 2.5), gold, group, pillar.position.x, 10, -8);
      }
    });
    for (let i = 0; i < ISLANDS.length - 1; i++) {
      const steps = bridgeSteps(i);
      steps.forEach(({ start, end, height }, j) => {
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        const plank = mesh(
          new THREE.BoxGeometry(BRIDGE_WIDTH, 0.6, length),
          mat(0xb7b6a1),
          root,
          (start.x + end.x) / 2,
          height - 0.3,
          (start.z + end.z) / 2,
        );
        plank.name = `sky-step-${i}-${j}`;
        plank.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
        if (j % 7 === 0) {
          for (const side of [-1, 1]) {
            const dx = Math.cos(plank.rotation.y) * (BRIDGE_WIDTH / 2 - 0.2) * side;
            const dz = -Math.sin(plank.rotation.y) * (BRIDGE_WIDTH / 2 - 0.2) * side;
            mesh(
              new THREE.CylinderGeometry(0.15, 0.15, 2.5, 5),
              gold,
              root,
              plank.position.x + dx,
              height + 1.25,
              plank.position.z + dz,
            );
          }
        }
      });
    }
    for (const rune of RUNES) {
      mesh(new THREE.CylinderGeometry(3, 4, 1, 6), rock, root, rune.x, rune.y + 0.3, rune.z);
      this.runes.push(
        mesh(
          new THREE.OctahedronGeometry(1.8),
          mat(0xe3be81, { emissive: 0xa8783b, emissiveIntensity: 0.6 }),
          root,
          rune.x,
          rune.y + 4,
          rune.z,
        ),
      );
    }
    this.summit = mesh(
      new THREE.OctahedronGeometry(4),
      mat(0xc7b0e3, { emissive: 0x8865ad, emissiveIntensity: 0.7 }),
      root,
      SUMMIT.x,
      SUMMIT.y + 7,
      SUMMIT.z,
    );
    mesh(new THREE.TorusGeometry(8, 0.3, 6, 48), gold, root, SUMMIT.x, SUMMIT.y + 7, SUMMIT.z);
    const dock = new THREE.RingGeometry(LIFT_RADIUS, DOCK_APRON_RADIUS, SKY_SEGMENTS, 6);
    dock.rotateX(-Math.PI / 2);
    dock.rotateY(Math.PI / 2);
    const vertices = dock.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = LAUNCH.x + vertices.getX(i),
        z = LAUNCH.z + vertices.getZ(i);
      vertices.setY(i, groundSurface(x, z));
    }
    dock.computeVertexNormals();
    const apron = mesh(dock, rock, root, LAUNCH.x, 0, LAUNCH.z);
    apron.name = 'lift-ground-dock';
    // The support sits below the moving deck, never on its visible top plane.
    const support = mesh(
      new THREE.CylinderGeometry(LIFT_RADIUS, LIFT_RADIUS, 0.3, SKY_SEGMENTS),
      rock,
      root,
      LAUNCH.x,
      launchHeight() - 0.77,
      LAUNCH.z,
    );
    support.name = 'lift-ground-support';
    mesh(
      new THREE.CylinderGeometry(LIFT_RADIUS, LIFT_RADIUS, 0.6, SKY_SEGMENTS),
      gold,
      this.lift,
      0,
      -0.3,
    );
    for (let i = 0; i < 5; i++) {
      const ring = mesh(
        new THREE.TorusGeometry(6, 0.15, 6, 40),
        mat(0x9ee9d9, {
          emissive: 0x51b5ad,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.55,
        }),
        root,
        LAUNCH.x,
        launchHeight() + i * 25 + 7,
        LAUNCH.z,
      );
      ring.rotation.x = Math.PI / 2;
      this.rings.push(ring);
    }
    this.lift.name = 'sky-lift';
    root.add(this.lift);
    this.lift.position.set(LAUNCH.x, launchHeight(), LAUNCH.z);
  }
  update(t: number, journey: SkyJourney, playerY: number) {
    this.lift.position.y = journey.ride ? playerY : journey.inSky ? ISLANDS[0].y : launchHeight();
    this.rings.forEach((r, i) => {
      r.rotation.z = t * 0.2 + i;
      r.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.06);
    });
    this.runes.forEach((r, i) => {
      r.rotation.y = t;
      (r.material as THREE.MeshStandardMaterial).color.set(
        i < journey.runes ? '#93ffda' : '#e3be81',
      );
    });
    this.summit.rotation.y = t * 0.3;
    (this.summit.material as THREE.MeshStandardMaterial).color.set(
      journey.complete ? '#f6e9ad' : '#c7b0e3',
    );
  }
}
