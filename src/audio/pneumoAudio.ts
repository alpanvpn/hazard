import type { SirenAudioEngine } from './sirenEngine';

/**
 * Authentic 4-contour pneumatic air-suspension audio engine across all SGU systems.
 * Separate physical acoustics for every pneumo action:
 *  - Solenoid valve clack (electro-pneumatic coil + brass spool click)
 *  - Exhaust dump ("ОПУСТИТЬ" -> loud open-air "ПШШШШШЬ!" decompression blast)
 *  - Air bag fill ("ПОДНЯТЬ" -> muffled pressurized manifold rush + bag inflation thrum)
 *  - Piston compressor ("КОМПРЕССОР" -> real 12V Berkut/Viair motor hum + 21.5 Hz cranking chug)
 *  - Governor unloader sneeze ("ЦС-ПШИК!") on completion
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
  private airStartAt = 0;
  private stopDelayTimer: number | null = null;
  private compNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private airReqToken = 0;
  private burstTimer: number | null = null;

  constructor(sirenEngine: SirenAudioEngine) {
    this.sirenEngine = sirenEngine;
  }

  private getReadySync(): { ctx: AudioContext; dest: AudioNode } | null {
    if (this.ctx && this.dest && this.valveClickBuf && this.ctx.state === 'running') {
      return { ctx: this.ctx, dest: this.dest };
    }
    return null;
  }

  private async ensureReady(): Promise<{ ctx: AudioContext; dest: AudioNode } | null> {
    const bus = await this.sirenEngine.ensureAudioBus();
    if (!bus) return null;
    if (this.ctx !== bus.ctx || this.dest !== bus.destination) {
      this.ctx = bus.ctx;
      this.dest = bus.destination;
      this.buildBuffers(bus.ctx);
    } else if (!this.valveClickBuf) {
      this.buildBuffers(bus.ctx);
    }
    return { ctx: bus.ctx, dest: bus.destination };
  }

  private buildBuffers(ctx: AudioContext) {
    const sr = ctx.sampleRate;

    // 1. Crisp electro-pneumatic brass solenoid clack (mechanical spool snap, no tonal beep)
    {
      const len = Math.max(128, Math.floor(sr * 0.012));
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let hpPrev = 0;
      let hpOut = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const win = Math.sin((Math.PI * i) / (len - 1));
        const snap = Math.exp(-t / 0.0016);
        const w = Math.random() * 2 - 1;
        hpOut = 0.82 * (hpOut + w - hpPrev);
        hpPrev = w;
        const mech =
          Math.sin(2 * Math.PI * 520 * t * Math.exp(-t * 45)) * 0.38 +
          Math.sin(2 * Math.PI * 2150 * t) * 0.22;
        ch[i] = (hpOut * 0.72 + mech) * snap * win * 0.55;
      }
      this.valveClickBuf = buf;
    }

    // 2. Open-air exhaust dump ("ПШШШШШЬ!") — turbulent pink/air blast + decompression body
    {
      const len = Math.floor(sr * 1.8);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      // 3-stage Paul Kellet pink-air filter + subtle turbulence flutter
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let hpX = 0;
      let hpY = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.950 * b2 + w * 0.048;
        b3 = 0.820 * b3 + w * 0.145;
        const pink = b0 + b1 + b2 + b3 + w * 0.14;
        // High-pass above ~180 Hz so sub rumble doesn't mud up the exhaust hiss
        hpY = 0.975 * (hpY + pink - hpX);
        hpX = pink;
        const t = i / sr;
        const turb = 0.92 + 0.08 * Math.sin(2 * Math.PI * 23 * t + 0.6 * Math.sin(2 * Math.PI * 6.5 * t));
        ch[i] = Math.tanh(hpY * 0.62) * turb * 0.88;
      }
      const xf = Math.floor(sr * 0.08);
      for (let i = 0; i < xf; i++) {
        const a = Math.sin((i / xf) * Math.PI * 0.5);
        const b = Math.cos((i / xf) * Math.PI * 0.5);
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * b + ch[i] * a;
      }
      this.dumpBuf = buf;
    }

    // 3. Enclosed bag inflation ("ПОДНЯТЬ") — tight manifold pressure hiss + warm rubber bag tension
    {
      const len = Math.floor(sr * 1.6);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      let lp1 = 0;
      let lp2 = 0;
      let lp3 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        lp1 = 0.72 * lp1 + 0.28 * w;
        lp2 = 0.90 * lp2 + 0.10 * w;
        lp3 = 0.986 * lp3 + 0.014 * w;
        const manifoldHiss = (lp1 - lp2 * 0.68) * 0.95;
        const bagFlow = lp3 * 0.65 * (0.9 + 0.1 * Math.sin(2 * Math.PI * 14 * t));
        ch[i] = Math.tanh((manifoldHiss + bagFlow) * 1.15) * 0.72;
      }
      const xf = Math.floor(sr * 0.07);
      for (let i = 0; i < xf; i++) {
        const a = Math.sin((i / xf) * Math.PI * 0.5);
        const b = Math.cos((i / xf) * Math.PI * 0.5);
        const tailIdx = len - xf + i;
        ch[tailIdx] = ch[tailIdx] * b + ch[i] * a;
      }
      this.fillBuf = buf;
    }

    // 4. Real 12V Berkut / Viair piston compressor (1290 RPM = 21.5 Hz cranking pulse + DC motor hum)
    {
      const dur = 1.0;
      const len = Math.floor(sr * dur);
      const buf = ctx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      const strokeHz = 22.0; // integer cycles per 1.0s for seamless loop!
      const motorHz = 154.0; // integer cycles per 1.0s
      let lp = 0;
      let bp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const ph = (t * strokeHz) % 1;
        // Piston compression knock + intake puff
        const strokeEnv = Math.exp(-ph * 4.5);
        const intakePuff = Math.sin(Math.PI * Math.min(1, ph * 1.4));
        const motor =
          Math.sin(2 * Math.PI * motorHz * t) * 0.36 +
          Math.sin(2 * Math.PI * (motorHz * 2) * t) * 0.16 +
          Math.sin(2 * Math.PI * (motorHz * 3) * t) * 0.07;
        const knock = Math.sin(2 * Math.PI * 88 * t) * strokeEnv * 0.42;
        const w = Math.random() * 2 - 1;
        lp = 0.84 * lp + 0.16 * w;
        bp = 0.72 * bp + 0.28 * (w - lp);
        const mechAir = (lp * 0.36 + bp * 0.24) * (0.35 + 0.65 * intakePuff);
        ch[i] = Math.tanh((motor * (0.62 + 0.38 * intakePuff) + knock + mechAir) * 1.05) * 0.48;
      }
      this.compBuf = buf;
    }
  }

  private fireClickOn(ctx: AudioContext, dest: AudioNode, strong = false) {
    if (!this.valveClickBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.valveClickBuf;
    const g = ctx.createGain();
    g.gain.value = strong ? 0.68 : 0.46;
    src.connect(g);
    g.connect(dest);
    src.start();
  }

  public async playValveClick(strong = false): Promise<void> {
    const syncBus = this.getReadySync();
    if (syncBus) {
      this.fireClickOn(syncBus.ctx, syncBus.dest, strong);
      return;
    }
    const bus = await this.ensureReady();
    if (bus) {
      this.fireClickOn(bus.ctx, bus.dest, strong);
    }
  }

  public async playLimitStop(dir: 'up' | 'down'): Promise<void> {
    const bus = this.getReadySync() ?? (await this.ensureReady());
    if (!bus) return;
    const { ctx, dest } = bus;
    this.fireClickOn(ctx, dest, true);
    const buf = dir === 'down' ? this.dumpBuf : this.fillBuf;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = dir === 'down' ? 1450 : 2100;
    filter.Q.value = 1.1;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(now);
    src.stop(now + 0.1);
  }

  // Crisp governor unloader sneeze ("ЦС-ПШИК!") when compressor hits pressure / switches off
  public async playGovernorUnload(): Promise<void> {
    const bus = this.getReadySync() ?? (await this.ensureReady());
    if (!bus || !this.dumpBuf) return;
    const { ctx, dest } = bus;
    this.fireClickOn(ctx, dest, true);

    const src = ctx.createBufferSource();
    src.buffer = this.dumpBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1250, ctx.currentTime + 0.22);
    filter.Q.value = 0.78;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.76, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(now);
    src.stop(now + 0.27);
  }

  private clearStopTimers() {
    if (this.stopDelayTimer !== null) {
      window.clearTimeout(this.stopDelayTimer);
      this.stopDelayTimer = null;
    }
    if (this.burstTimer !== null) {
      window.clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }

  public async startAir(kind: 'fill' | 'dump', forceRestart = false): Promise<void> {
    this.clearStopTimers();
    const token = ++this.airReqToken;
    const bus = this.getReadySync() ?? (await this.ensureReady());
    if (!bus || token !== this.airReqToken) return;
    if (!forceRestart && this.activeAirKind === kind && this.activeAirNode) return;

    this.stopAirInternal(false);
    const { ctx, dest } = bus;
    const buf = kind === 'dump' ? this.dumpBuf : this.fillBuf;
    if (!buf) return;

    // 1. Crisp valve solenoid open clack
    this.fireClickOn(ctx, dest, true);

    // 2. Main air stream
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    const shelf = ctx.createBiquadFilter();

    if (kind === 'dump') {
      // Real open-air exhaust blast: bright initial burst sweeping down into rich wide air roar
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5200, now);
      filter.frequency.exponentialRampToValueAtTime(2400, now + 0.28);
      filter.Q.value = 0.65;

      shelf.type = 'highpass';
      shelf.frequency.value = 340;
      shelf.Q.value = 0.7;
    } else {
      // Enclosed bag fill: muffled pressurized manifold rush (clearly distinct from open dump)
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.frequency.exponentialRampToValueAtTime(2250, now + 0.4);
      filter.Q.value = 1.25;

      shelf.type = 'lowshelf';
      shelf.frequency.value = 260;
      shelf.gain.value = 3.5;
    }

    const gain = ctx.createGain();
    const peakGain = kind === 'dump' ? 0.84 : 0.44;
    const sustainGain = kind === 'dump' ? 0.68 : 0.36;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.016);
    gain.gain.exponentialRampToValueAtTime(sustainGain, now + 0.22);

    src.connect(filter);
    filter.connect(shelf);
    shelf.connect(gain);
    gain.connect(dest);
    src.start(now);

    this.activeAirNode = { src, gain };
    this.activeAirKind = kind;
    this.airStartAt = performance.now();
  }

  public stopAir(respectMinPulse = true): void {
    this.clearStopTimers();
    if (respectMinPulse && this.activeAirNode) {
      const elapsed = performance.now() - this.airStartAt;
      const minMs = 130;
      if (elapsed < minMs) {
        const token = this.airReqToken;
        this.stopDelayTimer = window.setTimeout(() => {
          this.stopDelayTimer = null;
          if (this.airReqToken === token) {
            this.airReqToken++;
            this.stopAirInternal(true);
          }
        }, minMs - elapsed);
        return;
      }
    }
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
    if (withClick && this.dest) {
      this.fireClickOn(this.ctx, this.dest, false);
    }
  }

  public async playPresetTransition(direction: 'up' | 'down', durationMs = 620): Promise<void> {
    await this.startAir(direction === 'down' ? 'dump' : 'fill', true);
    const token = this.airReqToken;
    this.burstTimer = window.setTimeout(() => {
      this.burstTimer = null;
      if (this.airReqToken === token) {
        this.stopAir(false);
      }
    }, durationMs);
  }

  public async playQuickBurst(kind: 'fill' | 'dump' = 'dump', durationMs = 340): Promise<void> {
    await this.startAir(kind, true);
    const token = this.airReqToken;
    this.burstTimer = window.setTimeout(() => {
      this.burstTimer = null;
      if (this.airReqToken === token) {
        this.stopAir(false);
      }
    }, durationMs);
  }

  public async setCompressorSound(on: boolean, withUnload = false): Promise<void> {
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
        if (withUnload) {
          void this.playGovernorUnload();
        } else {
          void this.playValveClick(false);
        }
      }
      return;
    }

    const bus = this.getReadySync() ?? (await this.ensureReady());
    if (!bus || !this.compBuf || this.compNode) return;
    const { ctx, dest } = bus;

    this.fireClickOn(ctx, dest, true);
    const src = ctx.createBufferSource();
    src.buffer = this.compBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 780;
    lp.Q.value = 0.8;

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
    this.clearStopTimers();
    this.airReqToken++;
    this.stopAirInternal(false);
    void this.setCompressorSound(false, false);
  }
}
