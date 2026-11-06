interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}
interface QuerySample {
  query: WebGLQuery;
  frame: number;
}

/** Sampled WebGL command time. Never wait for an unavailable result or call finish(). */
export class GpuTimer {
  private readonly extension: TimerExtension | null;
  private readonly free: WebGLQuery[] = [];
  private readonly pending: QuerySample[] = [];
  private active?: QuerySample;
  private values: { frame: number; durationMs: number }[] = [];
  private disjoint = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  }
  get supported() {
    return this.extension !== null;
  }
  private poll() {
    if (!this.extension || !this.pending.length || this.gl.isContextLost()) return;
    const gl = this.gl;
    if (!gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
      for (const q of this.pending.splice(0)) gl.deleteQuery(q.query);
      this.values.length = 0;
      this.disjoint++;
      return;
    }
    while (
      this.pending.length &&
      gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)
    ) {
      const { query, frame } = this.pending.shift()!;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      if (Number.isFinite(ns) && ns >= 0 && this.values.length < 1024)
        this.values.push({ frame, durationMs: ns / 1e6 });
      this.free.push(query);
    }
  }
  begin(frame: number) {
    if (!this.extension || this.gl.isContextLost()) return;
    this.poll();
    if (this.pending.length >= 6) return;
    const query = this.free.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = { query, frame };
  }
  end() {
    if (!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = undefined;
  }
  drain() {
    this.poll();
    const result = {
      supported: this.supported,
      samples: this.values,
      unresolved: this.pending.length,
      disjoint: this.disjoint,
    };
    this.values = [];
    this.disjoint = 0;
    for (const q of this.pending.splice(0)) this.gl.deleteQuery(q.query);
    return result;
  }
  dispose() {
    this.end();
    for (const q of this.free) this.gl.deleteQuery(q);
    for (const q of this.pending) this.gl.deleteQuery(q.query);
    this.free.length = this.pending.length = this.values.length = 0;
  }
}
