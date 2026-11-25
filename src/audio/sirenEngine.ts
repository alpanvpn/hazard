export type SirenMode =
  | 'standby'
  | 'hilo'
  | 'yelp'
  | 'wail'
  | 'pa'
  | 'radio'
  | 'phaser'
  | 'piercer'
  | 'rumbler'
  | 'usa'
  | 'airraid'
  | 'fast';

// Numeric tone codes matching HazardSynth inside public/hazard-worklet.js
const TONE_CODE: Record<SirenMode, number> = {
  standby: 0,
  pa: 0,
  radio: 0,
  wail: 1,
  yelp: 2,
  hilo: 3,
  phaser: 4,
  fast: 5,
  piercer: 6,
  rumbler: 7,
  airraid: 8,
  usa: 9,
};

export type PhraseId =
  | 'obochina'
  | 'vpravo_stop'
  | 'prizhatsa'
  | 'strelyat'
  | 'ostanavlivaemsya';

export interface EngineSnapshot {
  powered: boolean;
  mode: SirenMode;
  altActive: boolean;
  hz: number;
  hornActive: boolean;
  wolfActive: boolean;
  loadedCount: number;
  totalCount: number;
  audioState: AudioContextState | 'uninitialized' | 'interrupted';
  sessionType: 'ambient' | 'playback' | 'unsupported';
  micOn: boolean;
  radioName: string | null;
  activePhrase: PhraseId | null;
}

interface MetaEntry {
  loopStart?: number;
  track?: number[];
  trackStep?: number;
  hz?: number;
}

interface SynthMessage {
  type: string;
  [key: string]: unknown;
}

interface HazardSynthInstance {
  onStat: ((m: SynthMessage) => void) | null;
  message(m: SynthMessage): void;
  render(out: Float32Array): void;
}

interface InlineAssets {
  workletCode?: string;
  meta?: Record<string, MetaEntry>;
  wavBase64?: Record<string, string>;
  phrasesBase64?: Record<string, string>;
}

function getInlineAssets(): InlineAssets | undefined {
  return (window as unknown as { __ALPAN_INLINE__?: InlineAssets }).__ALPAN_INLINE__;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export class SirenAudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioNode | null = null;
  private sendFn: ((m: SynthMessage, transfer?: Transferable[]) => void) | null = null;

  private toneFilter: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private tunnelWet: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf = new Float32Array(1024);

  private radioGate: GainNode | null = null;
  private radioBuffer: AudioBuffer | null = null;
  private radioSrc: AudioBufferSourceNode | null = null;
  private radioName: string | null = null;

  private micStream: MediaStream | null = null;
  private micNodes: AudioNode[] = [];
  private micGain: GainNode | null = null;
  private micGate: GainNode | null = null;
  private micAnalyser: AnalyserNode | null = null;

  private startPromise: Promise<void> | null = null;
  private ready = false;
  private recReady = false;
  private loadedCount = 0;
  private readonly totalCount = 6; // wail, yelp, phaser, horn, tone, wolf

  private powered = false;
  private mode: SirenMode = 'standby';
  private altActive = false;
  private manStyle: 'siren' | 'wolf' = 'siren';
  private manSiren: 'toggle' | 'hold' = 'toggle';
  private manHeld = false;
  private hornHeld = false;
  private pttHeld = false;
  private beepEnabled = true;

  private volume = 0.8;
  private echoLevel = 0;
  private tunnelLevel = 0;
  private toneFreq = 4800;
  private micDb = 18;
  private sessionType: 'ambient' | 'playback' = 'ambient';

  private currentHz = 0;
  private currentHorn = false;
  private currentWolf = false;

  private phraseBuffers = new Map<PhraseId, AudioBuffer>();
  private phraseSrc: AudioBufferSourceNode | null = null;
  private activePhrase: PhraseId | null = null;

  private onStateChange?: (snap: EngineSnapshot) => void;

  constructor(onStateChange?: (snap: EngineSnapshot) => void) {
    this.onStateChange = onStateChange;
    this.setupLifecycleListeners();
  }

  private setupLifecycleListeners() {
    if (typeof document === 'undefined') return;
    const tryResume = () => {
      if (this.ctx && this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
      this.emit();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryResume();
    });
    window.addEventListener('pageshow', tryResume);
    window.addEventListener('focus', tryResume);
  }

  private applyAudioSession(type: 'ambient' | 'playback') {
    this.sessionType = type;
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        nav.audioSession.type = type;
      }
    } catch {
      // Safe fallback when navigator.audioSession is unavailable
    }
    this.emit();
  }

  public setSessionType(type: 'ambient' | 'playback') {
    this.applyAudioSession(type);
  }

  public getSessionSupport(): 'ambient' | 'playback' | 'unsupported' {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    return nav.audioSession ? this.sessionType : 'unsupported';
  }

  public async prefetchAll(): Promise<void> {
    if (getInlineAssets()?.wavBase64) {
      return;
    }
    const urls = [
      'sounds/meta.json',
      'sounds/wail.wav',
      'sounds/yelp.wav',
      'sounds/phaser.wav',
      'sounds/horn.wav',
      'sounds/tone.wav',
      'sounds/wolf.wav',
      'sounds/phrases/obochina.mp3',
      'sounds/phrases/vpravo_stop.mp3',
      'sounds/phrases/prizhatsa.mp3',
      'sounds/phrases/strelyat.mp3',
      'sounds/phrases/ostanavlivaemsya.mp3',
    ];
    await Promise.all(
      urls.map(async (u) => {
        try {
          await fetch(u, { cache: 'force-cache' });
        } catch {
          // Offline cache handles it
        }
      })
    );
  }

  private createImpulseResponse(ctx: AudioContext, duration = 1.15, decay = 2.8): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const impulse = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        ch[i] = (Math.random() * 2 - 1) * env * (i < sr * 0.025 ? 0.55 : 0.9);
      }
    }
    return impulse;
  }

  private volCurve(v: number): number {
    return v <= 0 ? 0 : Math.pow(v, 1.6);
  }

  public unlock(): void {
    try {
      if (!this.ctx) {
        this.applyAudioSession(this.sessionType);
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.buildGraph();
        this.ctx.onstatechange = () => this.emit();
      }
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
      // Tiny silent buffer inside gesture wakes iOS Web Audio output without stealing OS media focus
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch {
      // Ignore unlock failures before gesture
    }
  }

  private buildGraph() {
    const ctx = this.ctx;
    if (!ctx) return;

    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = this.toneFreq;
    this.toneFilter.Q.value = 0.7;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.delayNode = ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.19;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.35;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = this.echoLevel;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.createImpulseResponse(ctx);
    this.tunnelWet = ctx.createGain();
    this.tunnelWet.gain.value = this.tunnelLevel;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.volCurve(this.volume);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -0.3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;

    this.toneFilter.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    this.toneFilter.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);

    this.toneFilter.connect(this.convolver);
    this.convolver.connect(this.tunnelWet);
    this.tunnelWet.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.radioGate = ctx.createGain();
    this.radioGate.gain.value = 0;
    this.radioGate.connect(this.masterGain);
  }

  public async ensureStarted(): Promise<void> {
    this.unlock();
    if (!this.startPromise) {
      this.startPromise = this.initDSP().catch((err) => {
        this.startPromise = null;
        throw err;
      });
    }
    await this.startPromise;
  }

  private async initDSP(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.toneFilter) return;

    const inline = getInlineAssets();
    let node: AudioNode | null = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      let blobUrl: string | null = null;
      try {
        if (inline?.workletCode) {
          blobUrl = URL.createObjectURL(
            new Blob([inline.workletCode], { type: 'application/javascript' })
          );
          await ctx.audioWorklet.addModule(blobUrl);
        } else {
          await ctx.audioWorklet.addModule('hazard-worklet.js');
        }
        const wn = new AudioWorkletNode(ctx, 'hazard-synth', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        wn.port.onmessage = (e) => this.handleStat(e.data as SynthMessage);
        this.sendFn = (m, tr) => wn.port.postMessage(m, tr || []);
        node = wn;
      } catch {
        node = null;
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    }

    if (!node) {
      const win = window as unknown as { HazardSynth?: new (sr: number) => HazardSynthInstance };
      if (!win.HazardSynth) {
        if (inline?.workletCode) {
          const s = document.createElement('script');
          s.textContent = inline.workletCode;
          document.head.appendChild(s);
        } else {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = 'hazard-worklet.js';
            s.onload = () => res();
            s.onerror = () => rej(new Error('Failed to load hazard-worklet.js'));
            document.head.appendChild(s);
          });
        }
      }
      if (win.HazardSynth) {
        const syn = new win.HazardSynth(ctx.sampleRate);
        syn.onStat = (m) => this.handleStat(m);
        const sp = ctx.createScriptProcessor(1024, 1, 1);
        const blk = new Float32Array(128);
        sp.onaudioprocess = (e) => {
          const out = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < out.length; i += 128) {
            syn.render(blk);
            out.set(blk, i);
          }
        };
        this.sendFn = (m) => syn.message(m);
        node = sp;
      }
    }

    if (node) {
      node.connect(this.toneFilter);
      this.workletNode = node;
    }

    await this.loadHazardSamples();
    this.ready = true;
    this.pushState();
    this.emit();
  }

  private async loadHazardSamples(): Promise<void> {
    if (!this.ctx || !this.sendFn) return;
    const inline = getInlineAssets();
    try {
      const meta = inline?.meta
        ? inline.meta
        : ((await (await fetch('sounds/meta.json', { cache: 'force-cache' })).json()) as Record<
            string,
            MetaEntry
          >);
      const names = ['wail', 'yelp', 'phaser', 'horn', 'tone'] as const;
      let ok = 0;

      await Promise.all(
        names.map(async (name) => {
          try {
            let ab: ArrayBuffer;
            if (inline?.wavBase64?.[name]) {
              ab = base64ToArrayBuffer(inline.wavBase64[name]);
            } else {
              const res = await fetch(`sounds/${name}.wav`, { cache: 'force-cache' });
              if (!res.ok) return;
              ab = await res.arrayBuffer();
            }
            const decoded = await this.ctx!.decodeAudioData(ab.slice(0));
            const pcm = new Float32Array(decoded.getChannelData(0));
            const m = meta[name] || {};
            this.sendFn?.(
              {
                type: 'sample',
                name,
                pcm,
                loopStart: m.loopStart || 0,
                track: m.track,
                step: m.trackStep,
                hz: m.hz,
              },
              [pcm.buffer]
            );
            ok++;
            this.loadedCount++;
            this.emit();
          } catch {
            // Individual sample fallback handled cleanly by DSP
          }
        })
      );

      this.recReady = ok === names.length;
      this.sendFn({ type: 'source', id: this.recReady ? 'rec' : 'synth' });

      // Load wolf.wav in background
      if (inline?.wavBase64?.wolf) {
        try {
          const decoded = await this.ctx.decodeAudioData(base64ToArrayBuffer(inline.wavBase64.wolf));
          const pcm = new Float32Array(decoded.getChannelData(0));
          this.sendFn?.({ type: 'wolfData', pcm }, [pcm.buffer]);
          this.loadedCount++;
          this.emit();
        } catch {
          // Ignore
        }
      } else {
        fetch('sounds/wolf.wav', { cache: 'force-cache' })
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab.slice(0)) : null))
          .then((decoded) => {
            if (!decoded) return;
            const pcm = new Float32Array(decoded.getChannelData(0));
            this.sendFn?.({ type: 'wolfData', pcm }, [pcm.buffer]);
            this.loadedCount++;
            this.emit();
          })
          .catch(() => {});
      }
    } catch {
      this.sendFn({ type: 'source', id: 'synth' });
    }
  }

  private handleStat(m: SynthMessage) {
    if (m.type !== 'stat') return;
    const f = typeof m.f === 'number' ? m.f : 0;
    const horn = Boolean(m.horn);
    const wolf = Boolean(m.wolf);
    if (f !== this.currentHz || horn !== this.currentHorn || wolf !== this.currentWolf) {
      this.currentHz = f;
      this.currentHorn = horn;
      this.currentWolf = wolf;
      this.emit();
    }
  }

  private getEffectiveTone(): number {
    if (!this.powered) return 0;
    if (this.mode === 'hilo') return this.altActive ? TONE_CODE.wail : TONE_CODE.hilo;
    if (this.mode === 'yelp') return this.altActive ? TONE_CODE.phaser : TONE_CODE.yelp;
    if (this.mode === 'wail') return this.altActive ? TONE_CODE.yelp : TONE_CODE.wail;
    return TONE_CODE[this.mode] || 0;
  }

  private getManRole(): 'off' | 'manual' | 'pa' | 'wolf' {
    if (!this.powered) return 'off';
    if (this.mode === 'pa') return 'pa';
    if (this.mode === 'standby' || this.mode === 'radio') {
      return this.manStyle === 'wolf' ? 'wolf' : 'manual';
    }
    return 'off';
  }

  private pushState() {
    if (!this.ready || !this.sendFn) return;
    const role = this.getManRole();
    const mute = (this.pttHeld && !!this.micStream) || this.activePhrase !== null;
    this.sendFn({
      type: 'state',
      s: {
        power: this.powered,
        tone: this.getEffectiveTone(),
        horn: this.hornHeld,
        mute,
        man: role === 'wolf' ? 'off' : role,
        manHeld: this.manHeld,
      },
    });

    const manSounds = this.manHeld && role !== 'off';
    if (this.ctx && this.radioGate) {
      this.ramp(
        this.radioGate.gain,
        this.powered && this.mode === 'radio' && !mute && !this.hornHeld && !manSounds ? 1 : 0,
        0.06
      );
    }
    if (this.ctx && this.micGate) {
      this.ramp(this.micGate.gain, mute ? 1 : 0, 0.01);
    }
    if (this.mode === 'radio' && this.powered) this.ensureRadio();
    else this.stopRadio();
  }

  private ramp(param: AudioParam, value: number, time = 0.015) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + time);
  }

  public playClick(strong = false): void {
    if (!this.beepEnabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(strong ? 1600 : 1200, t);
    o.frequency.exponentialRampToValueAtTime(340, t + 0.016);
    g.gain.setValueAtTime(strong ? 0.16 : 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    o.connect(g);
    g.connect(this.masterGain);
    o.start(t);
    o.stop(t + 0.022);
  }

  public async setPower(on: boolean): Promise<void> {
    await this.ensureStarted();
    this.powered = on;
    this.altActive = false;
    if (!on) {
      this.hornHeld = false;
      this.manHeld = false;
      this.pttHeld = false;
      this.mode = 'standby';
      this.stopPhrase(true);
      this.sendFn?.({ type: 'wolfStop' });
    } else {
      this.playClick(true);
    }
    this.pushState();
    this.emit();
  }

  public async setMode(nextMode: SirenMode): Promise<void> {
    await this.ensureStarted();
    if (!this.powered) {
      this.powered = true;
    }
    if (this.mode === nextMode && nextMode !== 'standby') {
      nextMode = 'standby';
    }
    this.mode = nextMode;
    this.altActive = false;
    this.playClick(true);
    this.pushState();
    this.emit();
  }

  public async pressMan(): Promise<void> {
    await this.ensureStarted();
    if (!this.powered) this.powered = true;

    const isPrimarySiren = this.mode === 'hilo' || this.mode === 'yelp' || this.mode === 'wail';
    if (isPrimarySiren) {
      if (this.manSiren === 'toggle') {
        this.altActive = !this.altActive;
      } else {
        this.altActive = true;
      }
      this.manHeld = true;
      this.playClick(false);
      this.pushState();
      this.emit();
      return;
    }

    const wasHeld = this.manHeld;
    this.manHeld = true;
    const role = this.getManRole();
    if (role === 'wolf' && !wasHeld && !this.pttHeld) {
      this.sendFn?.({ type: 'wolf' });
    }
    this.pushState();
    this.emit();
  }

  public releaseMan(): void {
    if (!this.manHeld) return;
    this.manHeld = false;
    const isPrimarySiren = this.mode === 'hilo' || this.mode === 'yelp' || this.mode === 'wail';
    if (isPrimarySiren && this.manSiren === 'hold') {
      this.altActive = false;
    }
    this.pushState();
    this.emit();
  }

  public async pressHorn(): Promise<void> {
    await this.ensureStarted();
    if (!this.powered) this.powered = true;
    this.hornHeld = true;
    this.pushState();
    this.emit();
  }

  public releaseHorn(): void {
    if (!this.hornHeld) return;
    this.hornHeld = false;
    this.pushState();
    this.emit();
  }

  public async startMic(): Promise<boolean> {
    await this.ensureStarted();
    if (!navigator.mediaDevices?.getUserMedia || !this.ctx || !this.masterGain) return false;
    try {
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 1 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        const src = this.ctx.createMediaStreamSource(this.micStream);
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 320;
        hp.Q.value = 0.9;
        const pres = this.ctx.createBiquadFilter();
        pres.type = 'peaking';
        pres.frequency.value = 2200;
        pres.Q.value = 0.9;
        pres.gain.value = 6;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4200;
        lp.Q.value = 0.8;

        this.micGain = this.ctx.createGain();
        this.micGain.gain.value = Math.pow(10, this.micDb / 20);

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 6;
        comp.ratio.value = 12;

        this.micGate = this.ctx.createGain();
        this.micGate.gain.value = 0;

        const out = this.ctx.createGain();
        out.gain.value = 1.3;

        src.connect(hp);
        hp.connect(pres);
        pres.connect(lp);
        lp.connect(this.micGain);
        this.micGain.connect(comp);
        comp.connect(this.micGate);
        this.micGate.connect(out);
        out.connect(this.masterGain);

        this.micAnalyser = this.ctx.createAnalyser();
        this.micAnalyser.fftSize = 256;
        src.connect(this.micAnalyser);
        this.micNodes = [src, hp, pres, lp, this.micGain, comp, this.micGate, out];
      }
      this.pttHeld = true;
      this.pushState();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  public stopMic(): void {
    this.pttHeld = false;
    this.pushState();
    this.emit();
  }

  public disableMic(): void {
    this.pttHeld = false;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
    }
    this.micNodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        // Ignore
      }
    });
    this.micStream = null;
    this.micNodes = [];
    this.micGain = null;
    this.micGate = null;
    this.micAnalyser = null;
    this.pushState();
    this.emit();
  }

  public async loadRadioFile(file: File): Promise<void> {
    await this.ensureStarted();
    if (!this.ctx) return;
    const ab = await file.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(ab.slice(0));
    this.stopRadio();
    this.radioBuffer = buf;
    this.radioName = file.name.replace(/\.[^.]+$/, '');
    if (this.mode === 'radio' && this.powered) this.ensureRadio();
    this.emit();
  }

  public clearRadioFile(): void {
    this.stopRadio();
    this.radioBuffer = null;
    this.radioName = null;
    this.emit();
  }

  private ensureRadio() {
    if (this.radioSrc || !this.radioBuffer || !this.ctx || !this.radioGate) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.radioBuffer;
    s.loop = true;
    s.connect(this.radioGate);
    s.start();
    this.radioSrc = s;
  }

  private stopRadio() {
    if (!this.radioSrc || !this.ctx) return;
    const s = this.radioSrc;
    this.radioSrc = null;
    try {
      s.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Ignore
    }
  }

  private async decodePhrase(id: PhraseId): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const cached = this.phraseBuffers.get(id);
    if (cached) return cached;
    const inline = getInlineAssets();
    let ab: ArrayBuffer | null = null;
    if (inline?.phrasesBase64?.[id]) {
      ab = base64ToArrayBuffer(inline.phrasesBase64[id]);
    } else {
      const res = await fetch(`sounds/phrases/${id}.mp3`, { cache: 'force-cache' });
      if (!res.ok) return null;
      ab = await res.arrayBuffer();
    }
    const decoded = await this.ctx.decodeAudioData(ab.slice(0));
    this.phraseBuffers.set(id, decoded);
    return decoded;
  }

  public async playPhrase(id: PhraseId): Promise<void> {
    await this.ensureStarted();
    if (!this.ctx || !this.masterGain) return;
    if (this.activePhrase === id) {
      this.stopPhrase();
      return;
    }
    this.stopPhrase(true);
    if (!this.powered) {
      this.powered = true;
    }
    this.activePhrase = id;
    this.playClick(true);
    this.pushState();
    this.emit();

    try {
      const buf = await this.decodePhrase(id);
      if (!buf || this.activePhrase !== id || !this.ctx || !this.masterGain) {
        if (this.activePhrase === id) {
          this.activePhrase = null;
          this.pushState();
          this.emit();
        }
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      // Subtle СГУ speaker presence (preserves natural human voice while sounding like an outside PA horn)
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 240;
      const pres = this.ctx.createBiquadFilter();
      pres.type = 'peaking';
      pres.frequency.value = 2100;
      pres.Q.value = 0.85;
      pres.gain.value = 4;
      const boost = this.ctx.createGain();
      boost.gain.value = 1.15;

      src.connect(hp);
      hp.connect(pres);
      pres.connect(boost);
      boost.connect(this.masterGain);

      src.onended = () => {
        if (this.phraseSrc === src) {
          this.phraseSrc = null;
          this.activePhrase = null;
          this.pushState();
          this.emit();
        }
      };

      this.phraseSrc = src;
      src.start();
    } catch {
      this.phraseSrc = null;
      this.activePhrase = null;
      this.pushState();
      this.emit();
    }
  }

  public stopPhrase(silent = false): void {
    if (this.phraseSrc) {
      const s = this.phraseSrc;
      this.phraseSrc = null;
      try {
        s.onended = null;
        s.stop();
      } catch {
        // Ignore
      }
    }
    if (this.activePhrase !== null) {
      this.activePhrase = null;
      if (!silent) {
        this.pushState();
        this.emit();
      }
    }
  }

  public async stopAll(): Promise<void> {
    await this.ensureStarted();
    this.mode = 'standby';
    this.altActive = false;
    this.manHeld = false;
    this.hornHeld = false;
    this.pttHeld = false;
    this.stopPhrase(true);
    this.sendFn?.({ type: 'wolfStop' });
    this.sendFn?.({ type: 'reset' });
    this.pushState();
    this.emit();
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain) {
      this.ramp(this.masterGain.gain, this.volCurve(this.volume), 0.045);
    }
  }

  public setEcho(v: number) {
    this.echoLevel = Math.max(0, Math.min(0.8, v));
    if (this.ctx && this.delayWet) {
      this.ramp(this.delayWet.gain, this.echoLevel, 0.03);
    }
  }

  public setTunnel(v: number) {
    this.tunnelLevel = Math.max(0, Math.min(0.8, v));
    if (this.ctx && this.tunnelWet) {
      this.ramp(this.tunnelWet.gain, this.tunnelLevel, 0.03);
    }
  }

  public setTone(freq: number) {
    this.toneFreq = Math.max(800, Math.min(6000, freq));
    if (this.ctx && this.toneFilter) {
      this.ramp(this.toneFilter.frequency, this.toneFreq, 0.03);
    }
  }

  public setManStyle(style: 'siren' | 'wolf') {
    this.manStyle = style;
    this.pushState();
  }

  public setManSiren(mode: 'toggle' | 'hold') {
    this.manSiren = mode;
    if (mode === 'hold' && !this.manHeld) {
      this.altActive = false;
      this.pushState();
      this.emit();
    }
  }

  public setMicDb(db: number) {
    this.micDb = db;
    if (this.micGain && this.ctx) {
      this.ramp(this.micGain.gain, Math.pow(10, db / 20), 0.04);
    }
  }

  public setBeepEnabled(on: boolean) {
    this.beepEnabled = on;
  }

  public getMeterLevel(): number {
    if (!this.analyser || !this.powered) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i += 4) {
      sum += this.analyserBuf[i] * this.analyserBuf[i];
    }
    const rms = Math.sqrt(sum / (this.analyserBuf.length / 4));
    return Math.min(10, Math.round(rms * 14));
  }

  public getSnapshot(): EngineSnapshot {
    return {
      powered: this.powered,
      mode: this.mode,
      altActive: this.altActive,
      hz: this.powered ? this.currentHz : 0,
      hornActive: this.currentHorn,
      wolfActive: this.currentWolf,
      loadedCount: this.loadedCount,
      totalCount: this.totalCount,
      audioState: this.ctx ? (this.ctx.state as EngineSnapshot['audioState']) : 'uninitialized',
      sessionType: this.getSessionSupport(),
      micOn: !!this.micStream,
      radioName: this.radioName,
      activePhrase: this.activePhrase,
    };
  }

  private emit() {
    this.onStateChange?.(this.getSnapshot());
  }
}
