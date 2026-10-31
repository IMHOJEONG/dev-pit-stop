import {
  BODY_TYPES,
  SKIN_TONES,
  HAIR_STYLES,
  OUTFITS,
  HATS,
  CHARACTER_PRESETS,
} from '../player/appearance';
import type { Appearance } from '../player/appearance';
import { CharacterPreview } from './character-preview';
import type { PreviewMotion } from './character-preview';
export class CharacterPanel {
  private preview?: CharacterPreview;
  constructor(
    content: HTMLElement,
    initial: Appearance,
    apply: (value: Appearance) => void,
    cancel: () => void,
  ) {
    let draft = { ...initial };
    const fields = [
      ['body', '체형', BODY_TYPES],
      ['skin', '피부 톤', SKIN_TONES],
      ['hair', '머리 모양', HAIR_STYLES],
      ['outfit', '탐험복', OUTFITS],
      ['hat', '모자', HATS],
    ] as const;
    content.innerHTML = `<p class="character-intro">나를 닮은 탐험가로 떠나세요. 외형과 움직임을 둘러보고 선택할 수 있어요.</p>
      <div class="character-layout"><section class="character-view" aria-label="캐릭터 미리 보기">
      <div class="character-stage"><span class="character-stage-label">YOUR EXPLORER</span><canvas id="character-preview" aria-label="선택한 캐릭터의 3D 전신 미리 보기"></canvas></div>
      <label class="character-motion">동작 미리 보기<select id="character-motion" aria-label="동작 미리 보기"><option value="idle">서 있기</option><option value="walk">걷기</option><option value="run">달리기</option><option value="up">계단 오르기</option><option value="down">계단 내려가기</option><option value="jump">점프</option></select></label>
      <label class="character-rotation">돌려 보기<input id="character-angle" type="range" min="-180" max="180" value="-23" aria-label="캐릭터 시점 회전"><span>360°</span></label>
      </section><section class="character-options" aria-label="캐릭터 외형 선택"><div class="character-presets" aria-label="추천 캐릭터">${CHARACTER_PRESETS.map(
        (p, i) =>
          `<button type="button" class="character-preset" data-preset="${i}" aria-pressed="false"><i style="background:#${OUTFITS.find(
            (o) => o.id === p.appearance.outfit,
          )!
            .color.toString(16)
            .padStart(
              6,
              '0',
            )}"></i><span><strong>${p.name}</strong><small>${p.note}</small></span><b aria-hidden="true">✓</b></button>`,
      ).join('')}</div>
      <div class="character-fields">${fields.map(([key, label, values]) => `<label>${label}<select id="appearance-${key}" aria-label="${label}">${values.map((v) => `<option value="${v.id}">${v.name}</option>`).join('')}</select></label>`).join('')}</div>
      <p class="character-note">모든 체형의 이동 능력은 같아요.<br>탐험 중에도 언제든 다시 바꿀 수 있어요.</p></section></div>
      <div class="character-footer"><span id="character-feedback" role="status">아직 적용하지 않은 미리 보기입니다.</span><button id="character-cancel" class="secondary-button">취소</button><button id="character-apply" class="primary-button">이 모습 적용하기</button></div>`;
    const sync = () => {
      for (const [key] of fields)
        content.querySelector<HTMLSelectElement>(`#appearance-${key}`)!.value = draft[key];
      content.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
        const p = CHARACTER_PRESETS[Number(button.dataset.preset)].appearance;
        button.setAttribute('aria-pressed', String(fields.every(([key]) => p[key] === draft[key])));
      });
      this.preview?.setAppearance(draft);
    };
    for (const [key] of fields)
      content.querySelector<HTMLSelectElement>(`#appearance-${key}`)!.onchange = (event) => {
        draft = { ...draft, [key]: (event.target as HTMLSelectElement).value };
        sync();
      };
    content.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(
      (button) =>
        (button.onclick = () => {
          draft = { ...CHARACTER_PRESETS[Number(button.dataset.preset)].appearance };
          sync();
        }),
    );
    content.querySelector<HTMLButtonElement>('#character-apply')!.onclick = () =>
      apply({ ...draft });
    content.querySelector<HTMLButtonElement>('#character-cancel')!.onclick = cancel;
    try {
      this.preview = new CharacterPreview(
        content.querySelector<HTMLCanvasElement>('#character-preview')!,
        draft,
      );
      this.preview.setMotion('idle');
    } catch {
      content.querySelector('#character-feedback')!.textContent =
        '3D 미리 보기를 열 수 없어요. 외형 선택은 사용할 수 있습니다.';
    }
    content.querySelector<HTMLSelectElement>('#character-motion')!.onchange = (event) =>
      this.preview?.setMotion((event.target as HTMLSelectElement).value as PreviewMotion);
    content.querySelector<HTMLInputElement>('#character-angle')!.oninput = (event) =>
      this.preview?.setAngle(Number((event.target as HTMLInputElement).value));
    sync();
  }
  dispose() {
    this.preview?.dispose();
  }
}
