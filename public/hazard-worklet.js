(function (root) {
  'use strict';

  // Calibrated directly against reference Hazard 7007 / K-13 / ГИБДД video recordings
  const PAT = {
    wail:    { lo: 520, hi: 1800, up: 4.50,  down: 4.10,  smooth: 0.045,  a: 505,    b: 1820 },
    yelp:    { lo: 530, hi: 1780, up: 0.160, down: 0.170, smooth: 0.004,  a: 505,    b: 1805 },
    phaser:  { lo: 810, hi: 1540, up: 0.024, down: 0.026, smooth: 0.0018, a: 785,    b: 1565 },
    hilo:    { hi: 1095, lo: 665, half: 0.545, smooth: 0.003 },
    fast:    { lo: 620, hi: 1785, up: 1.35,  down: 1.20,  smooth: 0.028,  a: 600,    b: 1805 },
    piercer: { lo: 680, hi: 1780, up: 0.095, down: 0.018, smooth: 0.0015, a: 660,    b: 1800 },
    airraid: { lo: 310, hi: 780,  up: 4.50,  down: 5.50,  smooth: 0.14,   a: 300,    b: 790 },
    rumbler: { lo: 260, hi: 675,  up: 0.145, down: 0.145, smooth: 0.006,  a: 245,    b: 690 },
    grach:   { lo: 560, hi: 1520, up: 0.205, down: 0.185, smooth: 0.004,  a: 538,    b: 1550 },
    elina:   { lo: 540, hi: 1620, up: 0.86,  down: 0.78,  smooth: 0.014,  a: 520,    b: 1650 },
    smerch:  { lo: 650, hi: 1760, up: 0.032, down: 0.024, smooth: 0.0015, a: 625,    b: 1790 },
    bars:    { hi: 960, lo: 495,  half: 0.355, smooth: 0.0025 },
    patriot: { lo: 280, hi: 730,  up: 0.138, down: 0.138, smooth: 0.0055, a: 268,    b: 745 },
  };

  const SGU_HORN = {
    hazard: { pitch: 1.0,  subMix: 0.24 },
    k13:    { pitch: 1.04, subMix: 0.20 },
    grach:  { pitch: 0.80, subMix: 0.30 },
    elina:  { pitch: 1.08, subMix: 0.18 },
    bars:   { pitch: 0.70, subMix: 0.34 },
  };

  // Manual siren sweep: smooth ~2.6s ramp 510->1805 Hz on hold, ~3s smooth wind-down on release,
  // catching MAN again while spinning down above 880 Hz triggers crisp PULSAR trill (exact 7007 video behavior)
  const MAN = { start: 510, max: 1805, rise: 660, tau: 1.42, cut: 295, burst: 880 };

  // T: 0=OFF, 1=WAIL, 2=YELP, 3=HILO, 4=PHASER, 5=FAST, 6=PIERCER, 7=RUMBLER, 8=AIRRAID, 9=MEGA/USA, 10=GRACH, 11=ELINA, 12=SMERCH, 13=BARS, 14=PATRIOT
  const TONE_PAT = {
    1: 'wail',
    2: 'yelp',
    3: 'hilo',
    4: 'phaser',
    5: 'fast',
    6: 'piercer',
    7: 'rumbler',
    8: 'airraid',
    10: 'grach',
    11: 'elina',
    12: 'smerch',
    13: 'bars',
    14: 'patriot',
  };

  const LOOPS = ['yelp'];
  function read(pcm, pos) {
    const len = pcm.length;
    if (len === 0) return 0;
    let p = pos;
    if (p < 0) p = 0;
    const i = p | 0;
    if (i >= len) return pcm[len - 1];
    const fr = p - i;
    const a = pcm[i];
    const b = i + 1 < len ? pcm[i + 1] : pcm[0];
    return a + (b - a) * fr;
  }

  // Seamless crossfaded reader near loop end so horn/siren loops never click or buzz
  function readHornSeamless(pcm, pos, ls) {
    const len = pcm.length;
    if (len === 0) return 0;
    const loopLen = Math.max(64, len - ls);
    const xf = Math.min(loopLen >> 2, 1400); // ~30-60ms smooth crossfade window
    const s1 = read(pcm, pos);
    const distToEnd = len - pos;
    if (xf > 16 && distToEnd < xf && pos >= ls) {
      const t = 1 - distToEnd / xf; // 0 -> 1 as pos approaches len
      const w1 = Math.cos(t * Math.PI * 0.5);
      const w2 = Math.sin(t * Math.PI * 0.5);
      const wrapPos = ls + (xf - distToEnd);
      const s2 = read(pcm, wrapPos);
      return s1 * w1 + s2 * w2;
    }
    return s1;
  }

  const eq = (g) => Math.sin((g * Math.PI) / 2);

  class HazardSynth {
    constructor(sr) {
      this.sr = sr;
      this.s = { power: false, tone: 0, man: 'off', manHeld: false, horn: false, mute: false };
      this.sgu = 'hazard';
      this.rec = {};

      this.ph = 0; this.f = 0; this.tf = 0; this.f1 = 0; this.dir = 1;
      this.mode = 'idle'; this.pat = null; this.patName = '';
      this.hiloT = 0; this.mf = 0; this.trill = false; this.amp = 0;
      this.wasFalling = false;
      this.manWasHeld = false;
      this.usaT = 0;
      this.shortT = -1; // >=0 when K-13 SHORT chirp is active

      this.v = {};
      for (const n of LOOPS.concat(['tone'])) this.v[n] = { pos: 0, g: 0 };
      this.want = null; this.fPrev = 0;

      this.hg = 0; this.hph = 0; this.hc = 0; this.hornWas = false; this.hornPos = 0; this.hornSubPos = 0;
      this.wolf = null; this.wolfPos = -1; this.wolfGain = 1;
      this.gm = 1;

      const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
      this.kAmp = k(0.003); this.kAmpOff = k(0.008);
      this.kHornOn = k(0.002); this.kHornOff = k(0.016);
      this.kMute = k(0.004); this.kMan = k(0.005);
      this.kX = 1 / (0.03 * sr);
      this.statN = 0; this.statPeak = 0; this.onStat = null;
    }

    get useRec() {
      const r = this.rec;
      return !!(r.yelp && r.tone);
    }

    message(m) {
      if (!m) return;
      if (m.type === 'state') {
        const prevTone = this.s.tone;
        Object.assign(this.s, m.s);
        if (this.s.tone === 9 && prevTone !== 9) this.usaT = 0;
      } else if (m.type === 'sgu') {
        this.sgu = SGU_HORN[m.id] ? m.id : 'hazard';
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          track: m.track || null,
          stepS: (m.step || 0.02) * this.sr,
          hz: m.hz && m.hz > 20 ? m.hz : 904.4,
        };
      } else if (m.type === 'wolfData') {
        const pcm = m.pcm;
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
        this.wolf = pcm;
        this.wolfGain = peak > 0 ? 0.94 / peak : 1;
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
      this.usaT = 0;
    }

    trackF(name, pos) {
      const r = this.rec[name];
      const t = r && r.track;
      if (!t) return this.f;
      const x = pos / r.stepS;
      const i = Math.min(t.length - 1, x | 0);
      const j = (i + 1) % t.length;
      return t[i] + (t[j] - t[i]) * (x - i);
    }

    findPos(name, f, dir) {
      const r = this.rec[name];
      const t = r && r.track;
      if (!t) return 0;
      let best = 0;
      let cost = 1e9;
      for (let i = 0; i < t.length; i++) {
        const d = t[(i + 1) % t.length] - t[i];
        const c = Math.abs(t[i] - f) + ((d >= 0 ? 1 : -1) !== dir ? 250 : 0);
        if (c < cost) { cost = c; best = i; }
      }
      return best * r.stepS;
    }

    enterPat(name, fromSilence) {
      const p = PAT[name];
      this.pat = p;
      this.patName = name;
      if (name === 'hilo' || name === 'bars') {
        this.hiloT = 0;
        this.tf = p.hi;
        if (fromSilence) this.f = this.f1 = p.hi;
      } else if (fromSilence) {
        this.tf = this.f = this.f1 = p.lo;
        this.dir = 1;
      } else {
        this.tf = this.f;
        this.f1 = this.f;
      }
      this.mode = 'pat';
    }

    control(blockDur) {
      const s = this.s;
      const silent = this.amp < 0.02;
      if (!s.power) {
        if (this.mode !== 'idle') this.reset();
        this.trill = false;
        this.manWasHeld = false;
        return 0;
      }

      // K-13 SHORT quick chirp override while active (~0.24s)
      if (this.shortT >= 0) {
        this.shortT += blockDur;
        if (this.shortT > 0.26) {
          this.shortT = -1;
        } else {
          return 4;
        }
      }

      if (s.tone) {
        let name = TONE_PAT[s.tone];
        if (s.tone === 9) {
          this.usaT = (this.usaT + blockDur) % 10.5;
          name = this.usaT < 3.5 ? 'wail' : this.usaT < 6.0 ? 'yelp' : this.usaT < 8.3 ? 'grach' : 'phaser';
        }
        if (this.mode !== 'pat' || this.patName !== name) {
          this.enterPat(name, silent || this.mode === 'idle');
        }
        this.trill = false;
        this.wasFalling = false;
        this.manWasHeld = s.manHeld;
        return 1;
      }

      // PA mode: holding MAN triggers instant crisp PULSAR trill, releasing coasts down smoothly
      if (s.man === 'pa') {
        if (s.manHeld) {
          if (!this.trill) {
            this.trill = true;
            this.enterPat('phaser', silent);
            this.tf = Math.max(PAT.phaser.lo, this.f || PAT.phaser.lo);
            this.dir = 1;
          }
          this.wasFalling = false;
          this.manWasHeld = true;
          return 1;
        }
        if (this.trill || this.mode === 'pat') {
          this.mf = Math.max(this.f, 1180);
          this.trill = false;
          this.mode = 'manual';
        }
        this.wasFalling = this.mf > 380;
        this.manWasHeld = false;
        return 3;
      }

      // STANDBY / RADIO mode: smooth manual wind-up; double-tap/re-catch while winding down above 880 Hz triggers PULSAR
      if (this.mode === 'pat' && !this.trill) {
        this.mf = silent ? 0 : this.f;
        this.mode = 'manual';
      }
      if (this.mode === 'idle') this.mode = 'manual';

      if (s.man === 'manual' && s.manHeld) {
        if (!this.manWasHeld && this.wasFalling && this.mf >= MAN.burst) {
          this.trill = true;
          this.enterPat('phaser', false);
        }
        this.manWasHeld = true;
        if (this.trill) {
          return 1;
        }
        this.wasFalling = false;
        return 2;
      }

      if (this.trill) {
        this.mf = Math.max(this.f, 1180);
        this.trill = false;
        this.mode = 'manual';
      }
      this.manWasHeld = false;
      this.wasFalling = this.mf > 380;
      return 3;
    }

    render(out) {
      const n = out.length, sr = this.sr, s = this.s, dt = 1 / sr;
      const how = this.control(n * dt);
      const rec = this.useRec;
      const muteT = s.mute || !s.power ? 0 : 1;
      const hornT = s.power && s.horn && !s.mute ? 1 : 0;
      if (hornT && !this.hornWas) {
        this.hph = 0;
        this.hornPos = 0;
        this.hornSubPos = 0;
      }
      this.hornWas = !!hornT;

      const decay = Math.exp(-dt / MAN.tau);
      const ks = how === 1 && this.pat ? 1 - Math.exp(-dt / this.pat.smooth) : 0;

      const isLoopRec = this.patName === 'yelp';
      const loopName = rec && how === 1 && isLoopRec ? this.patName : null;
      const toneOn = rec && (how === 2 || how === 3 || how === 4 || (how === 1 && !isLoopRec));

      if (loopName !== this.want) {
        if (loopName) {
          const dirS = this.f >= this.fPrev ? 1 : -1;
          this.v[loopName].pos =
            this.amp < 0.02 || this.v[loopName].g > 0.5
              ? (this.amp < 0.02 ? 0 : this.v[loopName].pos)
              : this.findPos(loopName, this.f, dirS);
        }
        this.want = loopName;
      }
      this.fPrev = this.f;

      const R = this.rec, V = this.v;
      const tone = R.tone, toneV = V.tone, hornR = R.horn;
      const sh = SGU_HORN[this.sgu] || SGU_HORN.hazard;
      let peak = 0;

      for (let i = 0; i < n; i++) {
        let ampT = 0;
        if (how === 1) {
          if (loopName) {
            this.f = this.trackF(loopName, V[loopName].pos);
          } else {
            const p = this.pat;
            if (this.patName === 'hilo' || this.patName === 'bars') {
              this.hiloT += dt;
              if (this.hiloT >= p.half) {
                this.hiloT -= p.half;
                this.tf = this.tf === p.hi ? p.lo : p.hi;
              }
            } else if (this.dir > 0) {
              this.tf *= Math.pow(p.b / p.a, dt / p.up);
              if (this.tf >= p.b || !Number.isFinite(this.tf)) { this.tf = p.b; this.dir = -1; }
            } else {
              this.tf /= Math.pow(p.b / p.a, dt / p.down);
              if (this.tf <= p.a || !Number.isFinite(this.tf)) { this.tf = p.a; this.dir = 1; }
            }
            this.f1 += (this.tf - this.f1) * ks;
            this.f += (this.f1 - this.f) * ks;
          }
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
          // K-13 SHORT crisp rising chirp (700 -> 1680 Hz)
          const pNorm = Math.min(1, this.shortT / 0.22);
          this.f = 700 + 980 * Math.sin(pNorm * Math.PI * 0.5);
          ampT = this.shortT < 0.21 ? 1 : Math.max(0, 1 - (this.shortT - 0.21) / 0.05);
        }

        if (!Number.isFinite(this.f) || this.f < 0) this.f = 0;
        this.amp += (ampT - this.amp) * (ampT > this.amp ? this.kAmp : this.kAmpOff);

        let y = 0;
        if (rec) {
          for (let k = 0; k < LOOPS.length; k++) {
            const name = LOOPS[k], v = V[name], r = R[name];
            if (!r) continue;
            const t = name === loopName ? 1 : 0;
            if (v.g !== t) v.g = t > v.g ? Math.min(t, v.g + this.kX) : Math.max(t, v.g - this.kX);
            if (v.g > 0) {
              y += read(r.pcm, v.pos) * eq(v.g);
              v.pos += 1;
              if (v.pos >= r.pcm.length) v.pos = r.ls + (v.pos - r.pcm.length);
            }
          }
          const tt = toneOn ? 1 : 0;
          if (toneV.g !== tt) toneV.g = tt > toneV.g ? Math.min(tt, toneV.g + this.kX) : Math.max(tt, toneV.g - this.kX);
          if (toneV.g > 0 && tone) {
            y += read(tone.pcm, toneV.pos) * eq(toneV.g);
            const step = this.f / (tone.hz || 904.4);
            toneV.pos += Number.isFinite(step) && step >= 0 ? step : 1;
            if (toneV.pos >= tone.pcm.length) toneV.pos %= tone.pcm.length;
          }
          y *= this.amp;
        }

        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5 && rec && hornR) {
          const pBase = sh.pitch || 1.0;
          const hMain = readHornSeamless(hornR.pcm, this.hornPos, hornR.ls);
          const hSub = readHornSeamless(hornR.pcm, this.hornSubPos, hornR.ls);
          const subMix = sh.subMix || 0.24;
          const h = hMain * (1 - subMix * 0.45) + hSub * subMix;

          const loopLen = Math.max(1, hornR.pcm.length - hornR.ls);
          this.hornPos += pBase;
          if (this.hornPos >= hornR.pcm.length) {
            this.hornPos = hornR.ls + ((this.hornPos - hornR.pcm.length) % loopLen);
          }
          this.hornSubPos += pBase * 0.5;
          if (this.hornSubPos >= hornR.pcm.length) {
            this.hornSubPos = hornR.ls + ((this.hornSubPos - hornR.pcm.length) % loopLen);
          }
          y = y * (1 - this.hg) + h * this.hg;
        }

        if (this.wolfPos >= 0 && this.wolf) {
          y += this.wolf[this.wolfPos] * this.wolfGain;
          if (++this.wolfPos >= this.wolf.length) this.wolfPos = -1;
        }

        this.gm += (muteT - this.gm) * this.kMute;
        y *= this.gm;
        if (y > 0.98) y = 0.98; else if (y < -0.98) y = -0.98;
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
          rec,
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
