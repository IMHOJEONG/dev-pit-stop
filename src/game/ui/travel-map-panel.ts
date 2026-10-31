import { WORLD_REGIONS } from '../world/regions';
import { WORLD_SIZE } from '../world/terrain';
import { STATIONS } from '../world/landmarks';
import { WORLD_PLACES } from '../world/places';
import type { ExpeditionState } from '../expedition/expedition-state';
import type { MapOptions } from '../expedition/map-view';
interface MapActions {
  track(index: number): void;
  trackPlace(index: number): void;
  trackRegion(index: number): void;
  clearTrack(): void;
  recoverVehicle(): void;
  drawMap(canvas: HTMLCanvasElement, options?: MapOptions): void;
  position(): { x: number; z: number };
  close(): void;
}
export class TravelMapPanel {
  private options: MapOptions = { layer: 'ground' };
  private abort = new AbortController();
  constructor(
    private root: HTMLElement,
    private state: ExpeditionState,
    private actions: MapActions,
  ) {
    root.innerHTML = `<div class="atlas-toolbar"><div class="atlas-layers"><button data-layer="ground" aria-pressed="true">섬 · 5개 지역</button><button data-layer="sky" aria-pressed="false">천공 군도</button></div><button id="atlas-track-region" class="primary-button" hidden>지역 입구로 안내 →</button><div class="atlas-zoom"><button data-view="out" aria-label="지도 축소">−</button><button data-view="in" aria-label="지도 확대">+</button><button data-view="all">전체 보기</button></div></div><div class="atlas-layout"><div class="atlas-chart"><div class="atlas-map-wrap"><canvas id="large-map" class="large-map" width="1000" height="520" aria-label="섬의 다섯 지역과 도로, 다리, 관측소, 현재 위치, 차량 위치 지도"></canvas><span class="atlas-north">N ↑</span><span id="atlas-scale"></span></div><div class="map-legend">▲ 나의 위치 &nbsp; ▣ 탐험 버기 &nbsp; ◆ 관측소 &nbsp; ? 미발견 장소<br>━ 도로 · ┄ 오솔길 · 파란길: 다리 · 진한 칸: 방문한 곳<br>탐험 ${state.exploredPercent()}% · 발견 ${state.discoveries.size}/${WORLD_PLACES.length} · 이동 ${(state.distance / 1000).toFixed(2)} km</div><section id="atlas-detail" class="atlas-detail" aria-live="polite"></section></div><aside class="atlas-destinations"><div class="atlas-section-label">다른 지역 둘러보기</div>${WORLD_REGIONS.map((r, i) => `<button class="atlas-region" data-region="${i}" aria-pressed="false"><i style="background:${r.color}"></i><span><strong>${r.name}</strong><small>${r.en}</small></span><b>↗</b></button>`).join('')}<div class="atlas-vehicle"><strong>탐험 버기</strong><p>W/S 가속·후진 · A/D 조향<br>SPACE 브레이크 · F 타기/내리기</p><button class="secondary-button" data-view="vehicle">차량 위치 보기</button><button class="text-button" id="recover-vehicle" ${state.vehicle.riding ? 'disabled' : ''}>캠프로 차량 회수</button></div><details class="atlas-stations"><summary>관측소 · 발견 장소</summary>${STATIONS.map((s, i) => `<button data-track="${i}">${state.repaired.has(i) ? '✓' : '◆'} ${s.name} →</button>`).join('')}${WORLD_PLACES.map((p, i) => `<button data-place="${i}">${state.discoveries.has(p.id) ? '◇ ' + p.name : '? 미발견 장소 ' + (i + 1)} →</button>`).join('')}</details><button id="clear-track" class="secondary-button">여정 목표로 돌아가기</button></aside></div>`;
    root.addEventListener(
      'click',
      (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button) return;
        if (button.dataset.layer) {
          this.options = { layer: button.dataset.layer as 'ground' | 'sky' };
          this.render();
        }
        if (button.dataset.region !== undefined) {
          const index = Number(button.dataset.region),
            r = WORLD_REGIONS[index];
          this.options = { layer: 'ground', focus: r, range: r.range, region: index };
          this.render();
          if (window.innerWidth <= 760) this.root.closest('dialog')!.scrollTop = 0;
        }
        if (button.dataset.view) {
          if (button.dataset.view === 'all') this.options = { layer: this.options.layer };
          if (button.dataset.view === 'in')
            this.options.range = Math.max(220, (this.options.range ?? WORLD_SIZE) * 0.7);
          if (button.dataset.view === 'out')
            this.options.range = Math.min(WORLD_SIZE, (this.options.range ?? WORLD_SIZE) / 0.7);
          if (button.dataset.view === 'vehicle')
            this.options = { layer: 'ground', focus: state.vehicle.position, range: 300 };
          this.render();
        }
        if (
          button.id === 'atlas-track-region' &&
          this.options.region !== undefined &&
          !state.sky.inSky
        ) {
          actions.trackRegion(this.options.region);
          actions.close();
        }
        if (button.dataset.track !== undefined) {
          actions.track(Number(button.dataset.track));
          actions.close();
        }
        if (button.dataset.place !== undefined) {
          actions.trackPlace(Number(button.dataset.place));
          actions.close();
        }
        if (button.id === 'clear-track') {
          actions.clearTrack();
          actions.close();
        }
        if (button.id === 'recover-vehicle' && !state.vehicle.riding) {
          actions.recoverVehicle();
          this.options = { layer: 'ground', focus: state.vehicle.position, range: 300 };
          this.render();
        }
      },
      { signal: this.abort.signal },
    );
    window.addEventListener('resize', () => this.render(), { signal: this.abort.signal });
    this.render();
  }
  private render() {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#large-map')!;
    const mobile = window.innerWidth <= 760;
    canvas.width = mobile ? 600 : 1000;
    canvas.height = mobile ? 600 : 520;
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-layer]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.layer === this.options.layer)),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-region]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.region) === this.options.region)),
      );
    const sky = this.options.layer === 'sky',
      region = this.options.region === undefined ? null : WORLD_REGIONS[this.options.region],
      position = this.actions.position();
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-view="in"],[data-view="out"]')
      .forEach((b) => (b.disabled = sky));
    this.root.querySelector('#atlas-scale')!.textContent = sky
      ? '천공 군도 · 상공 150m'
      : `${Math.round(((this.options.range ?? WORLD_SIZE) * canvas.width) / canvas.height)} m × ${Math.round(this.options.range ?? WORLD_SIZE)} m`;
    this.root
      .querySelector('#large-map')!
      .setAttribute(
        'aria-label',
        sky
          ? '천공 군도의 섬과 연결 경로 지도'
          : region
            ? `${region.name}의 도로와 주변 명소 지도`
            : this.options.focus
              ? '탐험 버기 주변과 현재 위치 지도'
              : '섬 전체 다섯 지역과 도로, 차량 위치 지도',
      );
    const track = this.root.querySelector<HTMLButtonElement>('#atlas-track-region')!;
    track.hidden = sky || !region;
    track.disabled = this.state.sky.inSky;
    track.textContent = this.state.sky.inSky
      ? '지상 복귀 후 안내 가능'
      : `${region?.name ?? '지역'} 입구로 안내 →`;
    this.root.querySelector('#atlas-detail')!.innerHTML = sky
      ? `<small>ABOVE THE CLOUDS</small><h3>천공 군도</h3><p>관측소 한 곳 복구 → 상승기 제작 → 캠프 북쪽 상승장에서 E로 출발합니다. 섬 사이의 끊어진 길은 걸어서 점프하세요.</p><b>${this.state.sky.built ? '상승기 이용 가능' : '상승기 제작 전 · 지도로 미리 둘러볼 수 있어요'}</b>`
      : region
        ? `<small>${region.en} · 입구까지 ${Math.round(Math.hypot(region.x - position.x, region.z - position.z))} m</small><h3>${region.name}</h3><p>${region.description}</p><p class="atlas-route">${region.route}</p>`
        : `<small>ONE ISLAND, MANY ROADS</small><h3>${this.options.focus ? '탐험 버기가 있는 곳' : '바람의 섬 · 다섯 지역'}</h3><p>오른쪽에서 지역을 골라 가까이 살펴보고, 입구를 목적지로 지정하세요. 도로와 다리를 따라 버기로 이동하고 계단과 전망대는 걸어서 탐험하세요.</p>`;
    this.actions.drawMap(this.root.querySelector<HTMLCanvasElement>('#large-map')!, this.options);
  }
  dispose() {
    this.abort.abort();
  }
}
