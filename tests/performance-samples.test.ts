import { describe, expect, it } from 'vite-plus/test';
import {
  distribution,
  SampleWindow,
  summarizeFrames,
  summarizeLiveFrames,
} from '../src/game/diagnostics/performance-samples';
import type { FrameSample } from '../src/game/diagnostics/performance-samples';

const frame = (at: number, interval: number | null): FrameSample => ({
  at,
  interval,
  cpu: 4,
  stages: { simulation: 1, camera: 1, world: 1, vehicle: 0, sky: 0, render: 1, hud: 0 },
  mode: 'walk',
  x: at,
  y: 0,
  z: 0,
  calls: 50,
  triangles: 100,
  geometries: 20,
  textures: 2,
  programs: 5,
});
describe('performance measurement summaries', () => {
  it('keeps live frame/CPU percentiles and stage means identical to the full export', () => {
    for (const samples of [
      [],
      [frame(0, null)],
      Array.from({ length: 600 }, (_, i) => ({
        ...frame(i * 20, i % 7 ? 8 + (i % 110) : null),
        cpu: i % 55,
        stages: {
          simulation: 1,
          camera: i % 15,
          world: 0.2,
          vehicle: 0,
          sky: 0,
          render: i % 50,
          hud: 0,
        },
      })),
    ]) {
      const live = summarizeLiveFrames(samples),
        full = summarizeFrames(samples);
      expect(live.fps).toBe(full.fps);
      expect(live.frameMs).toEqual(full.frameMs);
      expect(live.cpuMs).toEqual(full.cpuMs);
      for (const key of Object.keys(live.stagesMs) as (keyof typeof live.stagesMs)[])
        expect(live.stagesMs[key].mean).toBe(full.stagesMs[key].mean);
    }
  });
  it('computes FPS from total time rather than averaging instantaneous FPS', () => {
    const report = summarizeFrames([frame(0, null), frame(10, 10), frame(60, 50)]);
    expect(report.fps).toBeCloseTo(1000 / 30);
    expect(report.intervalSamples).toBe(2);
    expect(report.frameMs.p95).toBe(50);
    expect(report.over33ms).toBe(1);
    expect(report.cpuMs.mean).toBe(4);
    expect(report.stagesMs.camera.mean).toBe(1);
  });
  it('retains long visible stalls instead of hiding them with the simulation dt clamp', () => {
    const report = summarizeFrames([frame(500, 500)]);
    expect(report.frameMs.max).toBe(500);
    expect(report.over50ms).toBe(1);
  });
  it('does not count render-only menu frames as camera collision queries', () => {
    const report = summarizeFrames([
      {
        ...frame(0, null),
        cameraStats: {
          registered: 745,
          queries: 2,
          matrixUpdates: 745,
          meshCandidates: 8,
          resourceCandidates: 9,
          resourceTotal: 909,
        },
      },
      { ...frame(20, null), mode: 'panel:settings' },
    ]);
    expect(report.cameraQueries.queries.mean).toBe(2);
    expect(report.cameraQueries.meshCandidates.mean).toBe(8);
    expect(summarizeFrames([frame(20, null)]).cameraQueries.queries.mean).toBe(0);
  });
  it('reports resource changes and mode composition without treating counts as bytes', () => {
    const report = summarizeFrames([
      frame(0, null),
      { ...frame(20, 20), geometries: 25, mode: 'panel:map' },
    ]);
    expect(report.geometries).toEqual({ first: 20, last: 25, min: 20, max: 25, mean: 22.5 });
    expect(report.modes).toEqual({ walk: 1, 'panel:map': 1 });
    expect(report.position.last?.x).toBe(20);
  });
  it('uses nearest-rank percentiles and handles empty measurements', () => {
    expect(distribution(Array.from({ length: 100 }, (_, i) => i + 1)).p95).toBe(95);
    expect(summarizeFrames([]).fps).toBe(0);
    expect(summarizeFrames([]).geometries.max).toBe(0);
  });
  it('bounds history while preserving chronological order across wraps and resets', () => {
    const window = new SampleWindow(3);
    for (let i = 0; i < 8; i++) window.push(frame(i, 16));
    expect(window.read().map((s) => s.at)).toEqual([5, 6, 7]);
    window.clear();
    window.push(frame(20, null));
    expect(window.read().map((s) => s.at)).toEqual([20]);
  });
});
