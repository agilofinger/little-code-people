/**
 * A tiny SID-flavoured synth on Web Audio: pulse/triangle/saw/noise voices with ADSR-ish
 * envelopes, stereo panning and an optional filter sweep. Nothing plays before a user gesture.
 */
export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

export interface Note {
  wave: Wave;
  freq: number;
  /** Seconds from now. */
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  /** -1 left … 1 right */
  pan?: number;
  slideTo?: number;
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
  bus?: 'sfx' | 'music';
}

export const midi = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export class Sid {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<'sfx' | 'music', GainNode> | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get time(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Call from a user gesture (click / key). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      // a gentle low-pass keeps it warm, a bit like the SID's filter
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 7000;
      master.connect(tone).connect(ctx.destination);
      const sfx = ctx.createGain();
      const music = ctx.createGain();
      sfx.gain.value = 0.8;
      music.gain.value = 0.35;
      sfx.connect(master);
      music.connect(master);
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.buses = { sfx, music };
      this.noise = noise;
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  play(n: Note): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || this.muted || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + (n.at ?? 0);
    const attack = n.attack ?? 0.005;
    const release = n.release ?? 0.08;
    const peak = n.gain ?? 0.2;

    let src: AudioScheduledSourceNode;
    if (n.wave === 'noise') {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.playbackRate.value = Math.max(0.05, n.freq / 8000);
      src = s;
    } else {
      const o = ctx.createOscillator();
      o.type = n.wave;
      o.frequency.setValueAtTime(n.freq, t0);
      if (n.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, n.slideTo), t0 + n.dur);
      src = o;
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.setTargetAtTime(0, t0 + Math.max(attack, n.dur - release), release / 3);

    let node: AudioNode = src;
    if (n.filter) {
      const f = ctx.createBiquadFilter();
      f.type = n.filter.type;
      f.Q.value = n.filter.q ?? 1;
      f.frequency.setValueAtTime(n.filter.from, t0);
      if (n.filter.to) f.frequency.exponentialRampToValueAtTime(n.filter.to, t0 + n.dur);
      node.connect(f);
      node = f;
    }
    node.connect(env);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, n.pan ?? 0));
    env.connect(pan).connect(this.buses[n.bus ?? 'sfx']);
    src.start(t0);
    src.stop(t0 + n.dur + release + 0.1);
  }
}
