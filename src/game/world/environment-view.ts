import * as THREE from 'three';
import { mat, mesh } from '../shared/meshes';
import { terrainHeight } from './terrain';
import { random, clamp } from '../shared/math';
export class EnvironmentView {
  readonly sun = new THREE.DirectionalLight(0xffeed1, 2.8);
  readonly ambient = new THREE.HemisphereLight(0xe7f0d4, 0x527d62, 2.6);
  readonly water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private clouds: THREE.Group[] = [];
  private birds: THREE.Group[] = [];
  private foxes: { group: THREE.Group; x: number; z: number; phase: number }[] = [];
  constructor(private scene: THREE.Scene) {
    this.scene.background = new THREE.Color('#b6d5cf');
    this.scene.fog = new THREE.Fog('#c3d7c6', 190, 930);
    this.scene.add(this.ambient, this.sun);
    this.sun.position.set(-170, 240, 130);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.7;
    this.scene.add(this.sun.target);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color('#76b5bd') },
          bottom: { value: new THREE.Color('#e6e6c7') },
        },
        vertexShader:
          'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 vWorld;uniform vec3 top;uniform vec3 bottom;void main(){float t=pow(max(normalize(vWorld).y,0.),.65);gl_FragColor=vec4(mix(bottom,top,t),1.);\n#include <colorspace_fragment>\n}',
      }),
    );
    this.scene.add(this.sky);
    const sunDisk = mesh(
      new THREE.SphereGeometry(32, 20, 12),
      new THREE.MeshBasicMaterial({ color: '#fff2ca', fog: false }),
      this.scene,
      -580,
      330,
      -920,
    );
    sunDisk.castShadow = false;

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, daylight: { value: 1 } },
        vertexShader:
          'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 vWorld;uniform float time;uniform float daylight;
        void main(){float waves=sin(vWorld.x*.11+time*.6+sin(vWorld.z*.09))*sin(vWorld.z*.15-time*.4);
        float line=pow(max(0.,sin(vWorld.z*.4+vWorld.x*.07+time*.7+sin(vWorld.x*.06))),28.);
        vec3 c=mix(vec3(.20,.49,.49),vec3(.36,.65,.62),waves*.5+.5)+line*.12;
        gl_FragColor=vec4(c*(.35+daylight*.65),1.);
        #include <colorspace_fragment>
        }`,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.1;
    this.scene.add(this.water);
    this.makeAtmosphere();
  }
  private makeAtmosphere() {
    const rng = random(888);
    const cloudMat = mat(0xf3edda);
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = mesh(
          new THREE.IcosahedronGeometry(1, 1),
          cloudMat,
          g,
          j * 15,
          rng() * 5,
          rng() * 8,
        );
        m.scale.set(19 + rng() * 12, 6 + rng() * 5, 10 + rng() * 5);
        m.castShadow = false;
      }
      g.position.set((rng() - 0.5) * 1700, 155 + rng() * 120, (rng() - 0.5) * 1700);
      this.scene.add(g);
      this.clouds.push(g);
    }
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const wingMat = mat(0x485e55);
      for (let j = 0; j < 2; j++) {
        const wing = mesh(new THREE.ConeGeometry(0.6, 3, 3), wingMat, g, j ? 1 : -1);
        wing.rotation.z = j ? -1.3 : 1.3;
        wing.scale.z = 0.16;
      }
      this.scene.add(g);
      this.birds.push(g);
    }
    for (let i = 0; i < 12; i++) {
      const x = (rng() - 0.5) * 490,
        z = (rng() - 0.5) * 450;
      if (terrainHeight(x, z) < 5) continue;
      const g = new THREE.Group(),
        orange = mat(0xba764b),
        cream = mat(0xe5d3ad),
        dark = mat(0x4e4e40);
      mesh(new THREE.BoxGeometry(2, 1, 0.8), orange, g, 0, 1.1);
      mesh(new THREE.ConeGeometry(0.6, 1.3, 4), orange, g, -1.1, 1.65).rotation.z = Math.PI / 2;
      mesh(new THREE.ConeGeometry(0.24, 0.65, 4), dark, g, -0.9, 2.15, 0.3);
      mesh(new THREE.ConeGeometry(0.24, 0.65, 4), dark, g, -0.9, 2.15, -0.3);
      const tail = mesh(new THREE.ConeGeometry(0.45, 1.9, 5), cream, g, 1.5, 1);
      tail.rotation.z = -1.9;
      for (let j = 0; j < 4; j++)
        mesh(
          new THREE.BoxGeometry(0.25, 0.7, 0.25),
          dark,
          g,
          j < 2 ? -0.7 : 0.7,
          0.35,
          j % 2 ? 0.3 : -0.3,
        );
      this.scene.add(g);
      this.foxes.push({ group: g, x, z, phase: rng() * 20 });
    }
  }
  update(t: number, dt: number, time: number, player: THREE.Vector3) {
    const daylight = clamp(Math.sin(((time - 6) / 12) * Math.PI) * 1.4, 0.06, 1);
    this.sun.intensity = 0.2 + daylight * 2.6;
    this.ambient.intensity = 0.7 + daylight * 1.8;
    this.sun.position.set(player.x - 170, player.y + 240, player.z + 130);
    this.sun.target.position.copy(player);
    const fogColor = new THREE.Color('#203d4b').lerp(new THREE.Color('#c3d7c6'), daylight);
    (this.scene.fog as THREE.Fog).color.copy(fogColor);
    this.sky.material.uniforms.top.value.set('#172b48').lerp(new THREE.Color('#76b5bd'), daylight);
    this.sky.material.uniforms.bottom.value.copy(fogColor);
    this.water.material.uniforms.time.value = t;
    this.water.material.uniforms.daylight.value = daylight;
    this.clouds.forEach((c, i) => {
      c.position.x += dt * (1 + (i % 3)) * 0.5;
      if (c.position.x > 1100) c.position.x = -1100;
    });
    this.birds.forEach((b, i) => {
      const a = t * 0.09 + i * 0.7;
      b.position.set(
        Math.cos(a) * (100 + i * 25),
        90 + Math.sin(a * 2) * 9 + i * 3,
        Math.sin(a) * 150 - 100,
      );
      b.rotation.y = -a;
      b.children.forEach((w, j) => {
        w.rotation.z = (j ? -1 : 1) * (1.3 + Math.sin(t * 4 + i) * 0.25);
      });
    });
    this.foxes.forEach((f) => {
      const a = t * 0.04 + f.phase;
      const x = f.x + Math.cos(a) * 12,
        z = f.z + Math.sin(a) * 12;
      f.group.position.set(
        x,
        Math.max(0.3, terrainHeight(x, z)) + Math.abs(Math.sin(t * 5 + f.phase)) * 0.12,
        z,
      );
      f.group.rotation.y = -a - Math.PI / 2;
    });
  }
}
