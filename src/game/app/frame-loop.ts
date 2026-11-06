export type FrameMode = 'play' | 'idle' | 'blocked';
export interface FrameTick {
  now: number;
  dt: number;
  continuous: boolean;
}
interface FrameHost {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

/** One pending RAF at most. Static views wake only after an explicit invalidation. */
export class FrameLoop {
  private mode: FrameMode = 'idle';
  private pending: number | null = null;
  private last: number | null = null;
  private dirty = false;
  private disposed = false;
  constructor(
    private draw: (tick: FrameTick) => void,
    private host: FrameHost = {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
  ) {}
  setMode(mode: FrameMode) {
    if (this.disposed) return;
    if (mode !== this.mode) this.last = null;
    this.mode = mode;
    if (mode === 'blocked' || (mode === 'idle' && !this.dirty)) this.cancel();
    this.queue();
  }
  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    this.queue();
  }
  private queue() {
    if (this.disposed || this.pending !== null || this.mode === 'blocked') return;
    if (this.mode === 'idle' && !this.dirty) return;
    this.pending = this.host.request(this.frame);
  }
  private cancel() {
    if (this.pending !== null) this.host.cancel(this.pending);
    this.pending = null;
  }
  private frame = (now: number) => {
    this.pending = null;
    if (this.disposed || this.mode === 'blocked') return;
    const continuous = this.mode === 'play';
    const dt =
      continuous && this.last !== null ? Math.min(Math.max(0, (now - this.last) / 1000), 0.045) : 0;
    this.last = continuous ? now : null;
    this.dirty = false;
    this.draw({ now, dt, continuous });
    this.queue();
  };
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
