import { FRAME_STAGES } from './performance-samples';
import type { StageTimes } from './performance-samples';

const totals = () => ({
  frames: 0,
  calls: 0,
  triangles: 0,
  cpuMs: 0,
  stagesMs: Object.fromEntries(FRAME_STAGES.map((key) => [key, 0])) as StageTimes,
});
export type ActivityTotals = ReturnType<typeof totals>;
export type ActivitySnapshot = Record<'world' | 'preview', ActivityTotals>;

/** Counts real render callbacks. A diagnostic timer never manufactures game frames. */
export class RenderActivity {
  enabled = false;
  activePreviews = 0;
  private world = totals();
  private preview = totals();
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.world = totals();
    this.preview = totals();
  }
  openPreview() {
    this.activePreviews++;
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.activePreviews--;
    };
  }
  record(
    scope: 'world' | 'preview',
    cpuMs: number,
    calls: number,
    triangles: number,
    stages?: StageTimes,
  ) {
    if (!this.enabled) return;
    const value = this[scope];
    value.frames++;
    value.calls += calls;
    value.triangles += triangles;
    value.cpuMs += cpuMs;
    if (stages) for (const stage of FRAME_STAGES) value.stagesMs[stage] += stages[stage];
  }
  snapshot(): ActivitySnapshot {
    return {
      world: { ...this.world, stagesMs: { ...this.world.stagesMs } },
      preview: { ...this.preview, stagesMs: { ...this.preview.stagesMs } },
    };
  }
}
export function activityBetween(
  before: ActivitySnapshot,
  after: ActivitySnapshot,
  durationMs: number,
) {
  const scope = (name: 'world' | 'preview') => {
    const a = before[name],
      b = after[name],
      seconds = durationMs / 1000;
    const frames = b.frames - a.frames;
    const cpuMs = b.cpuMs - a.cpuMs;
    const calls = b.calls - a.calls;
    return {
      frames,
      calls,
      triangles: b.triangles - a.triangles,
      cpuMs,
      framesPerSecond: seconds > 0 ? frames / seconds : 0,
      callsPerSecond: seconds > 0 ? calls / seconds : 0,
      cpuMsPerSecond: seconds > 0 ? cpuMs / seconds : 0,
      cpuMsPerFrame: frames ? cpuMs / frames : 0,
      stagesMs: Object.fromEntries(
        FRAME_STAGES.map((key) => [key, b.stagesMs[key] - a.stagesMs[key]]),
      ) as StageTimes,
    };
  };
  return { durationMs, world: scope('world'), preview: scope('preview') };
}
export const renderActivity = new RenderActivity();
