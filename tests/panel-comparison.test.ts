import { describe, expect, it } from 'vite-plus/test';
import { summarizeComparisonFrames } from '../src/game/diagnostics/panel-comparison';

describe('panel comparison timing', () => {
  it('attributes a long RAF interval to the preceding callback and separately measures its gap', () => {
    // RAF timestamp, callback entry, render start/end, callback exit, calls, triangles.
    const data = new Float64Array([
      100, 102, 104, 184, 192, 400, 300_000, 225, 232, 234, 238, 240, 410, 310_000, 350, 365, 367,
      371, 373, 390, 290_000,
    ]);
    const report = summarizeComparisonFrames(data, 3, 90);
    expect(report.fps).toBe(8);
    expect(report.calls.mean).toBe(400);
    expect(report.triangles.mean).toBe(300_000);
    expect(report.stalls).toEqual([
      {
        offsetMs: 142,
        intervalMs: 125,
        previousCallbackMs: 90,
        previousRenderMs: 80,
        betweenCallbacksMs: 40,
        dispatchAfterRafMs: 7,
      },
      {
        offsetMs: 275,
        intervalMs: 125,
        previousCallbackMs: 8,
        previousRenderMs: 4,
        betweenCallbacksMs: 125,
        dispatchAfterRafMs: 15,
      },
    ]);
  });

  it('ignores unused capacity and has no interval across trial boundaries', () => {
    const data = new Float64Array([
      100, 102, 104, 108, 112, 390, 300_000, 500, 501, 502, 503, 504, 900, 600_000,
    ]);
    const report = summarizeComparisonFrames(data, 1, 90);
    expect(report.frames).toBe(1);
    expect(report.fps).toBe(0);
    expect(report.callbackMs.mean).toBe(10);
    expect(report.over100ms).toBe(0);
    expect(report.calls.mean).toBe(390);
  });
});
