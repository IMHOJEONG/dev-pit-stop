import { navigationPoint } from '../world/regions';
import { WORLD_PLACES } from '../world/places';
import { groundSurface } from '../world/ground-surface';
import { LAUNCH, RUNES, SUMMIT, ISLANDS } from '../sky/sky-world';
import * as THREE from 'three';
import { $ } from './dom';
import { icon } from './icons';
import { STATIONS, canRepair } from '../world/landmarks';
import { terrainHeight, biomeAt } from '../world/terrain';
import { HARVEST_RULES } from '../resources/catalog';
import { ITEMS } from '../items/catalog';
import type { Resource } from '../resources/catalog';
import type { ExpeditionState } from '../expedition/expedition-state';
import type { InteractionTarget } from '../expedition/interactions';
import { MapView } from '../expedition/map-view';
interface HudState {
  expedition: ExpeditionState;
  position: THREE.Vector3;
  stamina: number;
  yaw: number;
  nearby: InteractionTarget;
  paused: boolean;
  vehicleTransition?: boolean;
}
function resourceLabel(resource: Resource, expedition: ExpeditionState) {
  const rule = HARVEST_RULES[resource.kind];
  return expedition.harvest.isFinishing(resource.id)
    ? rule.label + ' · 채집 중…'
    : rule.label + ' · ' + expedition.harvest.hits(resource.id) + ' / ' + rule.hits;
}
export class Hud {
  private walkingHints = $('control-hints').innerHTML;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private camera: THREE.PerspectiveCamera,
    private map: MapView,
  ) {
    const marker = document.createElement('div');
    marker.id = 'journey-marker';
    marker.className = 'world-marker';
    marker.innerHTML = '<span>✦</span><small></small><b></b>';
    $('world-markers').append(marker);
  }
  update(state: HudState) {
    const bag = state.expedition.items.totals();
    $('bag-count').textContent = String(bag.kinds);
    $('bag-count').hidden = bag.kinds === 0;
    $('bag-button').title = `배낭 B · ${bag.kinds}종 · ${bag.amount}개`;
    for (const kind of ['wood', 'stone', 'crystal'] as const)
      $(`count-${kind}`).textContent = String(state.expedition.inventory[kind]);
    $('clock').textContent =
      `${String(Math.floor(state.expedition.time)).padStart(2, '0')}:${String(Math.floor((state.expedition.time % 1) * 60)).padStart(2, '0')}`;
    $('biome').textContent = biomeAt(state.position.x, state.position.z);
    $('location-coordinates').textContent =
      `${Math.abs(Math.round(state.position.x))} m ${state.position.x >= 0 ? 'E' : 'W'} · ${Math.abs(Math.round(state.position.z))} m ${state.position.z >= 0 ? 'S' : 'N'}`;
    $('altitude').textContent = `해발 ${Math.round(state.position.y)} m`;
    $('stamina-bar').style.width = `${state.stamina}%`;
    $('stamina-value').textContent = String(Math.round(state.stamina));
    $('quest-count').textContent = `${state.expedition.repaired.size} / 3`;
    $('quest-progress').style.width = `${(state.expedition.repaired.size / 3) * 100}%`;
    const s = STATIONS[state.expedition.target];
    $('target-name').textContent =
      state.expedition.repaired.size === 3 ? '모든 신호가 연결되었습니다' : s.name;
    $('target-distance').textContent =
      state.expedition.repaired.size === 3
        ? '자유롭게 섬을 탐험하세요'
        : `관측소까지 ${Math.round(Math.hypot(s.x - state.position.x, s.z - state.position.z))} m`;
    $('bearing').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
      Math.round((((((-state.yaw * 180) / Math.PI) % 360) + 360) % 360) / 45) % 8
    ];
    $('exploration').textContent = `탐험 ${state.expedition.exploredPercent()}%`;
    $('interaction').hidden = !state.nearby || state.paused;
    if (state.nearby)
      $('interaction-text').textContent =
        state.nearby.type === 'drop'
          ? '아이템 줍기 · ' +
            state.nearby.ids
              .map((id) => state.expedition.items.drops.get(id))
              .filter((d) => d !== undefined)
              .map((d) => `${ITEMS[d.item].name} ×${d.amount}`)
              .join(' · ')
          : state.nearby.type === 'resource'
            ? resourceLabel(state.nearby.resource, state.expedition)
            : canRepair(state.expedition.inventory)
              ? '관측소 복구하기'
              : '관측소 · 목재 3 / 돌 2 / 수정 1 필요';
    STATIONS.forEach((station, i) => {
      const point = new THREE.Vector3(
        station.x,
        terrainHeight(station.x, station.z) + 22,
        station.z,
      ).project(this.camera);
      const marker = $(`marker-${i}`),
        d = Math.hypot(state.position.x - station.x, state.position.z - station.z);
      marker.hidden =
        point.z > 1 ||
        point.z < -1 ||
        Math.abs(point.x) > 0.9 ||
        point.y > 0.8 ||
        point.y < -0.5 ||
        d < 13 ||
        (i !== state.expedition.target && d > 180);
      marker.style.left = `${(point.x * 0.5 + 0.5) * innerWidth}px`;
      marker.style.top = `${(-point.y * 0.5 + 0.5) * innerHeight}px`;
      marker.classList.toggle('active', state.expedition.repaired.has(i));
      marker.querySelector('b')!.textContent = state.expedition.repaired.has(i)
        ? '신호 연결됨'
        : `${Math.round(d)} m`;
    });
    const sky = state.expedition.sky,
      journeyObjective = sky.objective(state.expedition.repaired.size),
      navigation = !sky.inSky && !sky.ride ? state.expedition.navigation : null,
      destination = navigation ? navigationPoint(navigation, STATIONS, WORLD_PLACES) : null,
      objective = destination
        ? {
            ...journeyObjective,
            title:
              navigation!.kind !== 'place'
                ? destination.name
                : state.expedition.discoveries.has(WORLD_PLACES[navigation!.index].id)
                  ? destination.name
                  : '새로운 장소 찾아가기',
            detail:
              navigation!.kind === 'region'
                ? navigation!.arrived
                  ? '지역 입구에 도착했습니다 · 주차하고 주변을 자유롭게 탐험하세요'
                  : '도로를 따라 지역 입구로 향하세요 · 계단 앞에서는 내려서 이동'
                : navigation!.kind === 'station'
                  ? '큰길과 갈림길 표식을 따라 관측소로 향하세요'
                  : '지도에 표시된 갈림길 너머를 자유롭게 탐험하세요',
            point: {
              x: destination.x,
              z: destination.z,
              y: groundSurface(destination.x, destination.z),
            },
          }
        : journeyObjective;
    document.querySelector('.quest h2')!.textContent = sky.complete
      ? '하늘과 땅의 신호가 연결됐습니다'
      : navigation
        ? navigation.arrived
          ? '목적지에 도착했어요'
          : '나만의 길로 탐험하기'
        : '구름 위의 신호를 찾아서';
    document.querySelector('.quest p')!.textContent = objective.detail;
    $('target-name').textContent = objective.title;
    $('target-distance').textContent = sky.ride
      ? `상승 기류 이동 ${Math.floor((sky.ride.elapsed / 8) * 100)}%`
      : navigation?.arrived
        ? '도착 · 주변을 자유롭게 탐험하세요'
        : `목표까지 ${Math.round(Math.hypot(state.position.x - objective.point.x, state.position.z - objective.point.z))} m`;
    $('quest-count').textContent = `${sky.complete ? 7 : objective.step} / 7`;
    $('quest-progress').style.width = `${((sky.complete ? 7 : objective.step) / 7) * 100}%`;
    if (!sky.inSky) {
      const place = WORLD_PLACES.find(
        (p) =>
          state.expedition.discoveries.has(p.id) &&
          Math.hypot(state.position.x - p.x, state.position.z - p.z) < p.radius,
      );
      if (place) $('biome').textContent = place.name;
    }
    if (sky.inSky)
      $('biome').textContent =
        '천공 군도 · ' +
        ISLANDS.reduce((closest, island) =>
          Math.hypot(state.position.x - island.x, state.position.z - island.z) <
          Math.hypot(state.position.x - closest.x, state.position.z - closest.z)
            ? island
            : closest,
        ).name;
    const marker = $('journey-marker'),
      point = new THREE.Vector3(
        objective.point.x,
        objective.point.y + 10,
        objective.point.z,
      ).project(this.camera);
    marker.hidden =
      point.z > 1 ||
      point.z < -1 ||
      Math.abs(point.x) > 0.93 ||
      point.y > 0.85 ||
      point.y < -0.6 ||
      sky.complete ||
      !!navigation?.arrived;
    marker.style.left = `${(point.x * 0.5 + 0.5) * innerWidth}px`;
    marker.style.top = `${(-point.y * 0.5 + 0.5) * innerHeight}px`;
    marker.querySelector('small')!.textContent = objective.title;
    for (let i = 0; i < 3; i++) if (sky.inSky) $(`marker-${i}`).hidden = true;
    let skyPrompt = '';
    if (Math.hypot(state.position.x - LAUNCH.x, state.position.z - LAUNCH.z) < 10)
      skyPrompt = sky.built
        ? sky.inSky
          ? '상승기 · 지상으로 내려가기'
          : '상승기 · 하늘로 올라가기'
        : '상승기 제작 · 관측소 1개 / 목재 2 / 돌 1 / 수정 1';
    if (sky.inSky) {
      const rune = RUNES.find(
        (r) =>
          Math.hypot(state.position.x - r.x, state.position.z - r.z) < 7 &&
          Math.abs(state.position.y - r.y) < 5,
      );
      if (rune) skyPrompt = `바람 룬 ${rune.index + 1} 활성화`;
      if (Math.hypot(state.position.x - SUMMIT.x, state.position.z - SUMMIT.z) < 9)
        skyPrompt = '천공의 성소 점화';
    }
    if (sky.ride) skyPrompt = '상승 기류 이동 중…';
    if (skyPrompt && !state.paused && state.nearby?.type !== 'drop') {
      $('interaction').hidden = false;
      $('interaction-text').textContent = skyPrompt;
    }
    const vehicle = state.expedition.vehicle;
    const canBoard = !sky.inSky && !sky.ride && vehicle.nearby(state.position);
    $('vehicle-hud').hidden = !vehicle.riding || state.paused || !!state.vehicleTransition;
    const hints = $('control-hints');
    if (hints.dataset.driving !== String(vehicle.riding)) {
      hints.dataset.driving = String(vehicle.riding);
      hints.innerHTML = vehicle.riding
        ? '<span><kbd>W S</kbd> 가속 · 후진</span><span><kbd>A D</kbd> 조향</span><span><kbd>SPACE</kbd> 브레이크</span><span><kbd>F</kbd> 내리기</span><span><kbd>M</kbd> 지역 지도</span><span><kbd>ESC</kbd> 일시 정지</span>'
        : this.walkingHints;
    }
    $('vehicle-speed').textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
    $('vehicle-mode').textContent = vehicle.blocked
      ? '진입 불가 · 후진해서 다른 길로'
      : vehicle.speed < -0.2
        ? 'R · 후진'
        : Math.abs(vehicle.speed) < 0.2
          ? 'P · 정차'
          : 'D · 주행';
    $('vehicle-prompt').hidden =
      state.paused || state.vehicleTransition === true || (!vehicle.riding && !canBoard);
    $('vehicle-prompt-text').textContent = vehicle.riding
      ? Math.abs(vehicle.speed) > 1.2
        ? 'SPACE로 멈춘 뒤 F로 내리기'
        : '탐험 버기에서 내리기'
      : '탐험 버기 타기';
    $('touch-vehicle').hidden = !!state.vehicleTransition || (!vehicle.riding && !canBoard);
    $('touch-vehicle').textContent = vehicle.riding ? '내리기' : '타기';
    $('touch-jump').textContent = vehicle.riding ? '정지' : '↥';
    $('touch-jump').dataset.driving = String(vehicle.riding);
    $('touch-jump').setAttribute('aria-label', vehicle.riding ? '브레이크' : '점프');
    if (vehicle.riding || canBoard) $('interaction').hidden = true;
    this.map.draw($<HTMLCanvasElement>('minimap'), false, state.position, state.yaw);
  }
  showToast(message: string) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3300);
  }
  start(resumed: boolean) {
    $('game').classList.add('started');
    $('intro').inert = true;
    $('world').focus();
    this.showToast(
      resumed
        ? '다시 오셨군요. 지난 탐험에서 이어갑니다.'
        : '첫 번째 여정 · 주변의 자원을 E 키로 모아보세요.',
    );
  }
  togglePhoto() {
    const active = $('game').classList.toggle('photo-mode');
    $('photo-label').hidden = !active;
  }
  setSound(enabled: boolean) {
    $('sound-button').innerHTML = icon(enabled ? 'sound' : 'mute');
    $('sound-button').setAttribute('aria-label', enabled ? '자연 소리 끄기' : '자연 소리 켜기');
  }
  dispose() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
