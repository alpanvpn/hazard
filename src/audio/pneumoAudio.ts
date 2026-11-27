import type { SirenAudioEngine } from './sirenEngine';

/**
 * Realistic 4-zone air-suspension pneumatic audio engine:
 * - Solenoid valve block click-clack (1.6 kHz transient + 320 Hz housing thump)
 * - 8-bar air exhaust dump ("ПШШШ-ссс" — punchy pressurized blast + nozzle hiss)
 * - Pressurized air-line manifold fill ("ФШШШ" — resonant hose air flow into bags)
 * - Twin-piston 12V air compressor (~28 Hz Berkut/Viair chug + DC motor hum)
 * - Compressor check-valve unloader puff ("ПШИК!") on shutoff
 */
export class PneumoAudioEngine {
  private sirenEngine: SirenAudioEngine;
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;

  private valveClickBuf: AudioBuffer | null = null;
  private dumpBuf: AudioBuffer | null = null;
  private fillBuf: AudioBuffer | null = null;
  private compBuf: AudioBuffer | null = null;
  private unloaderBuf: AudioBuffer | null = null;

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

    // 1. Crisp 12V pneumatic solenoid valve block click-clack (22ms)
    {
      const len = Math.max(256, Math.floor(sr * 0.022));
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const clickEnv = Math.exp(-t / 0.0022);
        const bodyEnv = Math.exp(-t / 0.0055);
        const metallic =
          Math.sin(2 * Math.PI * 1680 * t) * 0.55 +
          Math.sin(2 * Math.PI * 2640 * t) * 0.25;
        const housing = Math.sin(2 * Math.PI * 310 * t) * 0.65;
        const w = Math.random() * 2 - 1;
        lp = 0.5 * lp + 0.5 * w;
        ch[i] = Math.tanh((metallic * clickEnv + housing * bodyEnv + lp * 0.45 * clickEnv) * 0.85);
      }
      this.valveClickBuf = buf;
    }

    // 2. Pressurized 8-bar air exhaust dump ("ПШШШ-ссс" — wide rich air turbulence, seamless loop)
    {
      const len = Math.floor(sr * 1.8);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp1 = 0;
      let lp2 = 0;
      let hpPrev = 0;
      let prevIn = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        // High-pass edge + mid turbulence for authentic compressed air hiss
        hpPrev = 0.86 * (hpPrev + w - prevIn);
        prevIn = w;
        lp1 = 0.62 * lp1 + 0.38 * w;
        lp2 = 0.90 * lp2 + 0.10 * w;
        const shaped = (lp1 - lp2 * 0.6) * 0.85 + hpPrev * 0.42;
        const flutter =
          0.91 +
          0.05 * Math.sin(2 * Math.PI * 19 * t) +
          0.04 * Math.sin(2 * Math.PI * 37 * t);
        ch[i] = Math.tanh(shaped * 1.35) * flutter * 0.72;
      }
      const xf = Math.floor(sr * 0.08);
      for (let i = 0; i < xf; i++) {
        const a = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - a) + ch[i] * a;
      }
      this.dumpBuf = buf;
    }

    // 3. Enclosed air-line manifold fill rush ("ФШШШ" — pressurized hose flow into air bags)
    {
      const len = Math.floor(sr * 1.6);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        b0 = 0.72 * b0 + 0.28 * w;
        b1 = 0.91 * b1 + 0.09 * w;
        b2 = 0.97 * b2 + 0.03 * w;
        const flow = (b0 - b1 * 0.55) * 1.15 + (b1 - b2) * 0.65;
        const pulse = 0.94 + 0.06 * Math.sin(2 * Math.PI * 14 * t);
        ch[i] = Math.tanh(flow * 1.25) * pulse * 0.68;
      }
      const xf = Math.floor(sr * 0.07);
      for (let i = 0; i < xf; i++) {
        const a = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - a) + ch[i] * a;
      }
      this.fillBuf = buf;
    }

    // 4. Real 12V air compressor (Berkut R20 / Viair ~28 Hz piston stroke + audible mid-low mechanical chug + motor hum)
    {
      const dur = 1.0;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      const strokeHz = 28; // 1680 RPM
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const ph = (t * strokeHz) % 1;
        // Sharp compression stroke pulse every 1/28s
        const stroke = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 1.3) * Math.exp(-ph * 2.4);
        const pistonBody =
          Math.sin(2 * Math.PI * 140 * t) * 0.52 +
          Math.sin(2 * Math.PI * 280 * t) * 0.36 +
          Math.sin(2 * Math.PI * 420 * t) * 0.20;
        const motorWhine = Math.sin(2 * Math.PI * 840 * t) * 0.07;
        const w = Math.random() * 2 - 1;
        lp = 0.80 * lp + 0.20 * w;
        const chug = pistonBody * (0.35 + 0.65 * stroke) + lp * (0.28 + 0.55 * stroke) + motorWhine;
        ch[i] = Math.tanh(chug * 1.15) * 0.62;
      }
      this.compBuf = buf;
    }

    // 5. Compressor check-valve unloader puff ("ПШИК!" 220ms exhaust burst when compressor stops)
    {
      const len = Math.floor(sr * 0.24);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.055);
        const w = Math.random() * 2 - 1;
        lp = 0.55 * lp + 0.45 * w;
        ch[i] = Math.tanh(lp * 1.6) * env * 0.78;
      }
      this.unloaderBuf = buf;
    }
  }

  public playValveClick(strong = false) {
    if (!this.ctx || !this.dest || !this.valveClickBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.valveClickBuf;
    const g = this.ctx.createGain();
    g.gain.value = strong ? 0.58 : 0.42;
    src.connect(g);
    g.connect(this.dest);
    src.start();
  }

  private playUnloaderPuff() {
    if (!this.ctx || !this.dest || !this.unloaderBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.unloaderBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2800, this.ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.18);
    bp.Q.value = 0.65;
    const g = this.ctx.createGain();
    g.gain.value = 0.52;
    src.connect(bp);
    bp.connect(g);
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
      filter.frequency.setValueAtTime(2600, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1450, ctx.currentTime + 0.45);
      filter.Q.value = 0.58;
    } else {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1550, ctx.currentTime);
      filter.Q.value = 0.72;
    }

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const sustainGain = kind === 'dump' ? 0.52 : 0.40;
    const peakGain = kind === 'dump' ? 0.66 : 0.46;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(sustainGain, now + 0.25);

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
          gain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
          src.stop(now + 0.14);
        } catch {
          // Ignore
        }
        this.playUnloaderPuff();
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
    lp.frequency.value = 1150;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.42, now + 0.14);

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
