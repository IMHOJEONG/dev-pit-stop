import type { ResourceKind } from '../resources/catalog';
export class AmbientAudio {
  private audio: AudioContext | null = null;
  private audioGain: GainNode | null = null;
  enabled = false;
  private paused = true;
  private hidden = false;
  constructor(private onError: (message: string) => void) {}
  async toggle() {
    try {
      if (!this.audio) {
        this.audio = new AudioContext();
        this.audioGain = this.audio.createGain();
        this.audioGain.gain.value = 0;
        this.audioGain.connect(this.audio.destination);
        const noise = this.audio.createBuffer(1, this.audio.sampleRate * 3, this.audio.sampleRate),
          data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = this.audio.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const filter = this.audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 550;
        source.connect(filter);
        filter.connect(this.audioGain);
        source.start();
        for (const frequency of [130.81, 196]) {
          const o = this.audio.createOscillator(),
            gain = this.audio.createGain();
          o.type = 'sine';
          o.frequency.value = frequency;
          gain.gain.value = 0.055;
          o.connect(gain);
          gain.connect(this.audioGain);
          o.start();
        }
      }
      this.enabled = !this.enabled;
      await this.audio.resume();
      this.sync();
    } catch {
      this.onError('이 브라우저에서 소리를 시작할 수 없어요.');
    }
  }
  sync(paused = this.paused, hidden = this.hidden) {
    this.paused = paused;
    this.hidden = hidden;
    if (this.audio && this.audioGain)
      this.audioGain.gain.setTargetAtTime(
        this.enabled && !hidden ? (paused ? 0.035 : 0.11) : 0,
        this.audio.currentTime,
        0.3,
      );
  }
  chime(complete: boolean) {
    if (!this.enabled || !this.audio) return;
    [0, ...(complete ? [4, 7, 12] : [])].forEach((note, i) => {
      const o = this.audio!.createOscillator(),
        g = this.audio!.createGain(),
        t = this.audio!.currentTime + i * 0.12;
      o.type = 'sine';
      o.frequency.value = 440 * 2 ** (note / 12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      o.connect(g);
      g.connect(this.audio!.destination);
      o.start(t);
      o.stop(t + 0.6);
    });
  }

  impact(kind: ResourceKind) {
    if (!this.enabled || !this.audio) return;
    const o = this.audio.createOscillator(),
      g = this.audio.createGain(),
      t = this.audio.currentTime;
    o.type = kind === 'crystal' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(kind === 'wood' ? 130 : kind === 'stone' ? 220 : 880, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.14);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    o.connect(g);
    g.connect(this.audio.destination);
    o.start(t);
    o.stop(t + 0.2);
  }
  dispose() {
    void this.audio?.close();
  }
}
