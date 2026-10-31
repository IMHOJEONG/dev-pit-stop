import { TravelMapPanel } from './travel-map-panel';
import type { MapOptions } from '../expedition/map-view';
import { CharacterPanel } from './character-panel';
import { InventoryPanel } from './inventory-panel';
import type { ItemId } from '../items/catalog';
import type { ItemUseResult } from '../items/item-system';
import type { Appearance } from '../player/appearance';
import { $ } from './dom';
import { icon } from './icons';
import { HARVEST_RULES } from '../resources/catalog';
import type { ExpeditionState } from '../expedition/expedition-state';
export type Panel = 'map' | 'help' | 'settings' | 'complete' | 'character' | 'bag';
interface PanelState {
  expedition: ExpeditionState;
  started: boolean;
  highQuality: boolean;
  audioEnabled: boolean;
  stamina: number;
}
interface PanelActions {
  appearance(value: Appearance): void;
  changed(): void;
  resume(): void;
  track(index: number): void;
  trackPlace(index: number): void;
  trackRegion(index: number): void;
  recoverVehicle(): void;
  position(): { x: number; z: number };
  clearTrack(): void;
  drawMap(canvas: HTMLCanvasElement, options?: MapOptions): void;
  quality(high: boolean): void;
  toggleAudio(): Promise<boolean>;
  save(): void;
  returnCamp(): void;
  reset(): void;
  useItem(item: ItemId): ItemUseResult;
}
const titles = {
  bag: '탐험가의 배낭',
  character: '나의 탐험가',
  map: '길 너머의 세계',
  help: '가볍게 떠나는 방법',
  settings: '잠시 쉬어가세요',
  complete: '섬이 다시 깨어났습니다',
};
const eyebrows = {
  bag: 'THE LITTLE THINGS YOU FIND',
  character: 'MAKE YOURSELF AT HOME',
  map: 'EXPEDITION MAP · WINDWARD ISLAND',
  help: 'A SMALL FIELD GUIDE',
  settings: 'EXPEDITION PAUSED',
  complete: 'EXPEDITION COMPLETE',
};
const helpRows = [
  ['이동', 'W A S D / 방향키'],
  ['달리기', 'SHIFT'],
  ['버기 타기 · 내리기', 'F'],
  ['운전: 가속·후진 / 조향 / 브레이크', 'W S / A D / SPACE'],
  ['점프', 'SPACE'],
  ['자원 채집 · 관측소 복구', 'E'],
  ['시점 회전', '마우스 드래그'],
  ['확대 · 축소', '마우스 휠'],
  ['탐험 지도', 'M'],
  ['배낭 · 아이템 사용', 'B'],
  ['풍경 감상 · UI 숨기기', 'H'],
  ['일시 정지 · 돌아가기', 'ESC'],
];
function harvestGuide() {
  return `나무·돌·수정은 각각 E 키로 ${HARVEST_RULES.wood.hits}번 타격하세요. 연출이 끝나면 재료와 아이템이 바닥에 떨어집니다. 가까이에서 E로 줍고, B로 배낭을 열어 산열매를 먹거나 발견한 아이템을 확인하세요.`;
}
export class Panels {
  active: Panel | null = null;
  private character?: CharacterPanel;
  private bag?: InventoryPanel;
  private travelMap?: TravelMapPanel;
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
    this.travelMap?.dispose();
    this.travelMap = undefined;
    this.character?.dispose();
    this.character = undefined;
    this.bag?.dispose();
    this.bag = undefined;
    this.active = panel;
    $('modal').dataset.panel = panel;
    this.actions.changed();
    $('modal-title').textContent = titles[panel];
    $('modal-eyebrow').textContent = eyebrows[panel];
    const content = $('modal-content');
    const renderers = {
      bag: () => {
        this.bag = new InventoryPanel(content, state.expedition.items, state.stamina, (item) =>
          this.actions.useItem(item),
        );
      },
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
    this.bag?.dispose();
    this.bag = undefined;
    this.travelMap?.dispose();
    this.travelMap = undefined;
    this.character?.dispose();
    this.character = undefined;
    $<HTMLDialogElement>('modal').close();
    this.active = null;
    $('world').focus();
    this.actions.changed();
  }
  private renderMap(content: HTMLElement, state: ExpeditionState) {
    this.travelMap = new TravelMapPanel(content, state, {
      ...this.actions,
      close: () => this.close(),
    });
  }

  private renderHelp(content: HTMLElement) {
    content.innerHTML = `<div class="help-grid">${helpRows.map(([name, key]) => `<div class="help-row"><span>${name}</span><kbd>${key}</kbd></div>`).join('')}</div><div class="guide-note">캠프 옆의 탐험 버기에 F로 타세요. W/S로 가속·후진하고 A/D로 조향하며 Space로 멈춥니다. 정차한 뒤 F로 내려 상호작용하세요. M 지도에서 다섯 지역과 차량 위치를 볼 수 있습니다.<br>관측소 한 곳 복구 → 상승기 제작(목재 2·돌 1·수정 1) → 상승장 E로 하늘 이동 → 세 섬의 룬을 순서대로 활성화 → 마지막 성소 점화. 끊어진 다리는 Space로 점프하세요. 추락하면 마지막 룬의 섬으로 돌아옵니다. ${harvestGuide()} 황금빛 신호를 따라 관측소에 도착하면 E 키로 복구할 수 있어요.<br>진행 상황은 이 브라우저에 자동 저장됩니다. 터치 화면에서는 방향 버튼과 화면 드래그로 조작할 수 있어요.</div>`;
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
    this.bag?.dispose();
    this.travelMap?.dispose();
    this.travelMap = undefined;
    this.character?.dispose();
    this.abort.abort();
    $<HTMLDialogElement>('modal').close();
  }
}
