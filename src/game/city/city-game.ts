import './city.css';
import * as THREE from 'three';
import { FrameLoop } from '../app/frame-loop';
import type { FrameTick } from '../app/frame-loop';
import { GameRenderer } from '../app/renderer';
import { CharacterPreferences } from '../persistence/character-preferences';
import { browserStorage } from '../persistence/expedition-storage';
import { CameraController } from '../player/camera-controller';
import { InputController } from '../player/input-controller';
import type { InputAction } from '../player/input-controller';
import { WALK_SPEED } from '../player/movement';
import { PlayerController } from '../player/player-controller';
import { PlayerView } from '../player/player-view';
import { disposeScene } from '../shared/dispose';
import { $ } from '../ui/dom';
import { mobileControls } from '../ui/shell';
import { VehicleController } from '../vehicles/vehicle-controller';
import type { VehicleSave } from '../vehicles/vehicle-controller';
import { VehicleTransition } from '../vehicles/vehicle-transition';
import { VehicleView } from '../vehicles/vehicle-view';
import { buildCity } from './city-view';
import { drawCityMap } from './map';
import { CITY_LAYOUT } from './layout';

const SAVE_KEY = 'wild-atlas-city-view-v1';
const groundAt = () => CITY_LAYOUT.height;

export function startCity() {
  document.title = 'City View — Wild Atlas';
  $('app').innerHTML = `
    <main id="game" class="city" aria-label="시티 뷰 3D 탐험">
      <canvas id="world" tabindex="0" aria-label="시티 뷰. WASD 이동과 운전, F 승하차, M 지도"></canvas>
      <header class="city-header">
        <div><span class="eyebrow">WILD ATLAS · CITY MAP 01</span><h1>City View</h1></div>
        <nav aria-label="시티 뷰 메뉴">
          <button id="city-map-button" class="secondary-button">도시 지도 <kbd>M</kbd></button>
          <a href="?" class="secondary-button">섬으로 돌아가기</a>
        </nav>
      </header>
      <section class="city-hud" aria-label="탐험 상태">
        <span class="eyebrow">PARKSIDE DISTRICT</span>
        <strong id="city-mode">도보 탐험</strong>
        <span id="city-position"></span>
        <button id="city-vehicle" class="secondary-button" hidden>버기 타기 <kbd>F</kbd></button>
        <span id="city-status" role="status"></span>
      </section>
      <footer class="city-controls">WASD 이동·운전 · SPACE 점프·브레이크 · F 승하차 · 드래그 시점</footer>
      ${mobileControls(true)}
      <dialog id="city-map-dialog" class="city-map-dialog" aria-labelledby="city-map-title">
        <div><h2 id="city-map-title">시티 뷰 지도</h2><button id="city-close-map" class="secondary-button" aria-label="지도 닫기">닫기</button></div>
        <canvas id="city-map" width="520" height="520" aria-label="건물, 도로, 공원과 현재 위치를 표시하는 도시 지도"></canvas>
        <p>● 나의 위치 · ■ 버기 · N ↑</p>
      </dialog>
    </main>`;
  return new CityGame();
}

class CityGame {
  private canvas = $<HTMLCanvasElement>('world');
  private map = $<HTMLDialogElement>('city-map-dialog');
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.3, 420);
  private collected = new Set<number>();
  private vehicle = new VehicleController([], this.collected, CITY_LAYOUT);
  private player = new PlayerController(
    [],
    this.collected,
    () => {},
    (x, z) => this.vehicle.blocksPedestrian(x, z),
    CITY_LAYOUT,
  );
  private renderer: GameRenderer;
  private cameraController: CameraController;
  private playerView: PlayerView;
  private vehicleView: VehicleView;
  private input: InputController;
  private loop: FrameLoop;
  private storage = browserStorage();
  private abort = new AbortController();
  private transition?: VehicleTransition;
  private elapsed = 0;
  private nextHudUpdate = 0;
  private contextLost = false;

  constructor() {
    this.renderer = new GameRenderer(this.canvas, this.scene, this.camera);
    this.renderer.setQuality(false);
    this.restore();
    const obstacles = buildCity(this.scene);
    this.cameraController = new CameraController(
      this.camera,
      [],
      this.collected,
      this.player.position,
      obstacles,
      groundAt,
    );
    this.playerView = new PlayerView(this.scene);
    this.vehicleView = new VehicleView(this.scene);
    const appearance = new CharacterPreferences(this.storage).load();
    if (appearance) {
      this.playerView.setAppearance(appearance);
      this.vehicleView.setAppearance(appearance);
    }
    this.loop = new FrameLoop(this.frame);
    this.input = new InputController(this.canvas, {
      paused: () => this.map.open || document.hidden || this.contextLost,
      action: (action) => this.act(action),
      rotate: (dx, dy) => this.cameraController.rotate(dx, dy),
      zoom: (delta) => this.cameraController.zoomBy(delta),
    });
    const signal = this.abort.signal;
    $('city-map-button').addEventListener('click', () => this.act('map'), { signal });
    $('city-close-map').addEventListener('click', () => this.map.close(), { signal });
    $('city-vehicle').addEventListener('click', () => this.act('vehicle'), { signal });
    this.map.addEventListener(
      'close',
      () => {
        this.syncLoop();
        this.canvas.focus();
      },
      { signal },
    );
    window.addEventListener(
      'resize',
      () => {
        this.renderer.resize();
        this.loop.invalidate();
      },
      { signal },
    );
    window.addEventListener('pagehide', () => this.save(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.save();
        this.syncLoop();
      },
      { signal },
    );
    this.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.syncLoop();
      },
      { signal },
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.contextLost = false;
        this.syncLoop();
        this.loop.invalidate();
      },
      { signal },
    );
    this.canvas.focus();
    this.syncLoop();
  }

  private syncLoop() {
    this.input.clear();
    this.loop.setMode(
      document.hidden || this.contextLost ? 'blocked' : this.map.open ? 'idle' : 'play',
    );
  }

  private act(action: InputAction) {
    if (action === 'map' || action === 'pause') {
      if (this.map.open) this.map.close();
      else if (action === 'map') {
        drawCityMap($<HTMLCanvasElement>('city-map'), this.player.position, this.vehicle.position);
        this.map.showModal();
        this.syncLoop();
      }
      return;
    }
    if (this.map.open || this.transition || this.contextLost) return;
    if (action === 'jump' && !this.vehicle.riding) this.player.jump();
    if (action !== 'vehicle') return;
    const { player, vehicle } = this;
    if (vehicle.riding) {
      const target = vehicle.exit();
      if (!target) {
        $('city-status').textContent = '차를 멈추고 주변에 내릴 공간을 확보하세요.';
        return;
      }
      this.transition = new VehicleTransition(
        'exit',
        player.position.clone(),
        target,
        vehicle.heading,
      );
      $('city-status').textContent = '버기에서 내립니다.';
    } else {
      if (!player.isGrounded || !vehicle.nearby(player.position)) return;
      const approach = vehicle.boardingApproach(player.position);
      if (!approach || !vehicle.board(player.position)) {
        $('city-status').textContent = '버기의 열린 옆쪽으로 다가가세요.';
        return;
      }
      this.transition = new VehicleTransition(
        'board',
        player.position.clone(),
        vehicle.position.clone(),
        vehicle.heading,
        approach,
      );
      $('city-status').textContent = '버기에 탑니다.';
    }
    this.input.clear();
    this.canvas.focus();
  }

  private frame = ({ dt }: FrameTick) => {
    this.elapsed += dt;
    const { player, vehicle } = this;
    const axes = this.input.axes;
    let moving = false;
    let speed = WALK_SPEED;
    if (this.transition) {
      const transition = this.transition;
      const done = transition.advance(dt);
      player.position.copy(transition.position);
      moving = transition.walking;
      if (moving) player.heading = transition.walkHeading;
      if (done) {
        player.teleport(transition.to.x, transition.to.y, transition.to.z, false);
        player.heading = vehicle.heading;
        this.playerView.reset();
        this.transition = undefined;
        this.save();
      }
    } else if (vehicle.riding) {
      vehicle.update(dt, axes.forward, axes.right, axes.brake);
      player.position.copy(vehicle.position);
      this.cameraController.followHeading(vehicle.heading, dt);
    } else {
      ({ moving, speed } = player.update(
        dt,
        this.cameraController.yaw,
        axes.forward,
        axes.right,
        axes.sprint,
      ));
    }
    this.playerView.group.visible = this.transition ? this.transition.walking : !vehicle.riding;
    if (this.playerView.group.visible) {
      this.playerView.group.rotation.y = player.heading;
      this.playerView.update(this.elapsed, player.position, moving, speed, false, {
        grounded: player.isGrounded,
        surface: groundAt,
      });
    }
    this.vehicleView.update(vehicle, dt, this.transition);
    this.cameraController.update(player.position, dt, vehicle.riding);
    this.renderer.render();
    if (this.elapsed >= this.nextHudUpdate) {
      this.nextHudUpdate = this.elapsed + 0.1;
      this.updateHud();
    }
  };

  private updateHud() {
    const { vehicle, player } = this;
    const mode = vehicle.riding
      ? `운전 · ${Math.round(Math.abs(vehicle.speed) * 3.6)} km/h`
      : '도보 탐험';
    const position = `X ${Math.round(player.position.x)} m · Z ${Math.round(player.position.z)} m`;
    if ($('city-mode').textContent !== mode) $('city-mode').textContent = mode;
    if ($('city-position').textContent !== position) $('city-position').textContent = position;
    const canUseVehicle = !this.transition && (vehicle.riding || vehicle.nearby(player.position));
    const label = vehicle.riding ? '버기 내리기 · F' : '버기 타기 · F';
    for (const button of [$('city-vehicle'), $('touch-vehicle')]) {
      button.hidden = !canUseVehicle;
      if (button.textContent !== label) button.textContent = label;
    }
  }

  private save() {
    const p = this.transition?.to ?? this.player.position;
    try {
      this.storage?.setItem(
        SAVE_KEY,
        JSON.stringify({
          x: p.x,
          z: p.z,
          vehicle: this.vehicle.snapshot(),
        }),
      );
    } catch {
      // A disabled or full browser store still allows play.
    }
  }

  private restore() {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      if (!raw) return;
      const save: { x: number; z: number; vehicle: VehicleSave } | null = JSON.parse(raw);
      const v = save?.vehicle;
      if (
        v &&
        [v.x, v.z, v.heading].every(Number.isFinite) &&
        typeof v.riding === 'boolean' &&
        this.vehicle.canOccupy(v.x, v.z, v.heading)
      ) {
        this.vehicle.restore(v);
      }
      if (this.vehicle.riding) this.player.position.copy(this.vehicle.position);
      else if (
        save &&
        [save.x, save.z].every(Number.isFinite) &&
        !CITY_LAYOUT.blocked(save.x, save.z, 0.65) &&
        !this.vehicle.blocksPedestrian(save.x, save.z)
      ) {
        this.player.reset(save.x, save.z);
      } else if (this.vehicle.blocksPedestrian(this.player.position.x, this.player.position.z)) {
        this.vehicle.reset();
      }
    } catch {
      // Invalid city saves fall back to the map entry.
    }
  }

  dispose() {
    this.abort.abort();
    this.loop.dispose();
    this.input.dispose();
    this.cameraController.dispose();
    disposeScene(this.scene);
    this.renderer.dispose();
  }
}
