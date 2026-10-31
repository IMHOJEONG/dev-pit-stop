import { WORLD_PLACES } from '../world/places';
import { CharacterPanel } from './character-panel';
import type { Appearance } from '../player/appearance';
import { $ } from './dom';
import { icon } from './icons';
import { STATIONS } from '../world/landmarks';
import { HARVEST_RULES } from '../resources/catalog';
import type { ExpeditionState } from '../expedition/expedition-state';
export type Panel = 'map' | 'help' | 'settings' | 'complete' | 'character';
interface PanelState {
  expedition: ExpeditionState;
  started: boolean;
  highQuality: boolean;
  audioEnabled: boolean;
}
interface PanelActions {
  appearance(value: Appearance): void;
  changed(): void;
  resume(): void;
  track(index: number): void;
  trackPlace(index: number): void;
  clearTrack(): void;
  drawMap(canvas: HTMLCanvasElement): void;
  quality(high: boolean): void;
  toggleAudio(): Promise<boolean>;
  save(): void;
  returnCamp(): void;
  reset(): void;
}
const titles = {
  character: '나의 탐험가',
  map: '당신의 다음 발걸음',
  help: '가볍게 떠나는 방법',
  settings: '잠시 쉬어가세요',
  complete: '섬이 다시 깨어났습니다',
};
const eyebrows = {
  character: 'MAKE YOURSELF AT HOME',
  map: 'EXPEDITION MAP · WINDWARD ISLAND',
  help: 'A SMALL FIELD GUIDE',
  settings: 'EXPEDITION PAUSED',
  complete: 'EXPEDITION COMPLETE',
};
const helpRows = [
  ['이동', 'W A S D / 방향키'],
  ['달리기', 'SHIFT'],
  ['점프', 'SPACE'],
  ['자원 채집 · 관측소 복구', 'E'],
  ['시점 회전', '마우스 드래그'],
  ['확대 · 축소', '마우스 휠'],
  ['탐험 지도', 'M'],
  ['풍경 감상 · UI 숨기기', 'H'],
  ['일시 정지 · 돌아가기', 'ESC'],
];
function harvestGuide() {
  return `나무·돌·수정은 각각 E 키로 ${HARVEST_RULES.wood.hits}번 타격하세요. 나무에는 도끼, 돌·수정에는 곡괭이를 사용합니다. 연출이 끝나면 자원이 배낭에 담깁니다.`;
}
export class Panels {
  active: Panel | null = null;
  private character?: CharacterPanel;
  private abort = new AbortController();
  constructor(private actions: PanelActions) {
    $('close-modal').addEventListener('click', () => this.close(), { signal: this.abort.signal });
    $('modal').addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal: this.abort.signal },
    );
  }
  open(panel: Panel, state: PanelState) {
    this.character?.dispose();
    this.character = undefined;
    this.active = panel;
    $('modal').dataset.panel = panel;
    this.actions.changed();
    $('modal-title').textContent = titles[panel];
    $('modal-eyebrow').textContent = eyebrows[panel];
    const content = $('modal-content');
    const renderers = {
      character: () => {
        this.character = new CharacterPanel(
          content,
          state.expedition.appearance,
          (value) => {
            this.actions.appearance(value);
            this.close();
          },
          () => this.close(),
        );
      },
      map: () => this.renderMap(content, state.expedition),
      help: () => this.renderHelp(content),
      settings: () => this.renderSettings(content, state),
      complete: () => this.renderComplete(content, state.expedition),
    };
    renderers[panel]();
    const modal = $<HTMLDialogElement>('modal');
    if (!modal.open) modal.showModal();
  }
  close() {
    this.character?.dispose();
    this.character = undefined;
    $<HTMLDialogElement>('modal').close();
    this.active = null;
    $('world').focus();
    this.actions.changed();
  }
  private renderMap(content: HTMLElement, state: ExpeditionState) {
    content.innerHTML = `<div class="map-layout"><div><canvas id="large-map" class="large-map" width="600" height="600" aria-label="섬 전체 지도, 관측소 세 곳과 현재 위치"></canvas><div class="map-legend">◆ 관측소 &nbsp; ▲ 현재 위치 &nbsp; ● 베이스캠프<br>━ 큰길 &nbsp; ┄ 오솔길 &nbsp; 파란길: 다리 &nbsp; ? 발견 장소<br>진한 영역은 방문한 곳입니다. 탐험 ${state.exploredPercent()}% · 발견 ${state.discoveries.size}/${WORLD_PLACES.length} · 이동 ${(state.distance / 1000).toFixed(2)} km</div></div><aside>${STATIONS.map((s, i) => `<div class="map-station"><span>${s.number}</span><div><strong>${s.name}</strong><small>${s.en}</small><button data-track="${i}">${state.repaired.has(i) ? '✓ 복구 완료' : state.target === i ? '현재 목표' : '목표로 지정 →'}</button></div></div>`).join('')}<details class="repair-cost"><summary>복구 재료 · 하늘 여정</summary>관측소 복구 → 상승기 제작 → 하늘섬 룬 3개 → 성소 점화<br>↑ 하늘 상승장: 캠프 북쪽 (-35, 125)<br><strong>관측소 한 곳을 복구하려면</strong>목재 3 &nbsp; 돌 2 &nbsp; 수정 1<br>${harvestGuide()}</details><div class="discovery-list"><strong>섬의 작은 발견 · ${state.discoveries.size}/${WORLD_PLACES.length}</strong>${WORLD_PLACES.map((p, i) => `<button data-place="${i}" class="discovery-place"><span>${state.discoveries.has(p.id) ? '◇ ' + p.name : '? 미발견 장소'}</span><small>${state.discoveries.has(p.id) ? p.description : '이 근처 탐험하기 →'}</small></button>`).join('')}<button id="clear-track" class="secondary-button">여정 목표로 돌아가기</button></div></aside></div>`;
    this.actions.drawMap($<HTMLCanvasElement>('large-map'));
    content.querySelectorAll<HTMLButtonElement>('[data-place]').forEach(
      (button) =>
        (button.onclick = () => {
          this.actions.trackPlace(Number(button.dataset.place));
          this.close();
        }),
    );
    $('clear-track').onclick = () => {
      this.actions.clearTrack();
      this.close();
    };
    content.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((button) => {
      button.onclick = () => {
        this.actions.track(Number(button.dataset.track));
        this.close();
      };
    });
  }
  private renderHelp(content: HTMLElement) {
    content.innerHTML = `<div class="help-grid">${helpRows.map(([name, key]) => `<div class="help-row"><span>${name}</span><kbd>${key}</kbd></div>`).join('')}</div><div class="guide-note">관측소 한 곳 복구 → 상승기 제작(목재 2·돌 1·수정 1) → 상승장 E로 하늘 이동 → 세 섬의 룬을 순서대로 활성화 → 마지막 성소 점화. 끊어진 다리는 Space로 점프하세요. 추락하면 마지막 룬의 섬으로 돌아옵니다. ${harvestGuide()} 황금빛 신호를 따라 관측소에 도착하면 E 키로 복구할 수 있어요.<br>진행 상황은 이 브라우저에 자동 저장됩니다. 터치 화면에서는 방향 버튼과 화면 드래그로 조작할 수 있어요.</div>`;
  }
  private renderSettings(content: HTMLElement, state: PanelState) {
    content.innerHTML = `<div class="setting-row"><div>나의 탐험가<small>외형을 고르고 움직임을 미리 확인하세요.</small></div><button id="edit-character" class="secondary-button">캐릭터 바꾸기</button></div><div class="setting-row"><div>그래픽 품질<small>기기에 맞게 해상도와 그림자를 조절하세요.</small></div><select id="quality" aria-label="그래픽 품질"><option value="high">높음 · 부드러운 그림자</option><option value="low">가벼움 · 성능 우선</option></select></div><div class="setting-row"><div>시간의 흐름<small>1배 기준, 하루는 약 33분입니다.</small></div><select id="time-rate" aria-label="시간의 흐름"><option value="0">시간 멈추기</option><option value="1">1배 · 느긋한 하루</option><option value="6">6배 · 빠른 일주기</option></select></div><div class="setting-row"><div>자연의 소리<small>바람과 낮은 음의 앰비언스</small></div><button id="modal-sound" class="secondary-button">${state.audioEnabled ? '켜짐' : '꺼짐'}</button></div><div class="settings-footer"><button id="resume" class="primary-button">${state.started ? '계속 탐험하기' : '탐험 시작하기'} ${icon('arrow')}</button><button id="save-now" class="secondary-button">저장하기</button><button id="return-camp" class="secondary-button">캠프로 돌아가기</button><button id="reset" class="danger-button">새 탐험</button></div><div class="guide-note">시드 2704 · 약 1.2 × 1.2 km의 절차 생성 월드<br>자동 저장은 현재 브라우저에 보관됩니다. 설정 메뉴를 열면 이동과 게임 시간이 잠시 멈춥니다.<br><a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan" target="_blank" rel="noopener noreferrer">보행 모션: © Cesium</a> · <a href="${import.meta.env.BASE_URL}licenses/cesium-human-motion.txt" target="_blank" rel="noopener noreferrer">CC BY 4.0 · 캐릭터에 맞게 변환</a></div>`;
    $('edit-character').onclick = () => this.open('character', state);
    const quality = $<HTMLSelectElement>('quality');
    quality.value = state.highQuality ? 'high' : 'low';
    quality.onchange = () => this.actions.quality(quality.value === 'high');
    const rate = $<HTMLSelectElement>('time-rate');
    rate.value = String(state.expedition.timeRate);
    rate.onchange = () => {
      state.expedition.timeRate = Number(rate.value);
    };
    $('modal-sound').onclick = async () => {
      const enabled = await this.actions.toggleAudio();
      if (this.active === 'settings') $('modal-sound').textContent = enabled ? '켜짐' : '꺼짐';
    };
    $('resume').onclick = () => {
      this.close();
      this.actions.resume();
    };
    $('save-now').onclick = () => this.actions.save();
    $('return-camp').onclick = () => {
      this.actions.returnCamp();
      this.close();
    };
    $('reset').onclick = () => {
      $('reset').textContent = '진행을 지우고 시작할까요?';
      $('reset').onclick = () => {
        this.actions.reset();
        this.close();
      };
    };
  }
  private renderComplete(content: HTMLElement, state: ExpeditionState) {
    content.innerHTML = `<div class="completion">${icon('mountain')}<h3>The island remembers.</h3><p>세 바람 룬이 천공의 성소와 연결되었습니다.<br>이제 목적지 없이, 당신만의 길을 걸어보세요.</p><div class="stats"><div><strong>3 / 3</strong><small>바람 룬 활성화</small></div><div><strong>${state.exploredPercent()}%</strong><small>섬 탐험</small></div><div><strong>${(state.distance / 1000).toFixed(2)} km</strong><small>걸어온 길</small></div></div><button id="keep-going" class="primary-button">계속 탐험하기 ${icon('arrow')}</button></div>`;
    $('keep-going').onclick = () => this.close();
  }
  dispose() {
    this.character?.dispose();
    this.abort.abort();
    $<HTMLDialogElement>('modal').close();
  }
}
