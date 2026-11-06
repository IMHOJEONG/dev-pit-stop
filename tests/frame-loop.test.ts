import { describe, expect, it } from 'vite-plus/test';
import { FrameLoop } from '../src/game/app/frame-loop';
import type { FrameTick } from '../src/game/app/frame-loop';

function harness(draw?: (tick: FrameTick) => void) {
  let id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const ticks: FrameTick[] = [];
  const loop = new FrameLoop(
    (tick) => {
      ticks.push(tick);
      draw?.(tick);
    },
    {
      request(callback) {
        pending.set(++id, callback);
        return id;
      },
      cancel(key) {
        pending.delete(key);
      },
    },
  );
  const step = (now: number) => {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(now));
  };
  return { loop, ticks, pending, step };
}
describe('on-demand world scheduling', () => {
  it('draws a static view once, coalesces changes and then stops scheduling', () => {
    const h = harness();
    h.loop.invalidate();
    h.loop.invalidate();
    h.loop.invalidate();
    expect(h.pending.size).toBe(1);
    h.step(100);
    expect(h.ticks).toEqual([{ now: 100, dt: 0, continuous: false }]);
    expect(h.pending.size).toBe(0);
    h.step(15000);
    expect(h.ticks.length).toBe(1);
    h.loop.invalidate();
    h.step(16000);
    expect(h.ticks.length).toBe(2);
    expect(h.pending.size).toBe(0);
  });
  it('cancels menu work and excludes a long pause from resumed simulation time', () => {
    const h = harness();
    h.loop.setMode('play');
    h.step(0);
    h.step(20);
    h.loop.setMode('idle');
    expect(h.pending.size).toBe(0);
    h.step(60000);
    expect(h.ticks.length).toBe(2);
    h.loop.setMode('play');
    h.step(60020);
    h.step(60040);
    expect(h.ticks.map((tick) => tick.dt)).toEqual([0, 0.02, 0, 0.02]);
    expect(h.pending.size).toBe(1);
  });
  it('retains invalidation while hidden or context-lost and redraws once on return', () => {
    const h = harness();
    h.loop.invalidate();
    h.loop.setMode('blocked');
    h.loop.invalidate();
    h.loop.invalidate();
    h.step(10000);
    expect(h.ticks.length).toBe(0);
    expect(h.pending.size).toBe(0);
    h.loop.setMode('idle');
    h.step(10020);
    expect(h.ticks.length).toBe(1);
    expect(h.pending.size).toBe(0);
  });
  it('honors a panel opened inside a frame and never queues a second loop', () => {
    const h = harness(() => h.loop.setMode('idle'));
    h.loop.setMode('play');
    h.step(100);
    expect(h.pending.size).toBe(0);
    h.loop.setMode('play');
    h.loop.setMode('play');
    expect(h.pending.size).toBe(1);
  });
  it('keeps the existing dt cap and prevents callbacks after disposal', () => {
    const h = harness();
    h.loop.setMode('play');
    h.step(0);
    h.step(200);
    expect(h.ticks[1].dt).toBe(0.045);
    const late = [...h.pending.values()][0];
    h.loop.dispose();
    h.loop.invalidate();
    h.loop.setMode('play');
    late(400);
    expect(h.pending.size).toBe(0);
    expect(h.ticks.length).toBe(2);
  });
});
