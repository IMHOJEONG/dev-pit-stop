import { describe, expect, it, vi } from 'vite-plus/test';
import { GpuTimer } from '../src/game/diagnostics/gpu-timer';

function fakeGL() {
  let available = false,
    disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    isContextLost: () => false,
    getParameter: () => disjoint,
    getQueryParameter: vi.fn((_query, param: number) => (param === 1 ? available : 2_500_000)),
    createQuery: vi.fn(() => ({})),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    deleteQuery: vi.fn(),
  };
  return {
    gl,
    timer: new GpuTimer(gl as unknown as WebGL2RenderingContext),
    available: () => {
      available = true;
    },
    disjoint: () => {
      disjoint = true;
    },
  };
}

describe('asynchronous GPU timing', () => {
  it('bounds pending queries and never reads unavailable results', () => {
    const { gl, timer } = fakeGL();
    for (let i = 0; i < 20; i++) {
      timer.begin(i);
      timer.end();
    }
    expect(gl.createQuery).toHaveBeenCalledTimes(6);
    expect(timer.drain()).toMatchObject({ samples: [], unresolved: 6 });
    expect(
      gl.getQueryParameter.mock.calls.every(([, param]) => param === gl.QUERY_RESULT_AVAILABLE),
    ).toBe(true);
    expect(gl.deleteQuery).toHaveBeenCalledTimes(6);
    timer.dispose();
  });

  it('associates ready timing with its frame and discards disjoint results', () => {
    const { timer, gl, available, disjoint } = fakeGL();
    timer.begin(8);
    timer.end();
    available();
    expect(timer.drain().samples).toEqual([{ frame: 8, durationMs: 2.5 }]);
    timer.begin(16);
    timer.end();
    disjoint();
    expect(timer.drain()).toMatchObject({ samples: [], disjoint: 1 });
    expect(gl.createQuery).toHaveBeenCalledTimes(1); // Reuse the completed query.
    timer.dispose();
  });
});
