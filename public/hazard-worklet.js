(function (root) {
  'use strict';

  // Exact Premier Hazard 7007 & K-13 patterns calibrated directly to the reference video
  // - WAIL:   smooth 520 <-> 1800 Hz (4.5s up / 4.1s down)
  // - YELP:   smooth 540 <-> 1780 Hz (~3.05 cycles/sec, zero-seam continuous sweep)
  // - HILO:   clean European two-tone 665 / 1095 Hz (0.545s step)
  // - PULSAR: crisp 710 <-> 1690 Hz trill (~19 Hz)
  const PAT = {
    wail:   { lo: 520, hi: 1800, up: 4.50,  down: 4.10,  smooth: 0.045,  a: 505, b: 1820 },
    yelp:   { lo: 540, hi: 1780, up: 0.162, down: 0.168, smooth: 0.004,  a: 520, b: 1805 },
    hilo:   { hi: 1095, lo: 665, half: 0.545, smooth: 0.003 },
    phaser: { lo: 710, hi: 1690, up: 0.025, down: 0.027, smooth: 0.0018, a: 690, b: 1710 },
  };

  // T: 0=OFF, 1=WAIL, 2=YELP, 3=HILO, 4=PULSAR
  const TONE_PAT = {
    1: 'wail',
    2: 'yelp',
    3: 'hilo',
    4: 'phaser',
  };

  // Smooth manual spin-up (~2.7s 520->1805 Hz) and natural coast-down on release.
  // Pressing MAN again while spinning down above 720 Hz activates crisp PULSAR, stopping cleanly on release.
  const MAN = { start: 520, max: 1805, rise: 660, tau: 1.45, cut: 295, burst: 720 };

  // Build 4096-sample single-cycle phase-continuous Hazard 7007 carrier wavetable
  // Calibrated to the exact measured harmonic profile of real Hazard 7007 & K-13 recordings:
  // h1 = 1.00, h2 = 0.015, h3 = 0.042, h5 = 0.010 -> warm, thick, punchy, ZERO buzz/clipping/aliasing.
  const TABLE_SIZE = 4096;
  const WAVE = new Float32Array(TABLE_SIZE);
  {
    let peak = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const th = (2 * Math.PI * i) / TABLE_SIZE;
      const v =
        1.000 * Math.sin(th) +
        0.015 * Math.sin(2 * th) +
        0.042 * Math.sin(3 * th) +
        0.010 * Math.sin(5 * th);
      WAVE[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const norm = peak > 0 ? 0.86 / peak : 1;
    for (let i = 0; i < TABLE_SIZE; i++) WAVE[i] *= norm;
  }

  function readWave(phase01) {
    const p = (phase01 - Math.floor(phase01)) * TABLE_SIZE;
    const i0 = p | 0;
    const i1 = (i0 + 1) & (TABLE_SIZE - 1);
    const fr = p - i0;
    return WAVE[i0] + (WAVE[i1] - WAVE[i0]) * fr;
  }

  function readLinear(pcm, pos) {
    const len = pcm.length;
    if (len === 0) return 0;
    const i = pos | 0;
    if (i < 0) return pcm[0];
    if (i >= len) return pcm[len - 1];
    const fr = pos - i;
    const a = pcm[i];
    const b = i + 1 < len ? pcm[i + 1] : pcm[0];
    return a + (b - a) * fr;
  }

  // Seamless crossfade loop reader for HORN recording (eliminates loop-seam click/pop)
  function readHornSeamless(pcm, pos, ls) {
    const len = pcm.length;
    if (len === 0) return 0;
    const loopLen = Math.max(64, len - ls);
    const xf = Math.min(loopLen >> 2, 1300);
    const s1 = readLinear(pcm, pos);
    const distToEnd = len - pos;
    if (xf > 16 && distToEnd < xf && pos >= ls) {
      const t = 1 - distToEnd / xf;
      const w1 = Math.cos(t * Math.PI * 0.5);
      const w2 = Math.sin(t * Math.PI * 0.5);
      const wrapPos = ls + (xf - distToEnd);
      const s2 = readLinear(pcm, wrapPos);
      return s1 * w1 + s2 * w2;
    }
    return s1;
  }

  class HazardSynth {
    constructor(sr) {
      this.sr = sr;
      this.s = { power: false, tone: 0, man: 'off', manHeld: false, horn: false, mute: false };
      this.sgu = 'hazard';
      this.rec = {};

      this.ph = 0;
      this.f = 0;
      this.tf = 0;
      this.f1 = 0;
      this.dir = 1;
      this.mode = 'idle';
      this.pat = null;
      this.patName = '';
      this.hiloT = 0;
      this.mf = 0;
      this.trill = false;
      this.amp = 0;
      this.wasFalling = false;
      this.manWasHeld = false;
      this.shortT = -1;
      this.cutFade = false;

      this.hg = 0;
      this.hornWas = false;
      this.hornPos = 0;
      this.hornLp = 0; // gentle smoothing filter removes harsh clipping edges in horn.wav
      this.wolf = null;
      this.wolfPos = -1;
      this.wolfGain = 1;
      this.gm = 1;

      const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
      this.kAmp = k(0.004);
      this.kAmpOff = k(0.012);
      this.kAmpCut = k(0.009); // crisp ~25-35ms fade-out after PULSAR release (exact 22.06s video cutoff)
      this.kHornOn = k(0.003);
      this.kHornOff = k(0.016);
      this.kHornLp = k(1 / (2 * Math.PI * 2600));
      this.kMute = k(0.004);
      this.kMan = k(0.005);

      this.statN = 0;
      this.statPeak = 0;
      this.onStat = null;
    }

    get useRec() {
      // Siren carrier is always ready phase-continuously; horn/wolf use decoded WAVs
      return true;
    }

    message(m) {
      if (!m) return;
      if (m.type === 'state') {
        Object.assign(this.s, m.s);
      } else if (m.type === 'sgu') {
        this.sgu = m.id === 'k13' ? 'k13' : 'hazard';
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          hz: m.hz && m.hz > 20 ? m.hz : 904.4,
        };
      } else if (m.type === 'wolfData') {
        const pcm = m.pcm;
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
        this.wolf = pcm;
        this.wolfGain = peak > 0 ? 0.9 / peak : 1;
      } else if (m.type === 'wolf') {
        if (this.wolf) this.wolfPos = 0;
      } else if (m.type === 'wolfStop') {
        this.wolfPos = -1;
      } else if (m.type === 'short') {
        this.shortT = 0;
      } else if (m.type === 'reset') {
        this.reset();
      }
    }

    reset() {
      this.mode = 'idle';
      this.mf = 0;
      this.trill = false;
      this.wasFalling = false;
      this.manWasHeld = false;
      this.wolfPos = -1;
      this.shortT = -1;
      this.cutFade = false;
    }

    enterPat(name, fromSilence) {
      const p = PAT[name] || PAT.wail;
      this.pat = p;
      this.patName = name;
      this.cutFade = false;
      if (name === 'hilo') {
        this.hiloT = 0;
        this.tf = p.hi;
        if (fromSilence) this.f = this.f1 = p.hi;
      } else if (fromSilence) {
        this.tf = this.f = this.f1 = p.lo;
        this.dir = 1;
      } else {
        this.tf = this.f > 0 ? this.f : p.lo;
        this.f1 = this.tf;
      }
      this.mode = 'pat';
    }

    control(blockDur) {
      const s = this.s;
      const silent = this.amp < 0.015;
      if (!s.power) {
        if (this.mode !== 'idle') this.reset();
        this.trill = false;
        this.manWasHeld = false;
        return 0;
      }

      // K-13 SHORT quick chirp (~0.25s crisp upward chirp)
      if (this.shortT >= 0) {
        this.shortT += blockDur;
        if (this.shortT > 0.25) {
          this.shortT = -1;
          this.cutFade = true;
        } else {
          this.cutFade = false;
          return 4;
        }
      }

      // Active automatic siren pattern (WAIL / YELP / HILO / PULSAR)
      if (s.tone) {
        const name = TONE_PAT[s.tone] || 'wail';
        if (this.mode !== 'pat' || this.patName !== name) {
          this.enterPat(name, silent || this.mode === 'idle');
        }
        this.trill = false;
        this.wasFalling = false;
        this.manWasHeld = s.manHeld;
        this.cutFade = false;
        return 1;
      }

      // Dedicated hold-only PULSAR key (K-13 PULSAR button): starts immediately and stops cleanly on release
      if (s.man === 'pulsar') {
        if (s.manHeld) {
          if (!this.trill || this.patName !== 'phaser') {
            this.trill = true;
            this.enterPat('phaser', silent);
            this.tf = Math.max(PAT.phaser.lo, this.f || PAT.phaser.lo);
            this.dir = 1;
          }
          this.wasFalling = false;
          this.manWasHeld = true;
          this.cutFade = false;
          return 1;
        }
        if (this.trill) {
          this.trill = false;
          this.mf = 0;
          this.wasFalling = false;
          this.mode = 'idle';
          this.cutFade = true;
        }
        this.manWasHeld = false;
        return 0;
      }

      // STANDBY / PA / RADIO mode:
      // - 1st MAN hold smoothly sweeps 520 -> 1805 Hz, release smoothly coasts down
      // - 2nd MAN press while spinning down above 720 Hz catches into crisp PULSAR, stopping cleanly on release!
      if (this.mode === 'pat' && !this.trill) {
        this.mf = silent ? 0 : this.f;
        this.mode = 'manual';
      }
      if (this.mode === 'idle') this.mode = 'manual';

      if ((s.man === 'manual' || s.man === 'pa') && s.manHeld) {
        if (!this.manWasHeld && this.wasFalling && this.mf >= MAN.burst) {
          this.trill = true;
          this.enterPat('phaser', false);
        }
        this.manWasHeld = true;
        this.cutFade = false;
        if (this.trill) {
          return 1;
        }
        this.wasFalling = false;
        return 2;
      }

      // Releasing PULSAR stops cleanly within ~35ms (exact 22.06s Hazard 7007 video behavior)
      if (this.trill) {
        this.trill = false;
        this.mf = 0;
        this.wasFalling = false;
        this.mode = 'idle';
        this.manWasHeld = false;
        this.cutFade = true;
        return 0;
      }

      this.manWasHeld = false;
      this.cutFade = false;
      this.wasFalling = this.mf > 380;
      return 3;
    }

    render(out) {
      const n = out.length;
      const sr = this.sr;
      const s = this.s;
      const dt = 1 / sr;
      const how = this.control(n * dt);

      const muteT = s.mute || !s.power ? 0 : 1;
      const hornT = s.power && s.horn && !s.mute ? 1 : 0;
      if (hornT && !this.hornWas) {
        this.hornPos = 0;
        this.hornLp = 0;
      }
      this.hornWas = !!hornT;

      const decay = Math.exp(-dt / MAN.tau);
      const ks = how === 1 && this.pat ? 1 - Math.exp(-dt / this.pat.smooth) : 0;
      const hornR = this.rec.horn;
      const hornPitch = this.sgu === 'k13' ? 1.03 : 1.0;

      let peak = 0;

      for (let i = 0; i < n; i++) {
        let ampT = 0;
        if (how === 1) {
          const p = this.pat;
          if (this.patName === 'hilo') {
            this.hiloT += dt;
            if (this.hiloT >= p.half) {
              this.hiloT -= p.half;
              this.tf = this.tf === p.hi ? p.lo : p.hi;
            }
          } else if (this.dir > 0) {
            this.tf *= Math.pow(p.b / p.a, dt / p.up);
            if (this.tf >= p.b || !Number.isFinite(this.tf)) {
              this.tf = p.b;
              this.dir = -1;
            }
          } else {
            this.tf /= Math.pow(p.b / p.a, dt / p.down);
            if (this.tf <= p.a || !Number.isFinite(this.tf)) {
              this.tf = p.a;
              this.dir = 1;
            }
          }
          this.f1 += (this.tf - this.f1) * ks;
          this.f += (this.f1 - this.f) * ks;
          ampT = 1;
        } else if (how === 2) {
          if (this.mf < MAN.start) this.mf = MAN.start;
          const room = Math.max(0.18, Math.min(1, (MAN.max - this.mf) / 160));
          this.mf = Math.min(MAN.max, this.mf + MAN.rise * dt * room);
          this.f += (this.mf - this.f) * this.kMan;
          ampT = 1;
        } else if (how === 3 && this.mf > 0) {
          this.mf *= decay;
          this.f += (this.mf - this.f) * this.kMan;
          ampT = Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190));
          if (this.mf < MAN.cut * 0.88) {
            this.mf = 0;
            this.wasFalling = false;
          }
        } else if (how === 4) {
          const pNorm = Math.min(1, this.shortT / 0.21);
          this.f = 700 + 960 * Math.sin(pNorm * Math.PI * 0.5);
          ampT = this.shortT < 0.20 ? 1 : Math.max(0, 1 - (this.shortT - 0.20) / 0.05);
        }

        if (!Number.isFinite(this.f) || this.f < 0) this.f = 0;

        const ampRate =
          ampT > this.amp ? this.kAmp : this.cutFade ? this.kAmpCut : this.kAmpOff;
        this.amp += (ampT - this.amp) * ampRate;

        // Phase-continuous smooth Hazard 7007 / K-13 carrier wave (zero wrap clicks or clipping)
        let y = 0;
        if (this.amp > 1e-5 && this.f > 40) {
          this.ph += this.f * dt;
          if (this.ph >= 1) this.ph -= Math.floor(this.ph);
          y = readWave(this.ph) * this.amp;
        }

        // Authentic HORN (crossfade-looped & softly lowpass-smoothed to remove clipped rasp/comb artifacts)
        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5 && hornR) {
          const rawH = readHornSeamless(hornR.pcm, this.hornPos, hornR.ls);
          this.hornLp += (rawH - this.hornLp) * this.kHornLp;
          const h = this.hornLp * 0.92;
          const loopLen = Math.max(1, hornR.pcm.length - hornR.ls);
          this.hornPos += hornPitch;
          if (this.hornPos >= hornR.pcm.length) {
            this.hornPos = hornR.ls + ((this.hornPos - hornR.pcm.length) % loopLen);
          }
          y = y * (1 - this.hg) + h * this.hg;
        }

        if (this.wolfPos >= 0 && this.wolf) {
          y += this.wolf[this.wolfPos] * this.wolfGain;
          if (++this.wolfPos >= this.wolf.length) this.wolfPos = -1;
        }

        this.gm += (muteT - this.gm) * this.kMute;
        y *= this.gm;
        if (y > 0.96) y = 0.96;
        else if (y < -0.96) y = -0.96;
        out[i] = y;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
      }

      this.statPeak = Math.max(this.statPeak, peak);
      this.statN += n;
      if (this.statN >= sr / 25 && this.onStat) {
        const sounding = this.amp * this.gm > 0.05 && s.power;
        this.onStat({
          type: 'stat',
          f: this.hg > 0.5 ? 0 : sounding ? Math.round(this.f) : 0,
          horn: this.hg > 0.5,
          wolf: this.wolfPos >= 0,
          lvl: this.statPeak,
          rec: true,
        });
        this.statN = 0;
        this.statPeak = 0;
      }
    }
  }

  root.HazardSynth = HazardSynth;

  if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor !== 'undefined') {
    class HazardProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.syn = new HazardSynth(sampleRate);
        this.syn.onStat = (m) => this.port.postMessage(m);
        this.port.onmessage = (e) => this.syn.message(e.data);
      }
      process(inputs, outputs) {
        const out = outputs[0];
        if (out && out[0]) {
          this.syn.render(out[0]);
          for (let c = 1; c < out.length; c++) out[c].set(out[0]);
        }
        return true;
      }
    }
    registerProcessor('hazard-synth', HazardProcessor);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
