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
  | 'fast'
  | 'grach'
  | 'elina'
  | 'smerch'
  | 'bars'
  | 'patriot'
  | 'mega';

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
  mega: 9,
  grach: 10,
  elina: 11,
  smerch: 12,
  bars: 13,
  patriot: 14,
};

export type PhraseId =
  | 'obochina'
  | 'vpravo_stop'
  | 'prizhatsa'
  | 'strelyat'
  | 'ostanavlivaemsya'
  | 'voditel_stop';

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
  private fxGainNode: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf = new Float32Array(1024);
  private clickBuffer: AudioBuffer | null = null;
  private rawWavCache = new Map<string, ArrayBuffer>();
  private metaCache: Record<string, MetaEntry> | null = null;

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
  private manSiren: 'toggle' | 'hold' = 'hold';
  private manHeld = false;
  private hornHeld = false;
  private pttHeld = false;
  private beepEnabled = true;

  private volume = 1.0;
  private fxBoost = 1.0;
  private echoLevel = 0;
  private tunnelLevel = 0;
  private toneFreq = 6000;
  private micDb = 18;
  private sessionType: 'ambient' | 'playback' = 'playback';
  private sguSystem: 'hazard' | 'k13' | 'grach' | 'elina' | 'bars' = 'hazard';

  private currentHz = 0;
  private currentHorn = false;
  private currentWolf = false;

  private phraseBuffers = new Map<PhraseId, AudioBuffer>();
  private phraseSrc: AudioBufferSourceNode | null = null;
  private phraseInput: AudioNode | null = null;
  private phraseToken = 0;
  private activePhrase: PhraseId | null = null;

  private sampleCache: Array<{
    name: string;
    pcm: Float32Array;
    loopStart: number;
    track?: number[];
    step?: number;
    hz?: number;
  }> = [];
  private wolfCache: Float32Array | null = null;
  private workletStatSeen = false;

  private onStateChange?: (snap: EngineSnapshot) => void;
  private onTelemetry?: (hz: number, level: number) => void;

  constructor(
    onStateChange?: (snap: EngineSnapshot) => void,
    onTelemetry?: (hz: number, level: number) => void
  ) {
    this.onStateChange = onStateChange;
    this.onTelemetry = onTelemetry;
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
    const gestureUnlock = () => {
      this.unlock();
    };
    window.addEventListener('touchstart', gestureUnlock, { capture: true, passive: true });
    window.addEventListener('pointerdown', gestureUnlock, { capture: true, passive: true });
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
    const wavNames = ['wail', 'yelp', 'phaser', 'horn', 'tone', 'wolf'] as const;
    const phraseUrls = [
      'sounds/phrases/obochina.mp3',
      'sounds/phrases/vpravo_stop.mp3',
      'sounds/phrases/prizhatsa.mp3',
      'sounds/phrases/strelyat.mp3',
      'sounds/phrases/ostanavlivaemsya.mp3',
      'sounds/phrases/voditel_stop.mp3',
    ];
    await Promise.all([
      fetch('sounds/meta.json')
        .then(async (r) => {
          if (r.ok) this.metaCache = (await r.json()) as Record<string, MetaEntry>;
        })
        .catch(() => {}),
      ...wavNames.map(async (name) => {
        try {
          const r = await fetch(`sounds/${name}.wav`);
          if (r.ok) {
            this.rawWavCache.set(name, await r.arrayBuffer());
          }
        } catch {
          // Offline cache handles it
        }
      }),
      ...phraseUrls.map(async (u) => {
        try {
          await fetch(u);
        } catch {
          // Offline cache handles it
        }
      }),
    ]);
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
      this.applyAudioSession(this.sessionType);
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        try {
          this.ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          this.ctx = new AC();
        }
        this.buildGraph();
        this.ctx.onstatechange = () => this.emit();
      }
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
      // Tiny silent buffer inside gesture wakes iOS Web Audio output cleanly
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate || 44100);
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

    // Gentle subsonic highpass preserves authentic low-mid body of Hazard 7007 recordings
    const hornHp = ctx.createBiquadFilter();
    hornHp.type = 'highpass';
    hornHp.frequency.value = 85;
    hornHp.Q.value = 0.7;

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

    // FX Boost / Maximizer stage allows pushing volume up to 250% MAX cleanly without clipping
    this.fxGainNode = ctx.createGain();
    this.fxGainNode.gain.value = this.fxBoost;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.2;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.0015;
    this.limiter.release.value = 0.06;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;

    // Precompute tiny 4ms physical microswitch impulse click (zero oscillator synthesis)
    const cLen = Math.max(32, Math.floor(ctx.sampleRate * 0.004));
    const cBuf = ctx.createBuffer(1, cLen, ctx.sampleRate);
    const cData = cBuf.getChannelData(0);
    for (let i = 0; i < cLen; i++) {
      cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cLen * 0.28)) * 0.45;
    }
    this.clickBuffer = cBuf;

    this.toneFilter.connect(hornHp);

    hornHp.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    hornHp.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);

    hornHp.connect(this.convolver);
    this.convolver.connect(this.tunnelWet);
    this.tunnelWet.connect(this.masterGain);

    this.masterGain.connect(this.fxGainNode);
    this.fxGainNode.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.radioGate = ctx.createGain();
    this.radioGate.gain.value = 0;
    this.radioGate.connect(this.masterGain);

    // Persistent СГУ speaker presence chain for natural human phrases
    const phraseHp = ctx.createBiquadFilter();
    phraseHp.type = 'highpass';
    phraseHp.frequency.value = 240;
    const phrasePres = ctx.createBiquadFilter();
    phrasePres.type = 'peaking';
    phrasePres.frequency.value = 2100;
    phrasePres.Q.value = 0.85;
    phrasePres.gain.value = 4;
    const phraseBoost = ctx.createGain();
    phraseBoost.gain.value = 1.15;
    phraseHp.connect(phrasePres);
    phrasePres.connect(phraseBoost);
    phraseBoost.connect(this.masterGain);
    this.phraseInput = phraseHp;
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

  private async createScriptProcessorNode(ctx: AudioContext, inline?: InlineAssets): Promise<AudioNode | null> {
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
    if (!win.HazardSynth) return null;
    const syn = new win.HazardSynth(ctx.sampleRate);
    syn.onStat = (m) => this.handleStat(m);
    // 0 inputs is critical on iOS/macOS WebKit so onaudioprocess always fires
    const sp = ctx.createScriptProcessor(1024, 0, 1);
    const blk = new Float32Array(128);
    sp.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i += 128) {
        syn.render(blk);
        out.set(blk, i);
      }
    };
    this.sendFn = (m) => syn.message(m);
    return sp;
  }

  private replayCachedSamples() {
    if (!this.sendFn) return;
    for (const item of this.sampleCache) {
      const copy = new Float32Array(item.pcm);
      this.sendFn(
        {
          type: 'sample',
          name: item.name,
          pcm: copy,
          loopStart: item.loopStart,
          track: item.track,
          step: item.step,
          hz: item.hz,
        },
        [copy.buffer]
      );
    }
    if (this.wolfCache) {
      const wCopy = new Float32Array(this.wolfCache);
      this.sendFn({ type: 'wolfData', pcm: wCopy }, [wCopy.buffer]);
    }
    this.pushState();
  }

  private async initDSP(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.toneFilter) return;

    const inline = getInlineAssets();
    let node: AudioNode | null = null;
    let usingWorklet = false;
    this.workletStatSeen = false;

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
        });
        wn.port.onmessage = (e) => this.handleStat(e.data as SynthMessage);
        this.sendFn = (m, tr) => wn.port.postMessage(m, tr || []);
        node = wn;
        usingWorklet = true;
      } catch {
        node = null;
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    }

    if (!node) {
      node = await this.createScriptProcessorNode(ctx, inline);
    }

    if (node) {
      node.connect(this.toneFilter);
      this.workletNode = node;
    }

    this.ready = true;
    this.sendFn?.({ type: 'sgu', id: this.sguSystem });
    // Decode real recorded WAVs immediately before playing audio so zero synthetic tones emit
    await this.loadHazardSamples();
    this.pushState();
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }
    this.emit();

    // Safari WebKit safety watchdog: if AudioWorklet didn't emit a heartbeat within 500ms, switch to ScriptProcessor
    if (usingWorklet && typeof window !== 'undefined') {
      window.setTimeout(async () => {
        if (this.workletStatSeen || !this.ctx || !this.toneFilter) return;
        try {
          if (this.workletNode) {
            this.workletNode.disconnect();
          }
          const sp = await this.createScriptProcessorNode(this.ctx, inline);
          if (sp) {
            sp.connect(this.toneFilter);
            this.workletNode = sp;
            this.replayCachedSamples();
          }
        } catch {
          // Ignore fallback errors
        }
      }, 500);
    }
  }

  private async loadHazardSamples(): Promise<void> {
    if (!this.ctx || !this.sendFn) return;
    const inline = getInlineAssets();
    try {
      const meta = inline?.meta
        ? inline.meta
        : this.metaCache ?? ((await (await fetch('sounds/meta.json')).json()) as Record<string, MetaEntry>);
      const names = ['wail', 'yelp', 'phaser', 'horn', 'tone'] as const;
      let ok = 0;

      await Promise.all(
        names.map(async (name) => {
          try {
            let ab: ArrayBuffer;
            if (inline?.wavBase64?.[name]) {
              ab = base64ToArrayBuffer(inline.wavBase64[name]);
            } else if (this.rawWavCache.has(name)) {
              ab = this.rawWavCache.get(name)!;
            } else {
              const res = await fetch(`sounds/${name}.wav`);
              if (!res.ok) return;
              ab = await res.arrayBuffer();
            }
            const decoded = await this.ctx!.decodeAudioData(ab.slice(0));
            const raw = decoded.getChannelData(0);
            const pcmCache = new Float32Array(raw);
            const pcmTransfer = new Float32Array(raw);
            const m = meta[name] || {};
            this.sampleCache.push({
              name,
              pcm: pcmCache,
              loopStart: m.loopStart || 0,
              track: m.track,
              step: m.trackStep,
              hz: m.hz,
            });
            this.sendFn?.(
              {
                type: 'sample',
                name,
                pcm: pcmTransfer,
                loopStart: m.loopStart || 0,
                track: m.track,
                step: m.trackStep,
                hz: m.hz,
              },
              [pcmTransfer.buffer]
            );
            ok++;
            this.loadedCount++;
            this.emit();
          } catch {
            // Individual sample fallback
          }
        })
      );

      this.recReady = ok === names.length;

      // Load wolf.wav in background (using pre-cached buffer if available)
      const loadWolf = async () => {
        try {
          let ab: ArrayBuffer | null = null;
          if (inline?.wavBase64?.wolf) {
            ab = base64ToArrayBuffer(inline.wavBase64.wolf);
          } else if (this.rawWavCache.has('wolf')) {
            ab = this.rawWavCache.get('wolf')!;
          } else {
            const r = await fetch('sounds/wolf.wav');
            if (r.ok) ab = await r.arrayBuffer();
          }
          if (!ab || !this.ctx) return;
          const decoded = await this.ctx.decodeAudioData(ab.slice(0));
          const raw = decoded.getChannelData(0);
          this.wolfCache = new Float32Array(raw);
          const pcm = new Float32Array(raw);
          this.sendFn?.({ type: 'wolfData', pcm }, [pcm.buffer]);
          this.loadedCount++;
          this.emit();
        } catch {
          // Ignore
        }
      };
      void loadWolf();
    } catch {
      // Ignore load errors
    }
  }

  private handleStat(m: SynthMessage) {
    if (m.type !== 'stat') return;
    this.workletStatSeen = true;
    const f = typeof m.f === 'number' ? m.f : 0;
    const horn = Boolean(m.horn);
    const wolf = Boolean(m.wolf);
    this.currentHz = f;
    // Notify lightweight LED/Hz meters directly without re-rendering full React tree 25x/sec
    this.onTelemetry?.(this.powered ? f : 0, this.getMeterLevel());
    if (horn !== this.currentHorn || wolf !== this.currentWolf) {
      this.currentHorn = horn;
      this.currentWolf = wolf;
      this.emit();
    }
  }

  public setSguSystem(id: 'hazard' | 'k13' | 'grach' | 'elina' | 'bars') {
    this.sguSystem = id;
    this.sendFn?.({ type: 'sgu', id });
  }

  public async ensureAudioBus(): Promise<{ ctx: AudioContext; destination: AudioNode } | null> {
    await this.ensureStarted();
    if (!this.ctx || !this.masterGain) return null;
    if (this.ctx.state !== 'running') {
      await this.ctx.resume().catch(() => {});
    }
    return { ctx: this.ctx, destination: this.masterGain };
  }

  public async triggerShort(): Promise<void> {
    if (!this.powered) this.powered = true;
    this.pushState();
    this.emit();
    await this.ensureStarted();
    this.playClick(true);
    this.sendFn?.({ type: 'short' });
    this.pushState();
    this.emit();
  }

  private getEffectiveTone(): number {
    if (!this.powered) return 0;
    if (this.altActive) {
      if (this.mode === 'hilo') return TONE_CODE.wail;
      if (this.mode === 'yelp') return TONE_CODE.phaser;
      if (this.mode === 'wail') return TONE_CODE.yelp;
      if (this.mode === 'grach') return TONE_CODE.smerch;
      if (this.mode === 'smerch') return TONE_CODE.grach;
      if (this.mode === 'elina') return TONE_CODE.phaser;
      if (this.mode === 'phaser') return TONE_CODE.elina;
      if (this.mode === 'bars') return TONE_CODE.patriot;
      if (this.mode === 'patriot') return TONE_CODE.bars;
      if (this.mode === 'rumbler') return TONE_CODE.bars;
    }
    return TONE_CODE[this.mode] || 0;
  }

  private isPrimarySirenMode(m: SirenMode): boolean {
    return (
      m !== 'standby' &&
      m !== 'pa' &&
      m !== 'radio'
    );
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
    // Only live PTT microphone mutes the siren output; voice phrases play freely over/alongside active sirens & buttons
    const mute = this.pttHeld && !!this.micStream;
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
    if (!this.beepEnabled || !this.ctx || !this.masterGain || !this.clickBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.clickBuffer;
    const g = this.ctx.createGain();
    g.gain.value = strong ? 0.35 : 0.2;
    src.connect(g);
    g.connect(this.masterGain);
    src.start(0);
  }

  public async setPower(on: boolean): Promise<void> {
    this.powered = on;
    this.altActive = false;
    if (!on) {
      this.hornHeld = false;
      this.manHeld = false;
      this.pttHeld = false;
      this.mode = 'standby';
      this.stopPhrase(true);
      this.sendFn?.({ type: 'wolfStop' });
    }
    this.emit();
    await this.ensureStarted();
    if (this.powered) {
      this.playClick(true);
    }
    this.pushState();
    this.emit();
  }

  public async setMode(nextMode: SirenMode): Promise<void> {
    if (!this.powered) {
      this.powered = true;
    }
    if (this.mode === nextMode && nextMode !== 'standby') {
      nextMode = 'standby';
    }
    this.mode = nextMode;
    this.altActive = false;
    this.pushState();
    this.emit();
    await this.ensureStarted();
    this.playClick(true);
    this.pushState();
    this.emit();
  }

  public async pressMan(): Promise<void> {
    if (!this.powered) this.powered = true;

    const wasHeld = this.manHeld;
    this.manHeld = true;

    if (this.isPrimarySirenMode(this.mode)) {
      if (this.manSiren === 'toggle') {
        this.altActive = !this.altActive;
      } else {
        this.altActive = true;
      }
      this.pushState();
      this.emit();
      await this.ensureStarted();
      this.playClick(false);
      this.pushState();
      this.emit();
      return;
    }

    this.pushState();
    this.emit();
    await this.ensureStarted();
    const role = this.getManRole();
    if (this.manHeld && role === 'wolf' && !wasHeld && !this.pttHeld) {
      this.sendFn?.({ type: 'wolf' });
    }
    this.pushState();
    this.emit();
  }

  public releaseMan(): void {
    if (!this.manHeld) return;
    this.manHeld = false;
    if (this.isPrimarySirenMode(this.mode) && this.manSiren === 'hold') {
      this.altActive = false;
    }
    this.pushState();
    this.emit();
  }

  public async pressHorn(): Promise<void> {
    if (!this.powered) this.powered = true;
    this.hornHeld = true;
    this.pushState();
    this.emit();
    await this.ensureStarted();
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
      const res = await fetch(`sounds/phrases/${id}.mp3`);
      if (!res.ok) return null;
      ab = await res.arrayBuffer();
    }
    const decoded = await this.ctx.decodeAudioData(ab.slice(0));
    this.phraseBuffers.set(id, decoded);
    return decoded;
  }

  public async playPhrase(id: PhraseId): Promise<void> {
    if (this.activePhrase === id) {
      this.phraseToken++;
      this.stopPhrase();
      return;
    }
    const token = ++this.phraseToken;
    this.stopPhrase(true);
    if (!this.powered) {
      this.powered = true;
    }
    this.activePhrase = id;
    this.pushState();
    this.emit();

    await this.ensureStarted();
    if (!this.ctx || !this.phraseInput || this.phraseToken !== token) return;
    this.playClick(true);

    try {
      const buf = await this.decodePhrase(id);
      if (!buf || this.phraseToken !== token || this.activePhrase !== id || !this.ctx || !this.phraseInput) {
        if (this.phraseToken === token && this.activePhrase === id) {
          this.activePhrase = null;
          this.pushState();
          this.emit();
        }
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.phraseInput);

      src.onended = () => {
        try {
          src.disconnect();
        } catch {
          // Ignore
        }
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
      if (this.phraseToken === token) {
        this.phraseSrc = null;
        this.activePhrase = null;
        this.pushState();
        this.emit();
      }
    }
  }

  public stopPhrase(silent = false): void {
    if (this.phraseSrc) {
      const s = this.phraseSrc;
      this.phraseSrc = null;
      try {
        s.onended = null;
        s.stop();
        s.disconnect();
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
    this.phraseToken++;
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
    await this.ensureStarted();
    this.pushState();
    this.emit();
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain) {
      this.ramp(this.masterGain.gain, this.volCurve(this.volume), 0.045);
    }
  }

  public setFxBoost(v: number) {
    this.fxBoost = Math.max(1.0, Math.min(2.5, v));
    if (this.ctx && this.fxGainNode) {
      this.ramp(this.fxGainNode.gain, this.fxBoost, 0.04);
    }
  }

  public setEcho(v: number) {
    this.echoLevel = Math.max(0, Math.min(1.0, v));
    if (this.ctx && this.delayWet) {
      this.ramp(this.delayWet.gain, this.echoLevel, 0.03);
    }
  }

  public setTunnel(v: number) {
    this.tunnelLevel = Math.max(0, Math.min(1.0, v));
    if (this.ctx && this.tunnelWet) {
      this.ramp(this.tunnelWet.gain, this.tunnelLevel, 0.03);
    }
  }

  public setTone(freq: number) {
    this.toneFreq = Math.max(800, Math.min(8000, freq));
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
