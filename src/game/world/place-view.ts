import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { WORLD_PLACES } from './places';
import { groundSurface } from './ground-surface';
export class PlaceView {
  readonly root = new THREE.Group();
  private sails: THREE.Group[] = [];
  constructor(scene: THREE.Scene) {
    this.root.name = 'world-places';
    scene.add(this.root);
    const stone = mat(0x969d88),
      wood = mat(0x735c42),
      cloth = mat(0xd4bc87),
      dark = mat(0x455a4b);
    for (const p of WORLD_PLACES) {
      const group = new THREE.Group();
      group.name = `place-${p.id}`;
      group.position.set(p.x, groundSurface(p.x, p.z), p.z);
      this.root.add(group);
      if (p.kind === 'mill') {
        mesh(new THREE.CylinderGeometry(2.7, 3.7, 11, 10), stone, group, 0, 5.5);
        mesh(new THREE.ConeGeometry(3.5, 4, 10), wood, group, 0, 13);
        const sails = new THREE.Group();
        sails.position.set(0, 10, 3.1);
        group.add(sails);
        this.sails.push(sails);
        mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8), wood, sails).rotation.x = Math.PI / 2;
        for (let i = 0; i < 4; i++) {
          const arm = new THREE.Group();
          arm.rotation.z = (i * Math.PI) / 2;
          sails.add(arm);
          mesh(new THREE.BoxGeometry(0.18, 6.8, 0.15), wood, arm, 0, 3);
          mesh(new THREE.BoxGeometry(1.2, 4.5, 0.08), cloth, arm, 0.5, 4);
        }
        mesh(new THREE.BoxGeometry(1.5, 2.6, 0.12), dark, group, 0, 1.3, 3.6);
      } else if (p.kind === 'ruins') {
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 5;
          mesh(new THREE.BoxGeometry(1.4, 8 + i, 1.5), stone, group, x, (8 + i) / 2, 0);
        }
        for (let i = 0; i < 2; i++)
          mesh(new THREE.BoxGeometry(6, 1.3, 1.8), stone, group, (i - 0.5) * 5, 8, 0);
        for (let i = 0; i < 7; i++) {
          const block = mesh(
            new THREE.DodecahedronGeometry(0.9),
            stone,
            group,
            Math.sin(i * 2.1) * 6,
            0.6,
            3 + Math.cos(i * 1.8) * 3,
          );
          block.scale.y = 0.6;
        }
      } else if (p.kind === 'stones') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rock = mesh(
            new THREE.BoxGeometry(1.6, 5 + (i % 3), 1.1),
            stone,
            group,
            Math.sin(a) * 6,
            (5 + (i % 3)) / 2,
            Math.cos(a) * 6,
          );
          rock.rotation.y = -a;
          rock.rotation.z = Math.sin(i) * 0.07;
        }
        mesh(
          new THREE.OctahedronGeometry(0.8),
          mat(0x9bd6ce, { emissive: 0x2c7169, emissiveIntensity: 0.4 }),
          group,
          0,
          1.4,
        );
      } else if (p.kind === 'camp' || p.kind === 'shelter') {
        for (const x of [-3, 3])
          for (const z of [-2, 2])
            mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.9, 6), wood, group, x, 1.95, z);
        const roof = mesh(
          new THREE.ConeGeometry(5, 2.4, 4),
          p.kind === 'camp' ? cloth : wood,
          group,
          0,
          4.4,
        );
        roof.rotation.y = Math.PI / 4;
        roof.scale.z = 0.8;
        mesh(new THREE.BoxGeometry(4, 0.3, 1), wood, group, 0, 1.2, 1);
        for (const x of [-1.5, 1.5])
          mesh(new THREE.BoxGeometry(0.3, 1.2, 0.8), wood, group, x, 0.6, 1);
        if (p.kind === 'camp') {
          const tent = mesh(new THREE.ConeGeometry(2.5, 3.5, 4), cloth, group, -5, 1.6, -3);
          tent.rotation.y = Math.PI / 4;
          mesh(new THREE.BoxGeometry(1.5, 0.8, 1), wood, group, 5, 0.4, 0);
        }
      } else {
        mesh(new THREE.BoxGeometry(2.4, 0.25, 0.65), wood, group, 0, 1, -1.3);
        for (const x of [-0.8, 0.8])
          mesh(new THREE.BoxGeometry(0.22, 1, 0.5), wood, group, x, 0.5, -1.3);
        mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.8, 6), wood, group, 0, 1.4, 1.3);
        mesh(new THREE.BoxGeometry(1.7, 0.8, 0.12), cloth, group, 0, 2.2, 1.3);
      }
    }
  }
  update(t: number) {
    for (const sails of this.sails) sails.rotation.z = t * 0.25;
  }
}
