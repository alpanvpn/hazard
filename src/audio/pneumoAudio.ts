import type { SirenAudioEngine } from './sirenEngine';

/**
 * Realistic multi-stage PCM & filtered airflow audio engine for 4-zone Pneumo Suspension.
 * Uses the main SirenAudioEngine AudioContext & limiter bus so it works cleanly over background music.
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

    // 1. Metallic solenoid manifold valve clack (18ms)
    {
      const len = Math.max(128, Math.floor(sr * 0.018));
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t / 0.0038);
        const knock = Math.sin(2 * Math.PI * 1450 * t) * 0.45 + Math.sin(2 * Math.PI * 3100 * t) * 0.35;
        const snap = (Math.random() * 2 - 1) * 0.55;
        ch[i] = (knock + snap) * env * 0.52;
      }
      this.valveClickBuf = buf;
    }

    // 2. Pressurized exhaust dump ("ПШШШТ!" — 1.8s turbulent shaped discharge, seamless loop tail)
    {
      const len = Math.floor(sr * 1.8);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp1 = 0;
      let lp2 = 0;
      let hpPrev = 0;
      let prevIn = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        // Turbulent airflow coloration: bright sizzling nozzle + mid-range roar
        lp1 += 0.36 * (w - lp1);
        lp2 += 0.14 * (w - lp2);
        const hp = 0.85 * (hpPrev + w - prevIn);
        prevIn = w;
        hpPrev = hp;
        // Subtle natural pressure flutter at ~38 Hz
        const flutter = 0.9 + 0.1 * Math.sin(2 * Math.PI * 38 * (i / sr));
        ch[i] = Math.tanh((lp1 * 0.55 + lp2 * 0.3 + hp * 0.42) * 1.25) * flutter;
      }
      // Crossfade last 60ms with start for seamless holding
      const xf = Math.floor(sr * 0.06);
      for (let i = 0; i < xf; i++) {
        const alpha = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - alpha) + ch[i] * alpha;
      }
      this.dumpBuf = buf;
    }

    // 3. Smooth manifold air-in fill hiss (1.4s tight internal rush)
    {
      const len = Math.floor(sr * 1.4);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.72 * b0 + 0.28 * w;
        b1 = 0.91 * b1 + 0.09 * w;
        ch[i] = (b0 - b1 * 0.65) * 0.85;
      }
      const xf = Math.floor(sr * 0.05);
      for (let i = 0; i < xf; i++) {
        const alpha = i / xf;
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * (1 - alpha) + ch[i] * alpha;
      }
      this.fillBuf = buf;
    }

    // 4. 12V Twin-Piston Air Compressor loop (1.0s exact 10 Hz stroke cycle for zero-seam loop)
    {
      const dur = 1.0;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      const strokeHz = 10; // exact integer cycles in 1.0s for seamless loop
      let rumble = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const ph = (t * strokeHz) % 1;
        // Sharp compression impulse per piston stroke
        const pulse = Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 2.2) * Math.exp(-ph * 2.4);
        const lowThump =
          Math.sin(2 * Math.PI * 110 * t) * 0.45 +
          Math.sin(2 * Math.PI * 220 * t) * 0.22;
        const motorHum = Math.sin(2 * Math.PI * 330 * t) * 0.08;
        const w = Math.random() * 2 - 1;
        rumble = 0.84 * rumble + 0.16 * w;
        const reedValve = rumble * (0.28 + 0.55 * pulse);
        ch[i] = Math.tanh((lowThump * (0.35 + 0.85 * pulse) + reedValve + motorHum) * 0.88) * 0.46;
      }
      this.compBuf = buf;
    }
  }

  public playValveClick(strong = false) {
    if (!this.ctx || !this.dest || !this.valveClickBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.valveClickBuf;
    const g = this.ctx.createGain();
    g.gain.value = strong ? 0.42 : 0.26;
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
      filter.frequency.setValueAtTime(3400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1750, ctx.currentTime + 0.35);
      filter.Q.value = 0.72;
    } else {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2150, ctx.currentTime);
      filter.Q.value = 1.05;
    }

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const targetGain = kind === 'dump' ? 0.72 : 0.44;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(kind === 'dump' ? 0.92 : targetGain, now + 0.025);
    if (kind === 'dump') {
      gain.gain.exponentialRampToValueAtTime(targetGain, now + 0.24);
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
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.055);
      src.stop(now + 0.065);
    } catch {
      // Ignore already stopped
    }
    if (withClick) {
      this.playValveClick(false);
    }
  }

  public async playPresetTransition(direction: 'up' | 'down', durationMs = 700): Promise<void> {
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
    lp.frequency.value = 1350;

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
