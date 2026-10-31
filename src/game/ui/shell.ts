import { STATIONS } from '../world/landmarks';
import { icon } from './icons';
import { RESOURCE_KINDS, RESOURCE_NAMES } from '../resources/catalog';
export function createUI() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main id="game" aria-label="Wild Atlas 3D 탐험 게임">
      <canvas id="world" tabindex="0" aria-label="3D 월드. WASD 이동, 마우스 드래그 시점, E 상호작용"></canvas>
      <div class="vignette"></div>
      <div id="loading"><span class="loading-symbol">${icon('mountain')}</span><strong>섬이 깨어나고 있어요</strong><span>지형 · 숲 · 작은 모험을 준비하는 중</span></div>
      <header class="topbar">
        <div class="brand">${icon('mountain')}<span>WILD ATLAS<small>AN OPEN WORLD EXPEDITION</small></span><span class="alpha">PREVIEW 0.1</span></div>
        <div class="compass"><div class="compass-needle"></div><span id="bearing">N</span><div class="compass-ruler">W <i>· · · ·</i> N <i>· · · ·</i> E</div></div>
        <div class="top-actions"><div class="weather">${icon('sun')}<span id="clock">09:40</span><span class="weather-divider"></span><span>맑음</span></div><button id="sound-button" class="icon-button" title="자연 소리 켜기" aria-label="자연 소리 켜기">${icon('mute')}</button><button id="character-button" class="icon-button" title="캐릭터 바꾸기" aria-label="캐릭터 바꾸기">${icon('character')}</button><button id="help-button" class="icon-button" title="조작 방법" aria-label="조작 방법">${icon('help')}</button><button id="settings-button" class="icon-button" title="설정 및 일시 정지" aria-label="설정 및 일시 정지">${icon('settings')}</button></div>
      </header>
      <section class="quest glass" aria-label="현재 탐험 목표"><div class="eyebrow"><span class="gold-dot"></span> GROUND TO SKY <span id="quest-count">0 / 7</span></div><h2>섬의 신호를 되살리세요</h2><p>잠들어 있는 관측소를 찾아 복구하세요.<br>모든 길은, 당신의 발걸음에서 시작됩니다.</p><div class="quest-step">${icon('flag')}<div><strong id="target-name">바람의 언덕</strong><span id="target-distance">관측소까지 137 m</span></div><span class="step-arrow">↗</span></div><div class="quest-progress"><i id="quest-progress"></i></div><button id="journal-button" class="text-button">탐험 지도 펼치기 <kbd>M</kbd></button></section>
      <div id="world-markers" aria-hidden="true">${STATIONS.map((s, i) => `<div class="world-marker" id="marker-${i}"><span>${icon('flag')}</span><small>${s.name}</small><b></b></div>`).join('')}</div>
      <section id="intro" class="intro"><div class="eyebrow">CHAPTER 01 <span>—</span> THE UNCHARTED ISLAND</div><h1>A little further,<br><em>into the wild.</em></h1><p>섬의 신호를 되살리고, 구름 위로 향하는 길.<br>나만의 속도로 이 섬을 탐험해 보세요.</p><button id="play-button" class="primary-button">탐험 시작하기 ${icon('arrow')}</button><button id="intro-character" class="text-button intro-character">${icon('character')} 캐릭터 선택하기</button><span class="intro-note">설치 없이, 브라우저에서 시작하는 작은 모험</span></section>
      <div id="interaction" hidden><kbd>E</kbd><span id="interaction-text">목재 채집</span><span class="interaction-hint">가까이에서 상호작용</span></div>
      <section class="location"><div class="eyebrow">${icon('compass')} <span id="location-coordinates">00° E · 195° S</span></div><h2 id="biome">바람 초원</h2><div class="location-sub">WINDWARD ISLAND <span>·</span> <span id="altitude">해발 20 m</span></div><div class="stamina-row"><span>STAMINA</span><div class="stamina-track"><i id="stamina-bar"></i></div><b id="stamina-value">100</b></div></section>
      <section class="inventory" aria-label="수집한 자원"><div class="inventory-slots">${RESOURCE_KINDS.map((k, i) => `<div class="inventory-slot" title="${RESOURCE_NAMES[k]}"><span class="slot-number">0${i + 1}</span>${icon(k)}<b id="count-${k}">0</b><small>${RESOURCE_NAMES[k]}</small></div>`).join('')}<button id="map-button" class="inventory-slot map-slot" title="탐험 지도 열기" aria-label="탐험 지도 열기"><span class="slot-number">M</span>${icon('map')}<small>지도</small></button></div><div class="inventory-caption">작은 발견을 모아, 더 먼 곳으로</div></section>
      <section class="minimap-panel"><button id="minimap-button" aria-label="전체 지도 열기"><canvas id="minimap" width="240" height="200"></canvas><span class="map-north">N <i>↑</i></span><span class="map-expand">${icon('map')}</span><span class="map-label">WINDWARD ISLAND</span></button><div class="map-footer"><span><i class="live-dot"></i> <span id="exploration">탐험 0%</span></span><span>SEED 2704</span></div></section>
      <footer class="control-hints"><span><kbd>W A S D</kbd> 이동</span><span><kbd>⇧</kbd> 달리기</span><span><kbd>SPACE</kbd> 점프</span><span><span class="mouse-icon"></span> 드래그하여 둘러보기</span><span><kbd>ESC</kbd> 일시 정지</span></footer>
      <div id="toast" role="status" aria-live="polite"></div>
      <div class="mobile-controls"><div class="direction-pad"><button data-key="KeyW" aria-label="앞으로">↑</button><button data-key="KeyA" aria-label="왼쪽">←</button><button data-key="KeyS" aria-label="뒤로">↓</button><button data-key="KeyD" aria-label="오른쪽">→</button></div><div><button id="touch-jump" aria-label="점프">↥</button><button id="touch-interact" aria-label="상호작용">E</button></div></div>
      <dialog id="modal" aria-labelledby="modal-title"><div class="modal-header"><div><span class="eyebrow" id="modal-eyebrow">FIELD GUIDE</span><h2 id="modal-title">탐험 가이드</h2></div><button id="close-modal" class="icon-button" aria-label="닫기">${icon('close')}</button></div><div id="modal-content"></div></dialog>
      <div id="photo-label" hidden>WILD ATLAS <span>A moment in the wild.</span><small>H 키로 탐험 화면으로 돌아가기</small></div>
    </main>`;
}
