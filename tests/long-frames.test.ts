import { describe, expect, it } from 'vitest';
import { describeLongFrame } from '../src/game/diagnostics/long-frames';

describe('long frame attribution', () => {
  it('exports relative timestamps and timing values without retaining browser objects', () => {
    const result = describeLongFrame(
      {
        startTime: 120,
        duration: 140,
        blockingDuration: 80,
        renderStart: 150,
        styleAndLayoutStart: 250,
        scripts: [
          {
            startTime: 140,
            duration: 110,
            invoker: 'FrameRequestCallback',
            invokerType: 'user-callback',
            sourceURL: '/app.js',
            sourceFunctionName: 'frame',
            sourceCharPosition: 20,
            forcedStyleAndLayoutDuration: 3,
            pauseDuration: 0,
          },
        ],
      },
      100,
    );
    expect(result.offsetMs).toBe(20);
    expect(result.renderOffsetMs).toBe(30);
    expect(result.styleLayoutToEndMs).toBe(10);
    expect(result.scripts[0]).toMatchObject({ offsetMs: 40, forcedStyleLayoutMs: 3 });
    expect(
      describeLongFrame(
        {
          startTime: 0,
          duration: 110,
          blockingDuration: 0,
          renderStart: 0,
          styleAndLayoutStart: 0,
          scripts: [],
        },
        0,
      ).styleLayoutToEndMs,
    ).toBeNull();
  });
});
