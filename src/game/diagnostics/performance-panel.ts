import type { WebGLRenderer } from 'three';
import {
  FRAME_STAGES,
  SampleWindow,
  summarizeFrames,
  summarizeLiveFrames,
} from './performance-samples';
import type { FrameSample, FrameStage, StageTimes } from './performance-samples';
import { activityBetween, renderActivity } from './render-activity';
import type { ActivitySnapshot } from './render-activity';
import type { CameraQueryStats } from './camera-query-stats';
import { describeLongFrame } from './long-frames';
import type { LongFrameEntry } from './long-frames';

interface PerformanceContext {
  mode: string;
  position: { x: number; y: number; z: number };
  cameraStats?: CameraQueryStats;
  camera?: { position: number[]; quaternion: number[] };
}

const stageNames: Record<FrameStage, string> = {
  simulation: '이동·게임 규칙',
  camera: '카메라·충돌',
  world: '월드·캐릭터',
  vehicle: '차량 자세',
  sky: '하늘 월드',
  render: '렌더 호출 CPU',
  hud: 'HUD·미니맵',
};
const emptyTimes = (): StageTimes => ({
  simulation: 0,
  camera: 0,
  world: 0,
  vehicle: 0,
  sky: 0,
  render: 0,
  hud: 0,
});
interface EventSample {
  name: string;
  ms: number;
  at: number;
}
interface Capture {
  label: string;
  start: number;
  end: number;
  samples: FrameSample[];
  events: EventSample[];
  overflow: number;
  longFrames: ReturnType<typeof describeLongFrame>[];
  longFrameOverflow: number;
  environment: ReturnType<PerformancePanel['environment']>;
  activityStart?: ActivitySnapshot;
}
export class PerformancePanel {
  enabled = false;
  private root?: HTMLElement;
  private output?: HTMLElement;
  private status?: HTMLElement;
  private scenario?: HTMLSelectElement;
  private recordButton?: HTMLButtonElement;
  private reportsButton?: HTMLButtonElement;
  private reportsText?: HTMLTextAreaElement;
  private abort = new AbortController();
  private window = new SampleWindow();
  private previous: number | null = null;
  private frameStart = 0;
  private markAt = 0;
  private stages = emptyTimes();
  private capture?: Capture;
  private reports: object[] = [];
  private recentEvents: EventSample[] = [];
  private modal?: HTMLDialogElement;
  private pulseTimer?: ReturnType<typeof setInterval>;
  private prepareTimer?: ReturnType<typeof setTimeout>;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private activityHistory: { at: number; snapshot: ActivitySnapshot }[] = [];
  private scheduling = 'continuous';
  private longFrameObserver?: PerformanceObserver;
  private readonly longFramesSupported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
  constructor(
    private renderer: WebGLRenderer,
    private context: () => PerformanceContext,
    private changeShadows: (enabled: boolean) => void,
  ) {
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code !== 'F3' || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
          return;
        event.preventDefault();
        this.setEnabled(!this.enabled);
      },
      { signal: this.abort.signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.previous = null;
        this.window.clear();
        this.activityHistory = [];
        if (document.hidden && this.capture) this.finishCapture('interrupted-hidden');
      },
      { signal: this.abort.signal },
    );
    if (new URLSearchParams(location.search).get('perf') === '1') this.setEnabled(true);
  }
  environment() {
    const canvas = this.renderer.domElement;
    return {
      build: import.meta.env.MODE,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      drawingBuffer: { width: canvas.width, height: canvas.height },
      devicePixelRatio,
      renderPixelRatio: this.renderer.getPixelRatio(),
      shadows: this.renderer.shadowMap.enabled,
      mainRendererOnly: true,
      worldScheduling: this.scheduling,
      camera: this.context().camera,
      longAnimationFramesSupported: this.longFramesSupported,
    };
  }
  /** Called by panel transitions too, so controls stay usable in the modal top layer. */
  attach(modal: HTMLDialogElement | undefined) {
    this.modal = modal;
    if (this.root) (modal ?? document.body).append(this.root);
  }
  setScheduling(mode: 'continuous' | 'on-demand' | 'blocked') {
    if (this.scheduling !== mode) this.previous = null;
    this.scheduling = mode;
  }
  private setEnabled(enabled: boolean) {
    if (this.capture) this.finishCapture('interrupted-disabled');
    this.enabled = enabled;
    this.previous = null;
    this.window.clear();
    renderActivity.setEnabled(enabled);
    this.activityHistory = [{ at: performance.now(), snapshot: renderActivity.snapshot() }];
    clearInterval(this.pulseTimer);
    this.longFrameObserver?.disconnect();
    if (enabled && this.longFramesSupported) {
      this.longFrameObserver ??= new PerformanceObserver((list) =>
        this.collectLongFrames(list.getEntries()),
      );
      this.longFrameObserver.observe({ type: 'long-animation-frame' });
    }
    if (enabled) this.pulseTimer = setInterval(() => this.pulse(), 500);
    if (enabled && !this.root) this.mount();
    if (this.root) this.root.hidden = !enabled;
  }
  private mount() {
    const root = document.createElement('section');
    root.className = 'performance-panel';
    root.setAttribute('aria-label', '개발용 성능 패널');
    root.innerHTML = `<header><strong>성능 진단 · F3</strong><button type="button" data-action="hide" aria-label="성능 패널 닫기">×</button></header>
      <pre data-output>프레임 수집 중…</pre>
      <div class="performance-controls"><select aria-label="성능 측정 시나리오"><option value="idle">정지</option><option value="walk">걷기</option><option value="stairs">계단 오르내리기</option><option value="drive">차량 주행</option><option value="map">지도</option><option value="pause">일시정지</option><option value="appearance">캐릭터 변경</option><option value="mixed">혼합 이동</option></select><button type="button" data-action="record">15초 측정</button></div>
      <p data-status>3초 준비 후 기록 · 결과는 이 탭에만 보관</p>
      <div class="performance-controls"><button type="button" data-action="shadows">그림자만 끄기</button></div>
      <div class="performance-controls"><button type="button" data-action="reports" disabled>결과 보기 (0)</button><button type="button" data-action="download" disabled>JSON 저장</button></div>
      <textarea aria-label="성능 측정 결과 JSON" readonly hidden spellcheck="false"></textarea>
      <small>실제 렌더만 집계 · 그림자 패스 포함<br>렌더 CPU ≠ GPU 시간 · 자원 수 ≠ 메모리 용량</small>`;
    this.root = root;
    this.output = root.querySelector('[data-output]')!;
    this.status = root.querySelector('[data-status]')!;
    this.scenario = root.querySelector('select')!;
    this.recordButton = root.querySelector('[data-action="record"]')!;
    this.reportsButton = root.querySelector('[data-action="reports"]')!;
    this.reportsText = root.querySelector('textarea')!;
    root.addEventListener(
      'click',
      (event) => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
          ?.dataset.action;
        if (action === 'hide') this.setEnabled(false);
        if (action === 'shadows' && !this.capture) {
          this.changeShadows(!this.renderer.shadowMap.enabled);
          this.updateShadowButton();
        }
        if (action === 'record') {
          if (this.capture) this.finishCapture('stopped');
          else {
            const start = performance.now() + 3000;
            this.capture = {
              label: this.scenario!.value,
              start,
              end: start + 15000,
              samples: [],
              events: [],
              overflow: 0,
              longFrames: [],
              longFrameOverflow: 0,
              environment: this.environment(),
            };
            this.prepareTimer = setTimeout(() => {
              if (!this.capture) return;
              this.capture.start = performance.now();
              this.capture.end = this.capture.start + 15000;
              this.capture.activityStart = renderActivity.snapshot();
              this.finishTimer = setTimeout(() => this.finishCapture('complete'), 15000);
            }, 3000);
            this.recordButton!.textContent = '측정 중지';
            this.scenario!.disabled = true;
            this.updateShadowButton();
            if (!this.modal) this.renderer.domElement.focus();
          }
        }
        if (action === 'reports') {
          this.reportsText!.hidden = !this.reportsText!.hidden;
          this.updateReportText();
        }
        if (action === 'download') {
          const url = URL.createObjectURL(
            new Blob([this.reportJSON()], { type: 'application/json' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = 'wild-atlas-performance.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      },
      { signal: this.abort.signal },
    );
    this.attach(this.modal);
    this.updateShadowButton();
  }
  private updateShadowButton() {
    const button = this.root?.querySelector<HTMLButtonElement>('[data-action="shadows"]');
    if (!button) return;
    const label = this.renderer.shadowMap.enabled ? '그림자만 끄기' : '그림자만 켜기';
    if (button.textContent !== label) button.textContent = label;
    button.disabled = !!this.capture;
  }
  private collectLongFrames(entries: readonly PerformanceEntry[]) {
    const capture = this.capture;
    if (!capture?.activityStart) return;
    for (const entry of entries) {
      if (
        entry.duration <= 100 ||
        entry.startTime < capture.start ||
        entry.startTime >= capture.end
      )
        continue;
      if (capture.longFrames.length < 200)
        capture.longFrames.push(
          describeLongFrame(entry as unknown as LongFrameEntry, capture.start),
        );
      else capture.longFrameOverflow++;
    }
  }
  beginFrame() {
    if (!this.enabled || document.hidden) return;
    this.frameStart = this.markAt = performance.now();
    this.stages = emptyTimes();
  }
  mark(stage: FrameStage) {
    if (!this.enabled || document.hidden) return;
    const now = performance.now();
    this.stages[stage] += now - this.markAt;
    this.markAt = now;
  }
  eventStart() {
    return this.enabled ? performance.now() : 0;
  }
  eventEnd(name: string, start: number) {
    if (!this.enabled || !start) return;
    const now = performance.now();
    const sample = { name, ms: now - start, at: now };
    this.recentEvents.push(sample);
    if (this.recentEvents.length > 30) this.recentEvents.shift();
    if (this.capture?.activityStart && now >= this.capture.start && now < this.capture.end) {
      if (this.capture.events.length < 300) this.capture.events.push(sample);
    }
  }
  endFrame(
    now: number,
    mode: string,
    position: { x: number; y: number; z: number },
    cameraStats?: CameraQueryStats,
  ) {
    if (!this.enabled || document.hidden) return;
    const info = this.renderer.info;
    const sample: FrameSample = {
      at: now,
      interval:
        this.previous === null || this.scheduling !== 'continuous' ? null : now - this.previous,
      cpu: performance.now() - this.frameStart,
      stages: this.stages,
      mode,
      x: position.x,
      y: position.y,
      z: position.z,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      cameraStats: cameraStats ? { ...cameraStats } : undefined,
    };
    this.previous = now;
    renderActivity.record('world', sample.cpu, sample.calls, sample.triangles, sample.stages);
    this.window.push(sample);
    if (this.capture?.activityStart && now >= this.capture.start && now < this.capture.end) {
      if (this.capture.samples.length < 4096) this.capture.samples.push(sample);
      else this.capture.overflow++;
    }
  }
  private pulse() {
    if (!this.enabled || document.hidden) return;
    this.updateShadowButton();
    const now = performance.now();
    const snapshot = renderActivity.snapshot();
    this.activityHistory.push({ at: now, snapshot });
    while (this.activityHistory.length > 11) this.activityHistory.shift();
    const first = this.activityHistory[0];
    const activity = activityBetween(first.snapshot, snapshot, now - first.at);
    const latest = this.context();
    const samples = this.window.read().filter((s) => s.at >= now - 5000);
    const summary = summarizeLiveFrames(samples);
    const f = (n: number) => n.toFixed(1);
    this.output!.textContent = [
      `${latest.mode} · ${this.scheduling === 'continuous' ? `${f(summary.fps)} FPS` : '본 월드 대기'}`,
      `본 월드 ${f(activity.world.framesPerSecond)}회/s · ${Math.round(activity.world.callsPerSecond)} calls/s`,
      `본 월드 CPU ${f(activity.world.cpuMsPerSecond)} ms/s`,
      renderActivity.activePreviews
        ? `미리보기 ${f(activity.preview.framesPerSecond)} FPS · CPU ${f(activity.preview.cpuMsPerSecond)} ms/s`
        : '미리보기 없음',
      `프레임 p50 ${f(summary.frameMs.p50)} / p95 ${f(summary.frameMs.p95)} ms`,
      `CPU 평균 ${f(summary.cpuMs.mean)} / p95 ${f(summary.cpuMs.p95)} ms`,
      ...FRAME_STAGES.map((stage) => `${stageNames[stage]} ${f(summary.stagesMs[stage].mean)} ms`),
      `최근 본 화면 1회 ${this.renderer.info.render.calls} calls`,
      `자원 G ${this.renderer.info.memory.geometries} · T ${this.renderer.info.memory.textures} · P ${this.renderer.info.programs?.length ?? 0}`,
      `DPR ${f(this.renderer.getPixelRatio())} · ${this.renderer.domElement.width}×${this.renderer.domElement.height}`,
      `위치 ${f(latest.position.x)}, ${f(latest.position.y)}, ${f(latest.position.z)}`,
      ...(latest.cameraStats
        ? [
            `최근 카메라: 메시 후보 ${latest.cameraStats.meshCandidates} / ${latest.cameraStats.registered}×${latest.cameraStats.queries}`,
            `행렬 조회 ${latest.cameraStats.matrixUpdates} · 자원 후보 ${latest.cameraStats.resourceCandidates}/${latest.cameraStats.resourceTotal}`,
          ]
        : []),
      ...(this.recentEvents.length
        ? [`최근 ${this.recentEvents.at(-1)!.name}: ${f(this.recentEvents.at(-1)!.ms)} ms`]
        : []),
    ].join('\n');
    if (this.capture) {
      const left = this.capture.start - performance.now();
      this.status!.textContent =
        left > 0
          ? `${Math.ceil(left / 1000)}초 후 측정 시작`
          : `기록 중 · ${Math.max(0, Math.ceil((this.capture.end - performance.now()) / 1000))}초 남음`;
    }
  }
  private finishCapture(status: string) {
    const capture = this.capture;
    if (!capture) return;
    this.collectLongFrames(this.longFrameObserver?.takeRecords() ?? []);
    clearTimeout(this.prepareTimer);
    clearTimeout(this.finishTimer);
    const durationMs = capture.activityStart ? Math.max(0, performance.now() - capture.start) : 0;
    this.capture = undefined;
    this.reports.push({
      label: capture.label,
      status,
      recordedAt: new Date().toISOString(),
      durationMs,
      environment: capture.environment,
      environmentEnd: this.environment(),
      droppedSamples: capture.overflow,
      longFramesOver100ms: capture.longFrames,
      droppedLongFrames: capture.longFrameOverflow,
      slowMainFrames: capture.samples
        .filter((s) => (s.interval ?? 0) > 100 || s.cpu > 100)
        .map((s) => ({ ...s, at: s.at - capture.start })),
      ...summarizeFrames(capture.samples),
      activity: activityBetween(
        capture.activityStart ?? renderActivity.snapshot(),
        renderActivity.snapshot(),
        durationMs,
      ),
      events: capture.events.map((e) => ({
        name: e.name,
        ms: e.ms,
        offsetMs: e.at - capture.start,
      })),
    });
    if (this.reports.length > 12) this.reports.shift();
    this.recordButton!.textContent = '15초 측정';
    this.scenario!.disabled = false;
    this.updateShadowButton();
    this.status!.textContent = `${capture.label} · ${status} · ${capture.samples.length} 프레임 기록`;
    this.reportsButton!.disabled = false;
    this.reportsButton!.textContent = `결과 보기 (${this.reports.length})`;
    this.root!.querySelector<HTMLButtonElement>('[data-action="download"]')!.disabled = false;
    this.updateReportText();
  }
  private reportJSON() {
    return JSON.stringify(
      {
        schema: 3,
        notes:
          'World frame stats cover real main callbacks only; no FPS when world is on demand. Activity counters independently measure actual world/preview frames, calls and CPU elapsed per wall second. CPU excludes layout/paint and GPU time. Calls include shadow passes. Counts are not bytes. Event times may overlap stages. No network transmission.',
        reports: this.reports,
      },
      null,
      2,
    );
  }
  private updateReportText() {
    if (this.reportsText) this.reportsText.value = this.reportJSON();
  }
  dispose() {
    clearInterval(this.pulseTimer);
    this.longFrameObserver?.disconnect();
    clearTimeout(this.prepareTimer);
    clearTimeout(this.finishTimer);
    renderActivity.setEnabled(false);
    this.abort.abort();
    this.capture = undefined;
    this.reports = [];
    this.window.clear();
    this.root?.remove();
  }
}
