import { describeLongFrame, type LongFrameEntry } from './long-frames';
import { distribution } from './performance-samples';
import { GpuTimer } from './gpu-timer';

const ORDER = [true, false, false, true];
const RUN_MS = 15_000;
const WARMUP_MS = 3_000;
const CAPACITY = 4096;
const STRIDE = 7;
// The camera settles exponentially; insignificant round-off must not invalidate a stationary trial.
function sameEnvironment(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-5;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameEnvironment(left[key], right[key]))
  );
}

export function summarizeComparisonFrames(data: Float64Array, count: number, start: number) {
  const intervals: number[] = [],
    callbacks: number[] = [],
    renders: number[] = [],
    calls: number[] = [],
    triangles: number[] = [];
  const stalls: {
    offsetMs: number;
    intervalMs: number;
    previousCallbackMs: number;
    previousRenderMs: number;
    betweenCallbacksMs: number;
    dispatchAfterRafMs: number;
  }[] = [];
  for (let i = 0; i < count * STRIDE; i += STRIDE) {
    const [raf, enter, renderStart, renderEnd, exit, draws, tris] = data.subarray(i, i + STRIDE);
    callbacks.push(exit - enter);
    renders.push(renderEnd - renderStart);
    calls.push(draws);
    triangles.push(tris);
    if (!i) continue;
    const prev = i - STRIDE;
    const interval = raf - data[prev];
    intervals.push(interval);
    if (interval > 100)
      stalls.push({
        offsetMs: enter - start,
        intervalMs: interval,
        previousCallbackMs: data[prev + 4] - data[prev + 1],
        previousRenderMs: data[prev + 3] - data[prev + 2],
        betweenCallbacksMs: Math.max(0, enter - data[prev + 4]),
        dispatchAfterRafMs: enter - raf,
      });
  }
  const frameMs = distribution(intervals);
  return {
    frames: count,
    fps: frameMs.mean ? 1000 / frameMs.mean : 0,
    frameMs,
    callbackMs: distribution(callbacks),
    renderMs: distribution(renders),
    calls: distribution(calls),
    triangles: distribution(triangles),
    over100ms: stalls.length,
    stalls,
  };
}

interface ComparisonHost {
  setPanel(enabled: boolean): void;
  environment(): object;
  finished(report: {
    status: string;
    runs: object[];
    gpuProfiling: boolean;
    loafSupported: boolean;
    longTaskSupported: boolean;
  }): void;
}

/** The same fixed-size timing buffer in both modes, with no extra RAF or overlay repaint. */
export class PanelComparison {
  private readonly frames = new Float64Array(CAPACITY * STRIDE);
  private count = 0;
  private dropped = 0;
  private current = -1;
  private phase = 0;
  private start = 0;
  private end = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private observer?: PerformanceObserver;
  private readonly gpu?: GpuTimer;
  private runs: object[] = [];
  private baseline?: object;
  private environmentStart?: object;
  private longFrames: ReturnType<typeof describeLongFrame>[] = [];
  private longTasks: { offsetMs: number; durationMs: number; name: string }[] = [];
  private panelRefreshes: { offsetMs: number; durationMs: number }[] = [];
  private readonly loafSupported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
  private readonly longTaskSupported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask');

  constructor(
    private host: ComparisonHost,
    private gl?: WebGL2RenderingContext | WebGLRenderingContext,
  ) {
    if (gl && 'beginQuery' in gl) this.gpu = new GpuTimer(gl);
  }
  run() {
    if (this.loafSupported || this.longTaskSupported) {
      this.observer = new PerformanceObserver((list) => this.collect(list.getEntries()));
      if (this.loafSupported) this.observer.observe({ type: 'long-animation-frame' });
      if (this.longTaskSupported) this.observer.observe({ type: 'longtask' });
    }
    this.prepare();
  }
  private prepare() {
    this.host.setPanel(ORDER[this.phase]);
    this.timer = setTimeout(() => {
      this.count = this.dropped = 0;
      this.longFrames = [];
      this.longTasks = [];
      this.panelRefreshes = [];
      this.environmentStart = this.host.environment();
      if (!this.phase) this.baseline = this.environmentStart;
      if (!sameEnvironment(this.environmentStart, this.baseline))
        return this.stop('conditions-changed');
      this.start = performance.now();
      this.end = this.start + RUN_MS;
      this.timer = setTimeout(() => this.finishPhase(), RUN_MS);
    }, WARMUP_MS);
  }
  beginFrame(raf: number) {
    this.current = -1;
    if (!this.end || raf < this.start || raf >= this.end) return;
    if (this.count >= CAPACITY) {
      this.dropped++;
      return;
    }
    const i = this.count * STRIDE;
    this.current = i;
    this.frames[i] = raf;
    this.frames[i + 1] = performance.now();
  }
  beforeRender() {
    if (this.current < 0) return;
    if (this.count % 8 === 0) this.gpu?.begin(this.count);
    this.frames[this.current + 2] = performance.now();
  }
  afterRender() {
    if (this.current < 0) return;
    this.frames[this.current + 3] = performance.now();
    this.gpu?.end();
  }
  endFrame(calls: number, triangles: number) {
    if (this.current < 0) return;
    this.frames[this.current + 4] = performance.now();
    this.frames[this.current + 5] = calls;
    this.frames[this.current + 6] = triangles;
    this.count++;
    this.current = -1;
  }
  panelRefresh(start: number) {
    if (this.end && start >= this.start && start < this.end && this.panelRefreshes.length < 120)
      this.panelRefreshes.push({
        offsetMs: start - this.start,
        durationMs: performance.now() - start,
      });
  }
  private collect(entries: readonly PerformanceEntry[]) {
    if (!this.end) return;
    for (const e of entries) {
      if (e.startTime < this.start || e.startTime >= this.end) continue;
      if (
        e.entryType === 'long-animation-frame' &&
        e.duration > 100 &&
        this.longFrames.length < 200
      )
        this.longFrames.push(describeLongFrame(e as unknown as LongFrameEntry, this.start));
      if (e.entryType === 'longtask' && this.longTasks.length < 300)
        this.longTasks.push({
          offsetMs: e.startTime - this.start,
          durationMs: e.duration,
          name: e.name,
        });
    }
  }
  private finishPhase() {
    this.collect(this.observer?.takeRecords() ?? []);
    const environmentEnd = this.host.environment();
    const sameConditions = sameEnvironment(environmentEnd, this.baseline);
    const start = this.start;
    const gpu = this.gpu?.drain() ?? { supported: false, samples: [], unresolved: 0, disjoint: 0 };
    const slowGpuSamples = gpu.samples
      .map(({ frame, durationMs }) => {
        const index = frame * STRIDE;
        return {
          offsetMs: this.frames[index + 1] - start,
          gpuMs: durationMs,
          renderMs: this.frames[index + 3] - this.frames[index + 2],
          callbackMs: this.frames[index + 4] - this.frames[index + 1],
        };
      })
      .sort((a, b) => b.renderMs - a.renderMs)
      .slice(0, 8);
    this.end = 0;
    this.runs.push({
      panel: ORDER[this.phase],
      durationMs: RUN_MS,
      sameConditions,
      environment: this.environmentStart,
      environmentEnd,
      droppedFrames: this.dropped,
      ...summarizeComparisonFrames(this.frames, this.count, start),
      gpu: {
        supported: gpu.supported,
        samples: gpu.samples.length,
        durationMs: distribution(gpu.samples.map((s) => s.durationMs)),
        slowCpuSamples: slowGpuSamples,
        unresolved: gpu.unresolved,
        disjoint: gpu.disjoint,
      },
      longFramesOver100ms: this.longFrames,
      longTasks: this.longTasks,
      panelRefreshes: this.panelRefreshes,
    });
    if (!sameConditions) return this.stop('conditions-changed');
    if (this.count < 2 || this.dropped) return this.stop('invalid-samples');
    if (++this.phase === ORDER.length) this.stop('complete');
    else this.prepare();
  }
  dispose() {
    clearTimeout(this.timer);
    this.end = 0;
    this.observer?.disconnect();
    this.gpu?.dispose();
  }
  stop(status: string) {
    this.dispose();
    this.host.finished({
      status,
      runs: this.runs,
      gpuProfiling: !!this.gl,
      loafSupported: this.loafSupported,
      longTaskSupported: this.longTaskSupported,
    });
  }
}
