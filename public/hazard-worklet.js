(function (root) {
  'use strict';

  const PAT = {
    wail:   { lo: 1120, hi: 1770, up: 2.40,  down: 2.20,  smooth: 0.07,   a: 1097.5, b: 1791.9 },
    yelp:   { lo: 520,  hi: 1775, up: 0.160, down: 0.170, smooth: 0.004,  a: 486.7,  b: 1808.9 },
    phaser: { lo: 720,  hi: 1745, up: 0.022, down: 0.028, smooth: 0.0012, a: 664.5,  b: 1804.5 },
    hilo:   { hi: 1095, lo: 665,  half: 0.545, smooth: 0.003 },
    fast:   { lo: 920,  hi: 1770, up: 1.10,  down: 1.00,  smooth: 0.04,   a: 900,    b: 1790 },
    piercer:{ lo: 680,  hi: 1780, up: 0.095, down: 0.018, smooth: 0.0015, a: 660,    b: 1800 },
    airraid:{ lo: 310,  hi: 780,  up: 4.50,  down: 5.50,  smooth: 0.14,   a: 300,    b: 790 },
    rumbler:{ lo: 250,  hi: 660,  up: 0.14,  down: 0.14,  smooth: 0.006,  a: 240,    b: 675 },
    grach:  { lo: 580,  hi: 1480, up: 0.205, down: 0.185, smooth: 0.004,  a: 555,    b: 1510 },
    elina:  { lo: 540,  hi: 1590, up: 0.86,  down: 0.78,  smooth: 0.014,  a: 520,    b: 1620 },
    smerch: { lo: 650,  hi: 1760, up: 0.034, down: 0.025, smooth: 0.0014, a: 625,    b: 1790 },
    bars:   { hi: 960,  lo: 495,  half: 0.355, smooth: 0.0025 },
    patriot:{ lo: 280,  hi: 730,  up: 0.138, down: 0.138, smooth: 0.0055, a: 268,    b: 745 },
  };

  const HORN = { lo: 580, hi: 1620, rate: 54.4, rise: 0.3 };
  const MAN = { start: 410, max: 1480, rise: 4800, tau: 0.78, cut: 290, spin: 1430, burst: 1000 };

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

  const LOOPS = ['wail', 'yelp', 'phaser'];
  // Brassy SGU compression-horn harmonic spectrum
  const TIMBRE = [1.0, 0.16, 0.34, 0.09, 0.19, 0.05, 0.11, 0.03];
  const TBL = 2048;

  function table(h) {
    const t = new Float32Array(TBL + 1);
    let peak = 0;
    for (let i = 0; i < TBL; i++) {
      const x = (i / TBL) * Math.PI * 2;
      let v = 0;
      for (let k = 0; k < h.length; k++) if (h[k]) v += h[k] * Math.sin(x * (k + 1));
      t[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    for (let i = 0; i < TBL; i++) t[i] /= peak || 1;
    t[TBL] = t[0];
    return t;
  }

  const OUT_SYN = 0.9;
  function read(pcm, pos) {
    const i = pos | 0;
    const fr = pos - i;
    const a = pcm[i];
    const b = i + 1 < pcm.length ? pcm[i + 1] : a;
    return a + (b - a) * fr;
  }
  const eq = (g) => Math.sin((g * Math.PI) / 2);

  class HazardSynth {
    constructor(sr) {
      this.sr = sr;
      this.s = { power: false, tone: 0, man: 'off', manHeld: false, horn: false, mute: false };
      this.source = 'rec';
      this.tbl = table(TIMBRE);
      this.hornTbl = table([1.0, 0.18, 0.36, 0.12, 0.22, 0.08]);
      this.rec = {};

      this.ph = 0; this.f = 0; this.tf = 0; this.f1 = 0; this.dir = 1;
      this.mode = 'idle'; this.pat = null; this.patName = '';
      this.hiloT = 0; this.mf = 0; this.trill = false; this.amp = 0;
      this.wasFalling = false;
      this.usaT = 0;

      this.v = {};
      for (const n of LOOPS.concat(['tone'])) this.v[n] = { pos: 0, g: 0 };
      this.want = null; this.fPrev = 0;

      this.hg = 0; this.hph = 0; this.hc = 0; this.hornWas = false; this.hornPos = 0;
      this.wolf = null; this.wolfPos = -1; this.wolfGain = 1;
      this.gm = 1;

      const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
      this.kAmp = k(0.003); this.kAmpOff = k(0.006);
      this.kHornOn = k(0.002); this.kHornOff = k(0.015);
      this.kMute = k(0.004); this.kMan = k(0.004);
      this.kX = 1 / (0.035 * sr);
      this.lnHorn = Math.log(HORN.hi / HORN.lo);
      this.statN = 0; this.statPeak = 0; this.onStat = null;
    }

    get useRec() {
      const r = this.rec;
      return this.source === 'rec' && !!(r.wail && r.yelp && r.phaser && r.tone);
    }

    message(m) {
      if (!m) return;
      if (m.type === 'state') {
        const prevTone = this.s.tone;
        Object.assign(this.s, m.s);
        if (this.s.tone === 9 && prevTone !== 9) this.usaT = 0;
      } else if (m.type === 'source') {
        this.source = m.id === 'synth' ? 'synth' : 'rec';
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          track: m.track || null,
          stepS: (m.step || 0.02) * this.sr,
          hz: m.hz || 0,
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
      } else if (m.type === 'reset') {
        this.reset();
      }
    }

    reset() {
      this.mode = 'idle';
      this.mf = 0;
      this.trill = false;
      this.wolfPos = -1;
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
        return 0;
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
        return 1;
      }
      if (s.man === 'pa') {
        if (s.manHeld) {
          if (!this.trill) {
            if (this.mode !== 'manual') { this.mf = silent ? 0 : this.f; this.mode = 'manual'; }
            if (this.mf >= MAN.spin || (this.mf >= MAN.burst && this.wasFalling)) {
              this.trill = true;
              this.enterPat('phaser', false);
              this.tf = this.f;
              this.dir = 1;
              return 1;
            }
            this.wasFalling = false;
            return 2;
          }
          if (this.mode !== 'pat') this.enterPat('phaser', false);
          return 1;
        }
        if (this.trill || this.mode === 'pat') {
          this.mf = this.trill ? Math.max(this.f, MAN.spin) : this.f;
          this.trill = false;
          this.mode = 'manual';
        }
        this.wasFalling = true;
        return 3;
      }
      if (this.mode === 'pat') { this.mf = silent ? 0 : this.f; this.mode = 'manual'; }
      if (this.mode === 'idle') this.mode = 'manual';
      this.trill = false;
      if (s.man === 'manual' && s.manHeld) return 2;
      return 3;
    }

    render(out) {
      const n = out.length, sr = this.sr, s = this.s, dt = 1 / sr;
      const how = this.control(n * dt);
      const rec = this.useRec;
      const muteT = s.mute || !s.power ? 0 : 1;
      const hornT = s.power && s.horn && !s.mute ? 1 : 0;
      if (hornT && !this.hornWas) { this.hph = 0; this.hornPos = 0; }
      this.hornWas = !!hornT;

      const decay = Math.exp(-dt / MAN.tau);
      const ks = how === 1 && this.pat ? 1 - Math.exp(-dt / this.pat.smooth) : 0;

      const isLoopRec = this.patName === 'wail' || this.patName === 'yelp' || this.patName === 'phaser';
      const loopName = rec && how === 1 && isLoopRec ? this.patName : null;
      const toneOn = rec && (how === 2 || how === 3 || (how === 1 && !isLoopRec));

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

      const tbl = this.tbl, htbl = this.hornTbl, R = this.rec, V = this.v;
      const tone = R.tone, toneV = V.tone, hornR = R.horn;
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
              // Logarithmic pitch curve matches real analog/digital SGU sirens
              this.tf *= Math.pow(p.b / p.a, dt / p.up);
              if (this.tf >= p.b) { this.tf = p.b; this.dir = -1; }
            } else {
              this.tf /= Math.pow(p.b / p.a, dt / p.down);
              if (this.tf <= p.a) { this.tf = p.a; this.dir = 1; }
            }
            this.f1 += (this.tf - this.f1) * ks;
            this.f += (this.f1 - this.f) * ks;
          }
          ampT = 1;
        } else if (how === 2) {
          if (this.mf < MAN.start) this.mf = MAN.start;
          const room = (MAN.max - this.mf) / 80;
          this.mf = Math.min(MAN.max, this.mf + MAN.rise * dt * Math.max(0, Math.min(1, room)));
          this.f += (this.mf - this.f) * this.kMan;
          ampT = 1;
        } else if (how === 3 && this.mf > 0) {
          this.mf *= decay;
          this.f += (this.mf - this.f) * this.kMan;
          ampT = Math.max(0, Math.min(1, (this.mf - MAN.cut) / 180));
          if (this.mf < MAN.cut * 0.9) this.mf = 0;
        }

        this.amp += (ampT - this.amp) * (ampT > this.amp ? this.kAmp : this.kAmpOff);

        let y = 0;
        if (rec) {
          for (let k = 0; k < 3; k++) {
            const name = LOOPS[k], v = V[name], r = R[name];
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
          if (toneV.g > 0) {
            const rawTone = read(tone.pcm, toneV.pos);
            // Add subtle horn driver grit to pitched tone.wav so Russian SGU & HI-LO punch like real under-hood speakers
            this.ph += this.f * dt;
            this.ph -= Math.floor(this.ph);
            const sx = this.ph * TBL, sj = sx | 0, sfr = sx - sj;
            const hornHarm = tbl[sj] + (tbl[sj + 1] - tbl[sj]) * sfr;
            const blended = rawTone * 0.72 + hornHarm * 0.28;
            y += Math.tanh(blended * 1.28) * 0.88 * eq(toneV.g);
            toneV.pos += this.f / tone.hz;
            while (toneV.pos >= tone.pcm.length) toneV.pos -= tone.pcm.length;
          }
          y *= this.amp;
        } else if (this.amp > 1e-5) {
          this.ph += this.f * dt;
          this.ph -= Math.floor(this.ph);
          const x = this.ph * TBL, j = x | 0, fr = x - j;
          const rawS = tbl[j] + (tbl[j + 1] - tbl[j]) * fr;
          y = Math.tanh(rawS * 1.32) * 0.86 * this.amp * OUT_SYN;
        }

        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5) {
          let h;
          if (rec && hornR) {
            h = read(hornR.pcm, this.hornPos);
            this.hornPos += 1;
            if (this.hornPos >= hornR.pcm.length) this.hornPos = hornR.ls + (this.hornPos - hornR.pcm.length);
          } else {
            this.hph += HORN.rate * dt;
            if (this.hph >= 1) this.hph -= 1;
            const u = this.hph < HORN.rise ? this.hph / HORN.rise : 1 - (this.hph - HORN.rise) / (1 - HORN.rise);
            this.hc += HORN.lo * Math.exp(u * this.lnHorn) * dt;
            this.hc -= Math.floor(this.hc);
            const x = this.hc * TBL, j = x | 0, fr = x - j;
            h = (htbl[j] + (htbl[j + 1] - htbl[j]) * fr) * OUT_SYN;
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
