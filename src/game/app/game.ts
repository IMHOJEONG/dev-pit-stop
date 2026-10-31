import { WORLD_PLACES } from '../world/places';
import { WALK_SPEED } from '../player/movement';
import { CharacterPreferences } from '../persistence/character-preferences';
import { LAUNCH, RUNES, SUMMIT } from '../sky/sky-world';
import { WorldScene } from '../world/world-scene';
import { STATIONS } from '../world/landmarks';
import { HARVEST_RULES, RESOURCE_NAMES } from '../resources/catalog';
import { ITEMS } from '../items/catalog';
import { makeResources } from '../resources/distribution';
import { ExpeditionState } from '../expedition/expedition-state';
import { findInteraction } from '../expedition/interactions';
import type { InteractionTarget } from '../expedition/interactions';
import { MapView } from '../expedition/map-view';
import { ExpeditionStorage, browserStorage } from '../persistence/expedition-storage';
import { PlayerController } from '../player/player-controller';
import { CameraController } from '../player/camera-controller';
import { InputController } from '../player/input-controller';
import type { InputAction } from '../player/input-controller';
import { AmbientAudio } from '../audio/ambient-audio';
import { $ } from '../ui/dom';
import { icon } from '../ui/icons';
import { Hud } from '../ui/hud';
import { Panels } from '../ui/panels';
import type { Panel } from '../ui/panels';
import { GameRenderer } from './renderer';

/** Application coordinator: domains own their rules, views own their animation. */
export class Game {
  readonly state = new ExpeditionState(makeResources());
  readonly world = new WorldScene(this.state.resources);
  private characterPreferences = new CharacterPreferences(browserStorage());
  private map = new MapView(this.state);
  private hud = new Hud(this.world.camera, this.map);
  private storage = new ExpeditionStorage(browserStorage(), this.state.resources);
  private player = new PlayerController(this.state.resources, this.state.collected, () =>
    this.hud.showToast('깊은 물이에요. 해안을 따라 다른 길을 찾아보세요.'),
  );
  private camera = new CameraController(
    this.world.camera,
    this.state.resources,
    this.state.collected,
    this.player.position,
    [
      this.world.sky.root,
      this.world.structures.root,
      this.world.routes.root,
      this.world.places.root,
    ],
  );
  private audio = new AmbientAudio((message) => this.hud.showToast(message));
  private renderer: GameRenderer;
  private panels: Panels;
  private input: InputController;
  private abort = new AbortController();
  private started = false;
  private disposed = false;
  private resumed = false;
  private elapsed = 0;
  private lastFrame = 0;
  private lastUI = 0;
  private lastSave = 0;
  private lastInteraction = -10;
  private storageAvailable = true;
  private nearby: InteractionTarget = null;
  private raf = 0;
  private loadingTimer: ReturnType<typeof setTimeout>;
  private completionTimer: ReturnType<typeof setTimeout> | null = null;
  constructor() {
    this.renderer = new GameRenderer(
      $<HTMLCanvasElement>('world'),
      this.world.scene,
      this.world.camera,
    );
    this.panels = new Panels({
      appearance: (value) => {
        this.state.appearance = { ...value };
        this.world.player.setAppearance(value);
        const saved = this.characterPreferences.save(value);
        this.save(false);
        this.hud.showToast(
          saved
            ? '새로운 모습으로 탐험을 이어가세요 · 선택을 저장했습니다'
            : '캐릭터를 바꿨어요 · 브라우저 저장소를 사용할 수 없어 이번에만 적용됩니다',
        );
      },
      changed: () => {
        this.input?.clear();
        this.syncAudio();
        this.updateUI();
      },
      resume: () => {
        if (!this.started) this.start();
      },
      track: (index) => {
        this.state.target = index;
        this.state.navigation = { kind: 'station', index };
        this.hud.showToast(`${STATIONS[index].name}(으)로 안내합니다.`);
      },
      trackPlace: (index) => {
        this.state.navigation = { kind: 'place', index };
        this.hud.showToast(
          this.state.discoveries.has(WORLD_PLACES[index].id)
            ? `${WORLD_PLACES[index].name} 방향으로 탐험을 이어가세요`
            : '갈림길을 따라 새로운 장소를 찾아보세요',
        );
      },
      clearTrack: () => {
        this.state.navigation = null;
      },
      drawMap: (canvas) => this.map.draw(canvas, true, this.player.position, this.camera.yaw),
      quality: (high) => this.renderer.setQuality(high),
      toggleAudio: () => this.toggleAudio(),
      save: () => this.save(true),
      returnCamp: () => {
        this.state.sky.inSky = false;
        this.state.sky.ride = null;
        this.player.reset();
        this.save(false);
        this.hud.showToast('베이스캠프로 돌아왔습니다.');
      },
      reset: () => this.reset(),
      useItem: (item) => {
        const result = this.state.items.use(item, this.player.stamina);
        if (result.used) {
          this.player.stamina = result.stamina;
          this.save(false);
          this.updateUI();
        }
        return result;
      },
    });
    this.input = new InputController($<HTMLCanvasElement>('world'), {
      paused: () => this.paused,
      action: (action) => this.handleAction(action),
      rotate: (dx, dy) => {
        if (!this.panels.active) this.camera.rotate(dx, dy);
      },
      zoom: (delta) => this.camera.zoomBy(delta),
    });
    const saved = this.storage.load();
    if (saved) {
      this.state.restore(saved);
      this.player.reset(saved.x, saved.z);
      if (this.state.sky.inSky) {
        const p = this.state.sky.checkpoint();
        this.player.teleport(p.x, p.y, p.z, true);
      }
      this.state.collected.forEach((id) => this.world.resources.setCollected(id));
      this.state.repaired.forEach((id) => this.world.structures.activateStation(id, true));
      this.resumed = true;
      $('play-button').innerHTML = `이어서 탐험하기 ${icon('arrow')}`;
    }
    this.state.appearance = this.characterPreferences.load() ?? this.state.appearance;
    this.world.player.setAppearance(this.state.appearance);
    this.state.explore(this.player.position);
    this.camera.update(this.player.position, 1);
    this.bindUI();
    this.updateUI();
    this.raf = requestAnimationFrame(this.frame);
    this.loadingTimer = setTimeout(() => {
      $('loading').style.opacity = '0';
      this.loadingTimer = setTimeout(() => {
        $('loading').hidden = true;
      }, 650);
    }, 100);
  }
  private get paused() {
    return !this.started || this.panels.active !== null || document.hidden;
  }
  private bindUI() {
    const signal = this.abort.signal;
    const buttons: Record<string, () => void> = {
      'play-button': () => this.start(),
      'map-button': () => this.openPanel('map'),
      'minimap-button': () => this.openPanel('map'),
      'journal-button': () => this.openPanel('map'),
      'character-button': () => this.openPanel('character'),
      'bag-button': () => this.openPanel('bag'),
      'intro-character': () => this.openPanel('character'),
      'help-button': () => this.openPanel('help'),
      'settings-button': () => this.openPanel('settings'),
      'sound-button': () => void this.toggleAudio(),
    };
    for (const [id, action] of Object.entries(buttons))
      $(id).addEventListener('click', action, { signal });
    window.addEventListener('resize', () => this.renderer.resize(), { signal });
    window.addEventListener('pagehide', () => this.save(false), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        this.input.clear();
        if (document.hidden) this.save(false);
        this.syncAudio();
      },
      { signal },
    );
    $('world').addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.input.clear();
        this.hud.showToast('그래픽 연결이 끊어졌어요. 복구를 기다리는 중입니다.');
      },
      { signal },
    );
    $('world').addEventListener(
      'webglcontextrestored',
      () => this.hud.showToast('그래픽 연결이 복구되었습니다.'),
      { signal },
    );
  }
  private handleAction(action: InputAction) {
    if (action === 'pause') {
      if (this.panels.active) this.panels.close();
      else if (this.started) this.openPanel('settings');
      return;
    }
    if (action === 'map') {
      if (this.panels.active === 'map') this.panels.close();
      else this.openPanel('map');
      return;
    }
    if (action === 'bag') {
      if (this.panels.active === 'bag') this.panels.close();
      else this.openPanel('bag');
      return;
    }
    if (this.paused) return;
    if (action === 'photo') this.hud.togglePhoto();
    if (action === 'jump' && !this.state.sky.ride) this.player.jump();
    if (action === 'interact') this.interact();
  }
  private start() {
    this.started = true;
    this.hud.start(this.resumed);
    this.syncAudio();
  }
  private openPanel(panel: Panel) {
    this.panels.open(panel, {
      expedition: this.state,
      started: this.started,
      highQuality: this.renderer.highQuality,
      audioEnabled: this.audio.enabled,
      stamina: this.player.stamina,
    });
  }
  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - (this.lastFrame || now)) / 1000, 0.045);
    this.lastFrame = now;
    let moving = false,
      speed = WALK_SPEED;
    if (!this.paused) {
      this.elapsed += dt;
      this.state.time = (this.state.time + dt * 0.012 * this.state.timeRate) % 24;
      const axes = this.input.axes;
      const riding = this.state.sky.advanceRide(dt);
      if (riding) {
        this.player.position.set(riding.position.x, riding.position.y, riding.position.z);
        if (riding.done) {
          this.player.teleport(
            riding.position.x,
            riding.position.y,
            riding.position.z,
            this.state.sky.inSky,
          );
          this.save(false);
          this.hud.showToast(
            this.state.sky.inSky
              ? '구름 항구 도착 · 황금빛 룬을 찾아 E를 누르세요'
              : '지상으로 돌아왔습니다',
          );
        }
      }
      const movement = riding
        ? { moving: false, speed: WALK_SPEED, distance: 0 }
        : this.player.update(dt, this.camera.yaw, axes.forward, axes.right, axes.sprint);
      moving = movement.moving;
      speed = movement.speed;
      this.state.distance += movement.distance;
      if (this.player.elevated && this.player.position.y < 115) {
        const p = this.state.sky.checkpoint();
        this.player.teleport(p.x, p.y, p.z, true);
        this.hud.showToast('바람이 마지막 체크포인트로 돌려보냈습니다 · 자원은 유지됩니다');
      }
      this.state.explore(this.player.position);
      if (!this.state.sky.inSky && !this.state.sky.ride) {
        const discoveries = this.state.discover(this.player.position);
        if (discoveries.length) {
          this.hud.showToast(
            `새로운 장소 발견 · ${discoveries[0].name} · ${this.state.discoveries.size}/${WORLD_PLACES.length}`,
          );
          this.audio.chime(false);
          this.save(false);
        }
      }
      for (const completed of this.state.advanceHarvest(dt)) {
        this.world.resources.setCollected(completed.resource.id);
        this.hud.showToast(
          `${RESOURCE_NAMES[completed.resource.kind]} 채집 완료 · 아이템이 떨어졌어요 · 가까이에서 E로 줍기`,
        );
        this.audio.chime(false);
        this.save(false);
      }
      if (this.elapsed - this.lastSave > 12) {
        this.save(false);
        this.lastSave = this.elapsed;
      }
    }
    this.camera.update(this.player.position, dt, this.state.sky.ride !== null);
    this.world.update(
      this.elapsed,
      this.paused ? 0 : dt,
      this.state.time,
      this.player.position,
      moving,
      speed,
      this.player.heading,
      this.player.elevated,
      this.player.isGrounded || this.state.sky.ride !== null,
      this.state.sky.ride ? this.player.position.y : undefined,
      this.state.items.drops,
    );
    this.world.sky.update(this.elapsed, this.state.sky, this.player.position.y);
    this.renderer.render();
    if (now - this.lastUI > 100) {
      this.updateUI();
      this.lastUI = now;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  private interact() {
    if (this.paused || this.state.sky.ride || this.elapsed - this.lastInteraction < 0.5) return;
    this.nearby = findInteraction(
      this.player.position,
      this.state.resources,
      this.state.collected,
      this.state.repaired,
      this.state.items,
    );
    if (!this.state.sky.inSky && this.nearby?.type === 'drop') {
      const receipt = this.state.items.pickup(this.nearby.ids, this.player.position);
      if (receipt.length) {
        this.lastInteraction = this.elapsed;
        this.audio.chime(false);
        this.hud.showToast(
          receipt.map((r) => `${ITEMS[r.item].name} +${r.amount}`).join(' · ') + ' · 배낭 B',
        );
        this.save(false);
        this.updateUI();
      }
      return;
    }
    if (this.interactSky()) {
      this.lastInteraction = this.elapsed;
      this.save(false);
      this.updateUI();
      return;
    }
    this.nearby = findInteraction(
      this.player.position,
      this.state.resources,
      this.state.collected,
      this.state.repaired,
      this.state.items,
    );
    if (!this.nearby) {
      this.hud.showToast('나무, 바위, 수정이나 관측소에 가까이 다가가세요.');
      return;
    }
    if (this.state.sky.inSky) return;
    if (this.nearby.type === 'resource') {
      const hit = this.state.harvest.hit(this.nearby.resource.id);
      if (!hit) return;
      this.lastInteraction = this.elapsed;
      this.world.resources.playHit(hit);
      this.world.player.strike(hit.resource);
      this.audio.impact(hit.resource.kind);
      const rule = HARVEST_RULES[hit.resource.kind];
      this.hud.showToast(
        hit.finishing
          ? `${rule.label} · ${hit.resource.kind === 'wood' ? '나무가 쓰러지는 중…' : '광석이 부서지는 중…'}`
          : `${rule.action} ${hit.hits} / ${rule.hits} · E 키로 계속 채집하세요`,
      );
    } else if (this.nearby.type === 'station') {
      const index = this.nearby.index;
      this.lastInteraction = this.elapsed;
      if (!this.state.repair(index)) {
        this.hud.showToast('복구 재료가 부족해요. 목재 3 · 돌 2 · 수정 1이 필요합니다.');
        return;
      }
      this.world.structures.activateStation(index, true);
      this.audio.chime(true);
      this.hud.showToast(`${STATIONS[index].name} 관측소 복구 완료!`);
      if (this.state.repaired.size === 1)
        this.hud.showToast(
          '관측소가 상승장의 전원을 연결했습니다! · 목재 2 / 돌 1 / 수정 1로 상승기를 제작하세요',
        );
    }
    this.save(false);
    this.updateUI();
  }
  private interactSky() {
    const sky = this.state.sky,
      p = this.player.position;
    if (Math.hypot(p.x - LAUNCH.x, p.z - LAUNCH.z) < 10) {
      if (!sky.built) {
        const built = sky.build(this.state.inventory, this.state.repaired.size);
        this.hud.showToast(
          built
            ? '상승기 제작 완료! E를 다시 눌러 하늘로 출발하세요'
            : this.state.repaired.size < 1
              ? '먼저 지상 관측소 한 곳을 복구하세요'
              : '상승기 재료: 목재 2 · 돌 1 · 수정 1',
        );
      } else {
        sky.startRide();
        this.input.clear();
        this.hud.showToast(
          sky.inSky ? '바람을 타고 지상으로 내려갑니다' : '상승 기류를 타고 구름 위로 올라갑니다!',
        );
      }
      return true;
    }
    if (!sky.inSky) return false;
    const rune = RUNES.find((r) => Math.hypot(p.x - r.x, p.z - r.z) < 7 && Math.abs(p.y - r.y) < 5);
    if (rune) {
      const activated = sky.activate(rune.index);
      this.hud.showToast(
        activated
          ? `바람 룬 ${sky.runes}/3 활성화 · 체크포인트 저장!`
          : rune.index < sky.runes
            ? '이미 활성화한 룬입니다'
            : '앞선 섬의 룬을 먼저 활성화하세요',
      );
      if (activated) this.audio.chime(true);
      return true;
    }
    if (Math.hypot(p.x - SUMMIT.x, p.z - SUMMIT.z) < 9) {
      if (sky.finish()) {
        this.audio.chime(true);
        this.openPanel('complete');
      } else
        this.hud.showToast(
          sky.complete ? '천공 신호가 빛나고 있습니다' : '바람 룬 세 개를 먼저 활성화하세요',
        );
      return true;
    }
    return false;
  }
  private updateUI() {
    this.nearby =
      this.paused || this.state.sky.inSky || this.state.sky.ride
        ? null
        : findInteraction(
            this.player.position,
            this.state.resources,
            this.state.collected,
            this.state.repaired,
            this.state.items,
          );
    this.world.resources.showHarvestTarget(
      this.nearby?.type === 'resource' ? this.nearby.resource.id : null,
    );
    this.hud.update({
      expedition: this.state,
      position: this.player.position,
      stamina: this.player.stamina,
      yaw: this.camera.yaw,
      nearby: this.nearby,
      paused: this.paused,
    });
  }
  private save(feedback: boolean) {
    if (!this.started) {
      if (feedback) this.hud.showToast('탐험을 시작하면 저장할 수 있어요.');
      return;
    }
    if (this.storage.save(this.state.snapshot(this.player.position))) {
      if (feedback) this.hud.showToast('탐험 기록을 이 브라우저에 저장했습니다.');
    } else {
      if (feedback || this.storageAvailable)
        this.hud.showToast('브라우저 저장소를 사용할 수 없어 이번 탐험은 자동 저장되지 않아요.');
      this.storageAvailable = false;
    }
  }
  private reset() {
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.state.reset();
    this.player.reset();
    this.world.player.reset();
    this.world.resources.restoreResources();
    this.world.drops.reset();
    STATIONS.forEach((_, index) => this.world.structures.activateStation(index, false));
    this.state.explore(this.player.position);
    this.lastInteraction = -10;
    this.resumed = false;
    if (!this.started) this.start();
    this.save(false);
    this.updateUI();
    this.hud.showToast('새로운 발걸음 · 탐험을 다시 시작합니다.');
  }
  private async toggleAudio() {
    await this.audio.toggle();
    this.hud.setSound(this.audio.enabled);
    this.syncAudio();
    return this.audio.enabled;
  }
  private syncAudio() {
    this.audio.sync(this.paused, document.hidden);
  }
  dispose() {
    this.save(false);
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.loadingTimer);
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.abort.abort();
    this.input.dispose();
    this.panels.dispose();
    this.hud.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.world.dispose();
  }
}
