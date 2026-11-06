/** Browser LoAF attribution, not a GC trace or GPU timer. No Window/DOM references retained. */
interface ScriptTiming {
  startTime: number;
  duration: number;
  invoker: string;
  invokerType: string;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  forcedStyleAndLayoutDuration: number;
  pauseDuration: number;
}
export interface LongFrameEntry {
  startTime: number;
  duration: number;
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: readonly ScriptTiming[];
}
export function describeLongFrame(entry: LongFrameEntry, captureStart: number) {
  return {
    offsetMs: entry.startTime - captureStart,
    durationMs: entry.duration,
    blockingMs: entry.blockingDuration,
    renderOffsetMs: entry.renderStart ? entry.renderStart - entry.startTime : null,
    styleLayoutToEndMs: entry.styleAndLayoutStart
      ? Math.max(0, entry.startTime + entry.duration - entry.styleAndLayoutStart)
      : null,
    scripts: entry.scripts.map((script) => ({
      offsetMs: script.startTime - captureStart,
      durationMs: script.duration,
      invoker: script.invoker,
      invokerType: script.invokerType,
      sourceURL: script.sourceURL,
      sourceFunctionName: script.sourceFunctionName,
      sourceCharPosition: script.sourceCharPosition,
      forcedStyleLayoutMs: script.forcedStyleAndLayoutDuration,
      pauseMs: script.pauseDuration,
    })),
  };
}
