import type { SirenAudioEngine } from './sirenEngine';

/**
 * Clean, subtle, authentic pneumatic air-suspension audio engine.
 * Balanced gains so valve clicks, air release ("псссш"), fill rush, and low compressor purr
 * sound realistic without harsh white-noise blasts or synthetic high-pitched tones.
 */
export class PneumoAudioEngine {
  private sirenEngine: SirenAudioEngine;
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;

  private valveClickBuf: AudioBuffer | null = null;
  private dumpBuf: AudioBuffer | null = null;
  private fillBuf: AudioBuffer | null = null;
  private compBuf: AudioBuffer | null = null;

  private activeAirNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private activeAirKind: 'fill' | 'dump' | null = null;
  private compNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private airReqToken = 0;

  constructor(sirenEngine: SirenAudioEngine) {
    this.sirenEngine = sirenEngine;
  }

  private async ensureReady(): Promise<{ ctx: AudioContext; dest: AudioNode } | null> {
    const bus = await this.sirenEngine.ensureAudioBus();
    if (!bus) return null;
    if (this.ctx !== bus.ctx || this.dest !== bus.destination) {
      this.ctx = bus.ctx;
      this.dest = bus.destination;
      this.buildBuffers(bus.ctx);
    }
    return { ctx: bus.ctx, dest: bus.destination };
  }

  private buildBuffers(ctx: AudioContext) {
    const sr = ctx.sampleRate;

    // 1. Soft pneumatic solenoid relay click (14ms low-mid damped thud, zero piercing metallic ping)
    {
      const len = Math.max(128, Math.floor(sr * 0.014));
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t / 0.0028);
        const body = Math.sin(2 * Math.PI * 240 * t) * 0.65;
        const w = Math.random() * 2 - 1;
        lp = 0.65 * lp + 0.35 * w;
        ch[i] = (body + lp * 0.3) * env * 0.28;
      }
      this.valveClickBuf = buf;
    }

    // 2. Smooth pressurized air exhaust dump ("псссш" — warm shaped air flow, seamless loop)
    {
      const len = Math.floor(sr * 1.6);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp1 = 0;
      let lp2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        lp1 = 0.72 * lp1 + 0.28 * w;
        lp2 = 0.88 * lp2 + 0.12 * w;
        const shaped = lp1 - lp2 * 0.55;
        const flutter = 0.93 + 0.07 * Math.sin(2 * Math.PI * 26 * (i / sr));
        ch[i] = Math.tanh(shaped * 0.9) * flutter * 0.45;
      }
      const xf = Math.floor(sr * 0.06);
      for (let i = 0; i < xf; i++) {
        const alpha = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - alpha) + ch[i] * alpha;
      }
      this.dumpBuf = buf;
    }

    // 3. Soft enclosed manifold air-in fill rush
    {
      const len = Math.floor(sr * 1.4);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.78 * b0 + 0.22 * w;
        b1 = 0.92 * b1 + 0.08 * w;
        ch[i] = (b0 - b1 * 0.5) * 0.36;
      }
      const xf = Math.floor(sr * 0.05);
      for (let i = 0; i < xf; i++) {
        const alpha = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - alpha) + ch[i] * alpha;
      }
      this.fillBuf = buf;
    }

    // 4. Quiet low-frequency damped twin-piston air compressor purr (~8.5 Hz stroke, soft rounded rumble)
    {
      const dur = 1.0;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      const strokeHz = 9;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const ph = (t * strokeHz) % 1;
        const pulse = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 1.6) * Math.exp(-ph * 2.1);
        const lowThump =
          Math.sin(2 * Math.PI * 72 * t) * 0.48 +
          Math.sin(2 * Math.PI * 144 * t) * 0.18;
        const w = Math.random() * 2 - 1;
        lp = 0.90 * lp + 0.10 * w;
        ch[i] = (lowThump * (0.42 + 0.58 * pulse) + lp * (0.22 + 0.35 * pulse)) * 0.26;
      }
      this.compBuf = buf;
    }
  }

  public playValveClick(strong = false) {
    if (!this.ctx || !this.dest || !this.valveClickBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.valveClickBuf;
    const g = this.ctx.createGain();
    g.gain.value = strong ? 0.22 : 0.14;
    src.connect(g);
    g.connect(this.dest);
    src.start();
  }

  public async startAir(kind: 'fill' | 'dump'): Promise<void> {
    const token = ++this.airReqToken;
    const bus = await this.ensureReady();
    if (!bus || token !== this.airReqToken) return;
    if (this.activeAirKind === kind && this.activeAirNode) return;

    this.stopAirInternal(false);
    const { ctx, dest } = bus;
    const buf = kind === 'dump' ? this.dumpBuf : this.fillBuf;
    if (!buf) return;

    this.playValveClick(true);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    if (kind === 'dump') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1250, ctx.currentTime + 0.35);
      filter.Q.value = 0.78;
    } else {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, ctx.currentTime);
      filter.Q.value = 0.95;
    }

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const targetGain = kind === 'dump' ? 0.24 : 0.14;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(kind === 'dump' ? 0.28 : targetGain, now + 0.025);
    if (kind === 'dump') {
      gain.gain.exponentialRampToValueAtTime(targetGain, now + 0.22);
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(now);

    this.activeAirNode = { src, gain };
    this.activeAirKind = kind;
  }

  public stopAir(): void {
    this.airReqToken++;
    this.stopAirInternal(true);
  }

  private stopAirInternal(withClick: boolean) {
    if (!this.activeAirNode || !this.ctx) {
      this.activeAirKind = null;
      return;
    }
    const { src, gain } = this.activeAirNode;
    this.activeAirNode = null;
    this.activeAirKind = null;
    const now = this.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.065);
      src.stop(now + 0.075);
    } catch {
      // Ignore already stopped
    }
    if (withClick) {
      this.playValveClick(false);
    }
  }

  public async playPresetTransition(direction: 'up' | 'down', durationMs = 650): Promise<void> {
    await this.startAir(direction === 'down' ? 'dump' : 'fill');
    window.setTimeout(() => {
      this.stopAir();
    }, durationMs);
  }

  public async setCompressorSound(on: boolean): Promise<void> {
    if (!on) {
      if (this.compNode && this.ctx) {
        const { src, gain } = this.compNode;
        this.compNode = null;
        const now = this.ctx.currentTime;
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0.0001, now + 0.14);
          src.stop(now + 0.16);
        } catch {
          // Ignore
        }
        this.playValveClick(false);
      }
      return;
    }

    const bus = await this.ensureReady();
    if (!bus || !this.compBuf || this.compNode) return;
    const { ctx, dest } = bus;

    this.playValveClick(true);
    const src = ctx.createBufferSource();
    src.buffer = this.compBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.16);

    src.connect(lp);
    lp.connect(gain);
    gain.connect(dest);
    src.start(now);

    this.compNode = { src, gain };
  }

  public stopAll(): void {
    this.stopAirInternal(false);
    void this.setCompressorSound(false);
  }
}
