import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { terrainHeight } from './terrain';
import {
  stationSteps,
  STATION_DECK_RISE,
  STATION_DECK_RADIUS,
  STATION_STEP_WIDTH,
} from './station-layout';
import { STATIONS } from './landmarks';
export class StructuresView {
  readonly root = new THREE.Group();
  private stationGroups: THREE.Group[] = [];
  private beams: THREE.Mesh[] = [];
  private fires: THREE.Mesh[] = [];
  constructor(private scene: THREE.Scene) {
    this.root.name = 'ground-structures';
    this.scene.add(this.root);
    this.makeStations();
    this.makeCamp();
  }
  private makeStations() {
    const stone = mat(0x909e8d),
      lightStone = mat(0xbec4ab),
      dark = mat(0x4f6b61);
    STATIONS.forEach((s, index) => {
      const g = new THREE.Group();
      g.position.set(s.x, terrainHeight(s.x, s.z), s.z);
      g.name = `station-${index}`;
      mesh(
        new THREE.CylinderGeometry(STATION_DECK_RADIUS, STATION_DECK_RADIUS, 2, 32),
        stone,
        g,
        0,
        1,
      );
      const deck = mesh(
        new THREE.CylinderGeometry(STATION_DECK_RADIUS, STATION_DECK_RADIUS, 0.2, 32),
        lightStone,
        g,
        0,
        STATION_DECK_RISE - 0.1,
      );
      deck.name = `station-deck-${index}`;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const pillar = mesh(
          new THREE.BoxGeometry(1.3, 7 + (i % 2), 1.3),
          stone,
          g,
          Math.sin(a) * 4.4,
          STATION_DECK_RISE + (7 + (i % 2)) / 2,
          Math.cos(a) * 4.4,
        );
        pillar.rotation.y = a;
        mesh(
          new THREE.BoxGeometry(2, 0.6, 2),
          lightStone,
          g,
          pillar.position.x,
          STATION_DECK_RISE + 7 + (i % 2) + 0.3,
          pillar.position.z,
        );
      }
      mesh(new THREE.CylinderGeometry(2.2, 3, 2, 6), dark, g, 0, STATION_DECK_RISE + 1);
      const core = mesh(
        new THREE.OctahedronGeometry(1.8),
        mat(0xe9bc70, { emissive: 0xc58b3f, emissiveIntensity: 0.7 }),
        g,
        0,
        6 + STATION_DECK_RISE,
      );
      core.name = 'core';
      const ring = mesh(
        new THREE.TorusGeometry(3, 0.13, 6, 32),
        mat(0xe8c17c, { emissive: 0xae813c, emissiveIntensity: 0.4 }),
        g,
        0,
        6 + STATION_DECK_RISE,
      );
      ring.rotation.x = Math.PI / 2;
      ring.name = 'ring';
      const beam = mesh(
        new THREE.CylinderGeometry(0.3, 1.6, 130, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xf5d490,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        g,
        0,
        70,
      );
      beam.castShadow = false;
      this.beams.push(beam);
      for (const [i, step] of stationSteps(index).entries()) {
        const tread = mesh(
          new THREE.BoxGeometry(step.width, step.height - g.position.y + 0.08, step.depth),
          stone,
          g,
          0,
          (step.height - g.position.y - 0.08) / 2,
          step.z - s.z,
        );
        tread.name = `station-step-${index}-${i}`;
      }
      const steps = stationSteps(index),
        railMaterial = mat(0x796e54);
      for (const side of [-1, 1]) {
        const x = side * (STATION_STEP_WIDTH / 2 - 0.06);
        for (const [i, step] of steps.entries())
          if (i % 2 === 0 || i === steps.length - 1)
            mesh(
              new THREE.CylinderGeometry(0.07, 0.09, 1.05, 6),
              railMaterial,
              g,
              x,
              step.height - g.position.y + 0.525,
              step.z - s.z,
            );
        const a = new THREE.Vector3(x, steps[0].height - g.position.y + 1.05, steps[0].z - s.z);
        const b = new THREE.Vector3(
          x,
          steps.at(-1)!.height - g.position.y + 1.05,
          steps.at(-1)!.z - s.z,
        );
        const direction = b.clone().sub(a);
        const rail = mesh(
          new THREE.CylinderGeometry(0.065, 0.065, direction.length(), 8),
          railMaterial,
          g,
        );
        rail.position.copy(a).add(b).multiplyScalar(0.5);
        rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      }
      g.userData.index = index;
      this.stationGroups.push(g);
      this.root.add(g);
    });
  }
  private makeCamp() {
    const g = new THREE.Group();
    g.position.set(-15, terrainHeight(-15, 206), 206);
    g.rotation.y = -0.4;
    const tent = mesh(new THREE.ConeGeometry(5, 5.7, 4), mat(0xe7b168), g, 0, 2.6);
    tent.rotation.y = Math.PI / 4;
    tent.scale.set(1, 1, 1.45);
    mesh(new THREE.ConeGeometry(2.5, 4, 3), mat(0x3f584d), g, 0, 1.6, 4);
    const pole = mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 5), mat(0x64543d), g, 6, 3);
    mesh(new THREE.BoxGeometry(2.5, 1.4, 0.08), mat(0xe2bd79), g, 7.2, 5);
    pole.rotation.z = -0.05;
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      mesh(
        new THREE.DodecahedronGeometry(0.6),
        mat(0x869181),
        g,
        Math.sin(a) * 2 + 8,
        0.3,
        Math.cos(a) * 2 + 7,
      );
    }
    for (let i = 0; i < 2; i++) {
      const fire = mesh(
        new THREE.ConeGeometry(0.9 - i * 0.3, 2.4 - i * 0.5, 5),
        new THREE.MeshBasicMaterial({ color: i ? 0xffe2a0 : 0xe8974f }),
        g,
        8,
        1 + i * 0.4,
        7,
      );
      this.fires.push(fire);
    }
    mesh(new THREE.BoxGeometry(3, 1.2, 1.8), mat(0x8b6d48), g, -5, 0.6, 4);
    this.root.add(g);
  }
  activateStation(index: number, active: boolean) {
    const g = this.stationGroups[index];
    const core = g.getObjectByName('core') as THREE.Mesh<
      THREE.OctahedronGeometry,
      THREE.MeshStandardMaterial
    >;
    core.material.color.set(active ? '#9cffe1' : '#e9bc70');
    core.material.emissive.set(active ? '#55dbb2' : '#c58b3f');
    (this.beams[index].material as THREE.MeshBasicMaterial).color.set(
      active ? '#9bffe0' : '#f5d490',
    );
    (this.beams[index].material as THREE.MeshBasicMaterial).opacity = active ? 0.27 : 0.14;
  }
  update(t: number) {
    this.stationGroups.forEach((g, i) => {
      const core = g.getObjectByName('core')!;
      core.rotation.y = t * 0.45;
      core.position.y = 6 + STATION_DECK_RISE + Math.sin(t * 1.4 + i) * 0.4;
      g.getObjectByName('ring')!.rotation.z = t * 0.15;
    });
    this.fires.forEach((f, i) => {
      f.scale.y = 1 + Math.sin(t * 12 + i) * 0.18;
    });
  }
}
