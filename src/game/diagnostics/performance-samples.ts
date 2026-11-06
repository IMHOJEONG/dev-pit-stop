export const FRAME_STAGES = [
  'simulation',
  'camera',
  'world',
  'vehicle',
  'sky',
  'render',
  'hud',
] as const;
export type FrameStage = (typeof FRAME_STAGES)[number];
export type StageTimes = Record<FrameStage, number>;
import type { CameraQueryStats } from './camera-query-stats';
export interface FrameSample {
  at: number;
  interval: number | null;
  cpu: number;
  stages: StageTimes;
  mode: string;
  x: number;
  y: number;
  z: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  cameraStats?: CameraQueryStats;
}
export interface Distribution {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}
export function distribution(values: number[]): Distribution {
  if (!values.length) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    mean: values.reduce((sum, n) => sum + n, 0) / values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1],
  };
}
/** Live overlay only needs two percentiles and stage means, not the full export summary. */
export function summarizeLiveFrames(samples: FrameSample[]) {
  const intervals: number[] = [],
    cpu: number[] = [];
  const totals = Object.fromEntries(FRAME_STAGES.map((s) => [s, { mean: 0 }])) as Record<
    FrameStage,
    { mean: number }
  >;
  for (const sample of samples) {
    if (sample.interval !== null) intervals.push(sample.interval);
    cpu.push(sample.cpu);
    for (const stage of FRAME_STAGES) totals[stage].mean += sample.stages[stage];
  }
  for (const stage of FRAME_STAGES) totals[stage].mean /= samples.length || 1;
  const frameMs = distribution(intervals);
  return {
    fps: frameMs.mean ? 1000 / frameMs.mean : 0,
    frameMs,
    cpuMs: distribution(cpu),
    stagesMs: totals,
  };
}
export function summarizeFrames(samples: FrameSample[]) {
  const intervals = samples.flatMap((s) => (s.interval === null ? [] : [s.interval]));
  const frameMs = distribution(intervals);
  const range = (key: 'calls' | 'triangles' | 'geometries' | 'textures' | 'programs') => {
    const values = samples.map((s) => s[key]);
    return {
      first: values[0] ?? 0,
      last: values.at(-1) ?? 0,
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      mean: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0,
    };
  };
  const modes: Record<string, number> = {};
  for (const sample of samples) modes[sample.mode] = (modes[sample.mode] ?? 0) + 1;
  return {
    samples: samples.length,
    intervalSamples: intervals.length,
    fps: frameMs.mean ? 1000 / frameMs.mean : 0,
    frameMs,
    over33ms: intervals.filter((n) => n > 33.34).length,
    over50ms: intervals.filter((n) => n > 50).length,
    cpuMs: distribution(samples.map((s) => s.cpu)),
    stagesMs: Object.fromEntries(
      FRAME_STAGES.map((stage) => [stage, distribution(samples.map((s) => s.stages[stage]))]),
    ) as Record<FrameStage, Distribution>,
    modes,
    position: {
      first: samples[0] ? { x: samples[0].x, y: samples[0].y, z: samples[0].z } : null,
      last: samples.length
        ? { x: samples.at(-1)!.x, y: samples.at(-1)!.y, z: samples.at(-1)!.z }
        : null,
    },
    calls: range('calls'),
    triangles: range('triangles'),
    geometries: range('geometries'),
    textures: range('textures'),
    programs: range('programs'),
    cameraQueries: Object.fromEntries(
      (
        [
          'registered',
          'queries',
          'matrixUpdates',
          'meshCandidates',
          'resourceCandidates',
          'resourceTotal',
        ] as const
      ).map((key) => {
        const values = samples.flatMap((s) => (s.cameraStats ? [s.cameraStats[key]] : []));
        return [key, distribution(values)];
      }),
    ),
  };
}

/** Bounded storage: long profiling sessions cannot grow the sample history indefinitely. */
export class SampleWindow {
  private values: FrameSample[] = [];
  private next = 0;
  constructor(private capacity = 600) {}
  push(sample: FrameSample) {
    if (this.values.length < this.capacity) this.values.push(sample);
    else this.values[this.next] = sample;
    this.next = (this.next + 1) % this.capacity;
  }
  read() {
    if (this.values.length < this.capacity) return this.values.slice();
    return [...this.values.slice(this.next), ...this.values.slice(0, this.next)];
  }
  clear() {
    this.values = [];
    this.next = 0;
  }
}
