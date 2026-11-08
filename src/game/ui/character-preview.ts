import * as THREE from 'three';
import { WALK_SPEED, RUN_SPEED, surfaceTravelScale } from '../player/movement';
import { PlayerView } from '../player/player-view';
import type { Appearance } from '../player/appearance';
import { mesh, mat } from '../shared/meshes';
import { disposeScene } from '../shared/dispose';
import { renderActivity } from '../diagnostics/render-activity';
import { FrameLoop } from '../app/frame-loop';
import type { FrameTick } from '../app/frame-loop';
export type PreviewMotion = 'idle' | 'walk' | 'run' | 'up' | 'down' | 'jump';
export class CharacterPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private renderer: THREE.WebGLRenderer;
  private actor: PlayerView;
  private position = new THREE.Vector3();
  private sun = new THREE.DirectionalLight(0xffefd5, 3.2);
  private stairs = new THREE.Group();
  private ground: THREE.Mesh;
  private observer?: ResizeObserver;
  private loop: FrameLoop;
  private abort = new AbortController();
  private contextLost = false;
  private disposed = false;
  private time = 0;
  private motion: PreviewMotion = 'idle';
  private angle = -0.4;
  private closeActivity?: () => void;
  constructor(
    private canvas: HTMLCanvasElement,
    appearance: Appearance,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.loop = new FrameLoop(this.frame);
    try {
      this.actor = new PlayerView(this.scene);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.info.autoReset = false;
      this.scene.add(new THREE.HemisphereLight(0xfff7e5, 0x5a7062, 2.5));
      const sun = this.sun;
      sun.position.set(-4, 12, -7);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -12;
      sun.shadow.camera.right = 12;
      sun.shadow.camera.top = 12;
      sun.shadow.camera.bottom = -12;
      sun.shadow.normalBias = 0.035;
      this.scene.add(sun, sun.target);
      this.ground = mesh(
        new THREE.BoxGeometry(70, 0.2, 100),
        mat(0xc3cbb7),
        this.scene,
        0,
        -0.1,
        -30,
      );
      this.ground.castShadow = false;
      this.scene.add(this.stairs);
      const stepGeometry = new THREE.BoxGeometry(5, 0.9, 0.9);
      const stepMaterials = [mat(0xbac4ae), mat(0xb3bea8)];
      for (let i = -4; i < 36; i++) {
        const step = mesh(
          stepGeometry,
          stepMaterials[Math.abs(i % 2)],
          this.stairs,
          0,
          i * 0.24 - 0.45,
          -(i + 0.5) * 0.9,
        );
        step.name = String(i);
      }
      this.actor.setAppearance(appearance);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      this.resize();
      this.closeActivity = renderActivity.openPreview();
      const signal = this.abort.signal;
      document.addEventListener('visibilitychange', () => this.syncLoop(), { signal });
      canvas.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          this.contextLost = true;
          this.syncLoop();
        },
        { signal },
      );
      canvas.addEventListener(
        'webglcontextrestored',
        () => {
          this.contextLost = false;
          this.syncLoop();
          this.loop.invalidate();
        },
        { signal },
      );
      this.syncLoop();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private syncLoop() {
    this.loop.setMode(document.hidden || this.contextLost ? 'blocked' : 'play');
  }
  setAppearance(value: Appearance) {
    this.actor.setAppearance(value);
  }
  setMotion(value: PreviewMotion) {
    this.motion = value;
    this.time = 0;
    this.position.set(0, 0, 0);
    this.actor.reset();
    this.stairs.visible = value === 'up' || value === 'down';
    this.ground.visible = !this.stairs.visible;
    for (const step of this.stairs.children)
      step.position.y = Number(step.name) * (value === 'down' ? -0.24 : 0.24) - 0.45;
  }
  setAngle(degrees: number) {
    this.angle = (degrees * Math.PI) / 180;
  }
  private resize() {
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.loop.invalidate();
  }
  private frame = ({ dt }: FrameTick) => {
    const stamp = renderActivity.enabled ? performance.now() : 0;
    this.time += dt;
    const moving = ['walk', 'run', 'up', 'down'].includes(this.motion);
    const speed = this.motion === 'run' ? RUN_SPEED : WALK_SPEED;
    const surface = (_x: number, z: number) =>
      this.motion === 'up'
        ? Math.floor(-z / 0.9) * 0.24
        : this.motion === 'down'
          ? -Math.floor(-z / 0.9) * 0.24
          : 0;
    if (moving)
      this.position.z -=
        speed * surfaceTravelScale(surface, this.position.x, this.position.z, 0, -1) * dt;
    if (this.position.z < -18) {
      const oldHeight = surface(0, this.position.z);
      this.position.z += 18;
      this.actor.shiftOrigin(new THREE.Vector3(0, surface(0, this.position.z) - oldHeight, 18));
    }
    this.position.y = surface(0, this.position.z);
    if (this.motion === 'jump')
      this.position.y =
        Math.max(0, Math.sin(((this.time % 2.5) / 1.2) * Math.PI)) *
        (this.time % 2.5 < 1.2 ? 2.3 : 0);
    this.actor.update(this.time, this.position, moving, speed, false, {
      surface,
      grounded: this.motion !== 'jump' || this.position.y === 0,
    });
    this.sun.target.position.copy(this.position);
    this.sun.position.copy(this.position).add(new THREE.Vector3(-4, 12, -7));
    const target = this.position.clone();
    target.y += 2;
    this.camera.position.set(
      target.x + Math.sin(this.angle) * 9.3,
      target.y + 1.4,
      target.z - Math.cos(this.angle) * 9.3,
    );
    this.camera.lookAt(target);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    if (stamp)
      renderActivity.record(
        'preview',
        performance.now() - stamp,
        this.renderer.info.render.calls,
        this.renderer.info.render.triangles,
      );
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.dispose();
    this.abort.abort();
    this.closeActivity?.();
    this.observer?.disconnect();
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
