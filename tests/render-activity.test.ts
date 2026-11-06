import { describe, expect, it } from 'vite-plus/test';
import { RenderActivity, activityBetween } from '../src/game/diagnostics/render-activity';
describe('actual renderer activity counters', () => {
  it('reports zero world work while preview callbacks continue', () => {
    const meter = new RenderActivity();
    meter.setEnabled(true);
    const before = meter.snapshot();
    for (let i = 0; i < 450; i++) meter.record('preview', 2, 100, 1000);
    const result = activityBetween(before, meter.snapshot(), 15000);
    expect(result.world.frames).toBe(0);
    expect(result.world.callsPerSecond).toBe(0);
    expect(result.world.cpuMsPerSecond).toBe(0);
    expect(result.preview.framesPerSecond).toBe(30);
    expect(result.preview.cpuMsPerSecond).toBe(60);
  });
  it('normalizes by wall time rather than averaging per-frame rates', () => {
    const meter = new RenderActivity();
    meter.setEnabled(true);
    meter.record('world', 10, 500, 200000);
    const before = meter.snapshot();
    meter.record('world', 8, 400, 150000);
    meter.record('world', 12, 600, 250000);
    const result = activityBetween(before, meter.snapshot(), 2000);
    expect(result.world.framesPerSecond).toBe(1);
    expect(result.world.callsPerSecond).toBe(500);
    expect(result.world.cpuMsPerSecond).toBe(10);
    expect(result.world.cpuMsPerFrame).toBe(10);
    expect(before.world.frames).toBe(1);
  });
  it('does not record when disabled and closes each preview registration once', () => {
    const meter = new RenderActivity();
    const close = meter.openPreview();
    meter.record('world', 5, 20, 100);
    expect(meter.snapshot().world.frames).toBe(0);
    close();
    close();
    expect(meter.activePreviews).toBe(0);
    expect(activityBetween(meter.snapshot(), meter.snapshot(), 0).world.framesPerSecond).toBe(0);
  });
});
