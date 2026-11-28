(function (root) {
  'use strict';

  // Premier Hazard 7007 (classic) & K-13 sweep curves
  const PAT = {
    wail:   { lo: 520, hi: 1790, up: 4.30,  down: 4.00,  smooth: 0.052 },
    yelp:   { lo: 540, hi: 1780, up: 0.162, down: 0.168, smooth: 0.004 },
    hilo:   { hi: 1095, lo: 665, half: 0.545, smooth: 0.003 },
    phaser: { lo: 710, hi: 1690, up: 0.025, down: 0.027, smooth: 0.0018 },
    melody: { lo: 600, hi: 1200, smooth: 0.006 },
  };

  // Hazard 7007 Silver exponential SGU sweep specs (organic musical curves, not robotic linear ramps)
  const SILVER_PAT = {
    wail:   { lo: 516, hi: 1765, up: 3.70,  down: 3.85,  smooth: 0.050 },
    yelp:   { lo: 525, hi: 1765, up: 0.166, down: 0.170, smooth: 0.0032 },
    hilo:   { hi: 1100, lo: 670, half: 0.545, smooth: 0.0028 },
    phaser: { lo: 710, hi: 1710, up: 0.026, down: 0.028, smooth: 0.0018 },
    melody: { lo: 600, hi: 1200, smooth: 0.006 },
  };

  // K-13 sweep curves
  const K13_PAT = {
    wail:   { lo: 450, hi: 1810, up: 3.55,  down: 3.60,  smooth: 0.044 },
    yelp:   { lo: 495, hi: 1790, up: 0.155, down: 0.165, smooth: 0.0038 },
    hilo:   { hi: 1085, lo: 685, half: 0.520, smooth: 0.003 },
    phaser: { lo: 760, hi: 1680, up: 0.024, down: 0.026, smooth: 0.0018 },
    melody: { lo: 600, hi: 1200, smooth: 0.006 },
  };

  const DEFAULT_MELODY_NOTES = [600, 800, 600, 1200];
  const DEFAULT_MELODY_STEP_DUR = 0.17;

  const TONE_PAT = {
    1: 'wail',
    2: 'yelp',
    3: 'hilo',
    4: 'phaser',
    5: 'melody',
  };

  // MAN sweep (standard 600 <-> 1700 Hz manual siren curve)
  const MAN = { lo: 600, hi: 1700, up: 3.00, down: 3.10, resetPause: 1.35 };

  // Rich 100W Under-Hood SGU Compression-Horn Driver Wavetable
  // Authentic brassy compression-horn harmonic balance (not a thin pure sine wave)
  const TABLE_SIZE = 4096;
  const WAVE = new Float32Array(TABLE_SIZE);
  {
    let p1 = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const th = (2 * Math.PI * i) / TABLE_SIZE;
      const v1 =
        1.00 * Math.sin(th) +
        0.24 * Math.sin(2 * th + 0.15) +
        0.34 * Math.sin(3 * th) +
        0.13 * Math.sin(4 * th + 0.30) +
        0.18 * Math.sin(5 * th) +
        0.07 * Math.sin(6 * th + 0.20) +
        0.09 * Math.sin(7 * th) +
        0.04 * Math.sin(8 * th);
      WAVE[i] = v1;
      if (Math.abs(v1) > p1) p1 = Math.abs(v1);
    }
    for (let i = 0; i < TABLE_SIZE; i++) {
      WAVE[i] *= p1 > 0 ? 0.86 / p1 : 1;
    }
  }

  // Zero-hiss Premier Hazard 7007 Air Horn wavetable (exact Fourier spectrum measured from real 54.44 Hz horn.wav)
  const HORN_BASE_HZ = 54.44;
  const HORN_WAVE = new Float32Array(TABLE_SIZE);
  {
    const harmonics = [
      [7, 0.0504, -0.587],
      [11, 0.0519, -2.130],
      [12, 0.2231, -2.804],
      [13, 0.2217, -0.601],
      [14, 0.1995, -1.353],
      [15, 0.0632, 0.830],
      [16, 0.4330, 0.971],
      [17, 0.1986, 1.479],
      [18, 0.0430, -2.031],
      [19, 0.0910, 0.036],
      [21, 0.0774, 2.082],
      [22, 0.1148, -1.589],
      [23, 0.1463, 2.116],
      [24, 0.0214, -2.765],
      [25, 0.0892, 1.937],
      [26, 0.2431, 0.257],
      [27, 0.0206, 1.289],
      [28, 0.0278, -1.316],
      [29, 0.1062, 0.278],
      [30, 0.0958, -1.668],
      [31, 0.0835, 1.852],
      [32, 0.0396, 2.022],
      [33, 0.0241, 0.651],
    ];
    let hp = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const base = (2 * Math.PI * i) / TABLE_SIZE;
      let v = 0;
      for (let h = 0; h < harmonics.length; h++) {
        const [k, mag, ph] = harmonics[h];
        v += mag * Math.cos(k * base + ph);
      }
      HORN_WAVE[i] = v;
      if (Math.abs(v) > hp) hp = Math.abs(v);
    }
    for (let i = 0; i < TABLE_SIZE; i++) {
      HORN_WAVE[i] *= hp > 0 ? 0.92 / hp : 1;
    }
  }

  // Genuine K-13 Air Horn harmonic spectrum measured from real K-13 video (92.5 Hz fundamental)
  const K13_HORN_BASE_HZ = 92.5;
  const K13_HORN_WAVE = new Float32Array(TABLE_SIZE);
  {
    const harmonics = [
      [1, 0.34, 0.0],
      [2, 0.21, 0.4],
      [3, 0.20, -0.7],
      [4, 0.19, 1.1],
      [5, 0.21, -0.3],
      [6, 0.14, 0.9],
      [7, 0.08, -1.2],
      [8, 0.09, 0.6],
      [9, 0.16, -0.4],
      [10, 0.50, 0.2],
      [11, 0.14, -1.1],
      [12, 0.08, 0.8],
    ];
    let kp = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const base = (2 * Math.PI * i) / TABLE_SIZE;
      let v = 0;
      for (let h = 0; h < harmonics.length; h++) {
        const [k, mag, ph] = harmonics[h];
        v += mag * Math.cos(k * base + ph);
      }
      K13_HORN_WAVE[i] = v;
      if (Math.abs(v) > kp) kp = Math.abs(v);
    }
    for (let i = 0; i < TABLE_SIZE; i++) {
      K13_HORN_WAVE[i] *= kp > 0 ? 0.92 / kp : 1;
    }
  }

  function readTbl(tbl, phase01) {
    const p = (phase01 - Math.floor(phase01)) * TABLE_SIZE;
    const i0 = p | 0;
    const i1 = (i0 + 1) & (TABLE_SIZE - 1);
    const fr = p - i0;
    return tbl[i0] + (tbl[i1] - tbl[i0]) * fr;
  }

  function readLinear(pcm, pos, le) {
    const len = le > 0 && le <= pcm.length ? le : pcm.length;
    if (len === 0) return 0;
    const i = pos | 0;
    if (i < 0) return pcm[0];
    if (i >= len) return pcm[len - 1];
    const fr = pos - i;
    const a = pcm[i];
    const b = i + 1 < len ? pcm[i + 1] : pcm[0];
    return a + (b - a) * fr;
  }

  function getLoopXf(ls, le, maxXf) {
    const loopLen = Math.max(0, le - ls);
    const xf = Math.min(Math.floor(loopLen / 3), maxXf || 700);
    return xf > 16 && loopLen > xf * 2 ? xf : 0;
  }

  function readSeamless(pcm, pos, ls, le, maxXf) {
    const len = le > 0 && le <= pcm.length ? le : pcm.length;
    if (len === 0) return 0;
    const xf = getLoopXf(ls, len, maxXf);
    const s1 = readLinear(pcm, pos, len);
    const distToEnd = len - pos;
    if (xf > 0 && distToEnd < xf && pos >= ls) {
      const t = 1 - distToEnd / xf;
      const w1 = Math.cos(t * Math.PI * 0.5);
      const w2 = Math.sin(t * Math.PI * 0.5);
      const wrapPos = ls + (xf - distToEnd);
      const s2 = readLinear(pcm, wrapPos, len);
      return s1 * w1 + s2 * w2;
    }
    return s1;
  }

  function advanceLoop(pos, step, ls, le, maxXf) {
    const len = le;
    const xf = getLoopXf(ls, len, maxXf);
    const wrapBase = ls + xf;
    const span = Math.max(1, len - wrapBase);
    let next = pos + step;
    if (next >= len) {
      next = wrapBase + ((next - len) % span);
    }
    return next;
  }

  class HazardSynth {
    constructor(sr) {
      this.sr = sr;
      this.s = {
        power: false,
        tone: 0,
        selectedTone: 1,
        man: 'off',
        manHeld: false,
        horn: false,
        mute: false,
      };
      this.sgu = 'hazard';
      this.silverOpts = {
        speaker: 'hazard',
        analog: false,
        powerLevel: 72,
      };
      this.rec = {};
      this.packRec = { elina: {}, grach: {}, k13: {} };

      this.ph = 0;
      this.hornPh = 0;
      this.hornModPh = 0;
      this.hornTapT = 0;
      this.hornStepIdx = 0;
      this.driftT = 0;
      this.tonePos = 0;
      this.recPos = 0;
      this.shortPos = -1;
      this.f = 0;
      this.tf = 0;
      this.f1 = 0;
      this.dir = 1;
      this.mode = 'idle';
      this.pat = null;
      this.patName = '';
      this.hiloT = 0;
      this.melodyT = 0;
      this.melodyNotes = DEFAULT_MELODY_NOTES.slice();
      this.melodyStepDur = DEFAULT_MELODY_STEP_DUR;
      this.melodySharp = false;
      this.melodyIsSweep = true;
      this.mf = 0;
      this.manDir = 1;
      this.manIdleT = 99;
      this.trill = false;
      this.amp = 0;
      this.wasFalling = false;
      this.manWasHeld = false;
      this.shortT = -1;
      this.cutFade = false;

      this.curSrcKey = '';
      this._specKind = '';
      this._specEntry = null;
      this._specXf = 0;
      this._specResolvedKey = '';
      this._specResolvedSgu = '';
      this.zcEstHz = 0;
      this.zcLastSign = 0;
      this.zcSince = 0;

      // Horn cabinet acoustic state (320Hz HP + 3500Hz warm LP + horn presence)
      this.cabHpX = 0;
      this.cabHpY = 0;
      this.cabLp1 = 0;
      this.cabLp2 = 0;

      this.hg = 0;
      this.hornWas = false;
      this.hornPos = 0;
      this.hornLp = 0;
      this.wolf = null;
      this.wolfPos = -1;
      this.wolfGain = 1;
      this.gm = 1;

      const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
      this.kAmp = k(0.0032);
      this.kAmpOff = k(0.009);
      this.kAmpCut = k(0.006);
      this.kFastSwitch = k(0.0032);
      this.kHornOn = k(0.0018);
      this.kHornOff = k(0.0042);
      this.kHornLp = k(1 / (2 * Math.PI * 3600));
      this.kCabHp = Math.exp((-2 * Math.PI * 300) / sr);
      this.kCabLp = k(1 / (2 * Math.PI * 3500));
      this.kMute = k(0.0045);
      this.kMan = k(0.0032);

      this.statN = 0;
      this.statPeak = 0;
      this.onStat = null;
    }

    get useRec() {
      return !!(this.rec.wail || this.rec.yelp || this.rec.phaser || this.rec.tone);
    }

    message(m) {
      if (!m) return;
      if (m.type === 'state') {
        Object.assign(this.s, m.s);
      } else if (m.type === 'sgu') {
        const next =
          m.id === 'k13' || m.id === 'elina' || m.id === 'grach' || m.id === 'hazard_silver'
            ? m.id
            : 'hazard';
        if (next !== this.sgu) {
          this.sgu = next;
          this.reset();
        }
      } else if (m.type === 'silverOpts') {
        if (m.speaker) this.silverOpts.speaker = 'hazard';
        if (typeof m.analog === 'boolean') this.silverOpts.analog = m.analog;
        if (typeof m.powerLevel === 'number') this.silverOpts.powerLevel = m.powerLevel;
      } else if (m.type === 'melodyConfig') {
        if (Array.isArray(m.notes) && m.notes.length >= 2) {
          const clean = [];
          for (let i = 0; i < Math.min(12, m.notes.length); i++) {
            const v = Number(m.notes[i]);
            if (Number.isFinite(v)) clean.push(Math.max(200, Math.min(2600, v)));
          }
          if (clean.length >= 2) this.melodyNotes = clean;
        }
        if (typeof m.stepMs === 'number' && Number.isFinite(m.stepMs)) {
          this.melodyStepDur = Math.max(0.06, Math.min(1.5, m.stepMs / 1000));
        }
        if (typeof m.sharp === 'boolean') {
          this.melodySharp = m.sharp;
        }
        if (typeof m.isSweep === 'boolean') {
          this.melodyIsSweep = m.isSweep;
        }
        if (this.patName === 'melody' || (this.s.manHeld && !this.melodyIsSweep)) {
          this.melodyT = 0;
        }
      } else if (m.type === 'hornTap') {
        this.hornTapT = 0;
        this.hornStepIdx = (this.hornStepIdx + 1) % 64;
        this.hornPos = 0;
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          le: m.loopEnd ? Math.round(m.loopEnd * this.sr) : m.pcm.length,
          hz: m.hz && m.hz > 20 ? m.hz : 900.0,
          track: Array.isArray(m.track) ? m.track : null,
          step: m.step || 0.02,
        };
      } else if (m.type === 'packSample') {
        if (!this.packRec[m.pack]) this.packRec[m.pack] = {};
        this.packRec[m.pack][m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          le: m.loopEnd ? Math.round(m.loopEnd * this.sr) : m.pcm.length,
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
        this.shortPos = 0;
      } else if (m.type === 'reset') {
        this.reset();
      }
    }

    reset() {
      this.mode = 'idle';
      this.mf = 0;
      this.manDir = 1;
      this.manIdleT = 99;
      this.trill = false;
      this.wasFalling = false;
      this.manWasHeld = false;
      this.wolfPos = -1;
      this.shortT = -1;
      this.shortPos = -1;
      this.cutFade = false;
      this.curSrcKey = '';
      this._specKind = '';
      this._specEntry = null;
      this._specResolvedKey = '';
      this.recPos = 0;
      this.tonePos = 0;
      this.hornWas = false;
      this.hornPos = 0;
      this.hornPh = 0;
      this.hornModPh = 0;
      this.hornTapT = 0;
      this.hiloT = 0;
      this.melodyT = 0;
      this.cabHpX = 0;
      this.cabHpY = 0;
      this.cabLp1 = 0;
      this.cabLp2 = 0;
    }

    getPatTable() {
      if (this.sgu === 'hazard_silver') return SILVER_PAT;
      if (this.sgu === 'k13') return K13_PAT;
      return PAT;
    }

    enterPat(name, fromSilence) {
      const tbl = this.getPatTable();
      const p = tbl[name] || tbl.wail;
      this.pat = p;
      this.patName = name;
      this.cutFade = false;
      if (name === 'melody') {
        this.melodyT = 0;
        const firstHz = (this.melodyNotes && this.melodyNotes[0]) || 600;
        this.tf = firstHz;
        if (fromSilence) this.f = this.f1 = firstHz;
      } else if (name === 'hilo') {
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

      // K-13 SHORT quick single chirp (stops cleanly at 0.095s before 2nd tap in WAV)
      if (this.shortT >= 0) {
        const k13Short = this.sgu === 'k13' && this.packRec.k13 && this.packRec.k13.short;
        const maxShortSamples = k13Short ? Math.min(k13Short.pcm.length, Math.floor(this.sr * 0.095)) : 0;
        if (k13Short) {
          if (this.shortPos >= maxShortSamples || this.shortPos < 0) {
            this.shortT = -1;
            this.shortPos = -1;
            this.cutFade = true;
          } else {
            this.cutFade = false;
            return 4;
          }
        } else {
          this.shortT += blockDur;
          if (this.shortT > 0.24) {
            this.shortT = -1;
            this.cutFade = true;
          } else {
            this.cutFade = false;
            return 4;
          }
        }
      }

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

      if (s.man === 'pulsar') {
        if (s.manHeld) {
          if (!this.trill || this.patName !== 'phaser') {
            this.trill = true;
            this.enterPat('phaser', silent);
            const pPh = this.getPatTable().phaser;
            this.tf = Math.max(pPh.lo, this.f || pPh.lo);
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

      if (this.mode === 'pat' && !this.trill) {
        this.mf = silent ? 0 : this.f;
        this.mode = 'manual';
      }
      if (this.mode === 'idle') this.mode = 'manual';

      if ((s.man === 'manual' || s.man === 'pa') && s.manHeld) {
        if (!this.manWasHeld) {
          if (this.melodyIsSweep) {
            if (this.mf < MAN.lo || this.manIdleT > MAN.resetPause) {
              this.mf = MAN.lo;
              this.manDir = 1;
            }
            this.f = this.mf;
          } else {
            if (this.manIdleT > MAN.resetPause) {
              this.melodyT = 0;
              const firstHz = (this.melodyNotes && this.melodyNotes[0]) || 600;
              this.tf = this.f1 = this.f = firstHz;
            } else if (this.f < 200) {
              const firstHz = (this.melodyNotes && this.melodyNotes[0]) || 600;
              this.tf = this.f1 = this.f = firstHz;
            }
          }
        }
        this.manIdleT = 0;
        this.manWasHeld = true;
        this.cutFade = false;
        this.wasFalling = false;
        return 2;
      }

      if (this.trill) {
        this.trill = false;
        this.mf = 0;
        this.wasFalling = false;
        this.mode = 'idle';
        this.manWasHeld = false;
        this.cutFade = true;
        return 0;
      }

      if (this.manWasHeld) {
        this.cutFade = true;
      }
      this.manWasHeld = false;
      this.manIdleT = Math.min(99, this.manIdleT + blockDur);
      return 3;
    }

    resolveSampleForKey(key) {
      if (this._specResolvedKey === key && this._specResolvedSgu === this.sgu) {
        return;
      }
      this._specResolvedKey = key;
      this._specResolvedSgu = this.sgu;
      this._specKind = '';
      this._specEntry = null;
      this._specXf = 0;
      if (!key) return;

      // Elina and Grach: kept 100% untouched! (except user-selected 'melody')
      if ((this.sgu === 'elina' || this.sgu === 'grach') && key !== 'melody') {
        const pack = this.packRec[this.sgu] || {};
        if (key === 'wail' && pack.wail) { this._specKind = 'clip'; this._specEntry = pack.wail; this._specXf = 650; return; }
        if (key === 'yelp' && pack.yelp) { this._specKind = 'clip'; this._specEntry = pack.yelp; this._specXf = 360; return; }
        if (key === 'hilo') {
          if (pack.hilo) { this._specKind = 'clip'; this._specEntry = pack.hilo; this._specXf = 300; return; }
          if (pack.phaser) { this._specKind = 'clip'; this._specEntry = pack.phaser; this._specXf = 300; return; }
        }
        if (key === 'phaser') {
          if (pack.phaser) { this._specKind = 'clip'; this._specEntry = pack.phaser; this._specXf = 300; return; }
          if (pack.tone) { this._specKind = 'tone'; this._specEntry = pack.tone; return; }
        }
        if ((key === 'manual' || key === 'short') && pack.tone) {
          this._specKind = 'tone'; this._specEntry = pack.tone; return;
        }
        if (pack.tone) { this._specKind = 'tone'; this._specEntry = pack.tone; return; }
        return;
      }

      // K-13: genuine recorded K-13 pack WAVs (tone.wav, pulsar.wav, short.wav)
      if (this.sgu === 'k13') {
        const kpack = this.packRec.k13 || {};
        if (key === 'short' && kpack.short) { this._specKind = 'oneshot'; this._specEntry = kpack.short; return; }
        if (key === 'phaser' && kpack.pulsar) { this._specKind = 'clip'; this._specEntry = kpack.pulsar; this._specXf = 260; return; }
        if (kpack.tone) { this._specKind = 'tone'; this._specEntry = kpack.tone; return; }
        this._specKind = 'silver';
        return;
      }

      // Premier Hazard 7007 & Silver Hazard: genuine recorded Hazard WAVs (wail, yelp, phaser, tone)
      if (key === 'wail' && this.rec.wail) { this._specKind = 'clip'; this._specEntry = this.rec.wail; this._specXf = 650; return; }
      if (key === 'yelp' && this.rec.yelp) { this._specKind = 'clip'; this._specEntry = this.rec.yelp; this._specXf = 360; return; }
      if (key === 'phaser' && this.rec.phaser) { this._specKind = 'clip'; this._specEntry = this.rec.phaser; this._specXf = 300; return; }
      if (this.rec.tone) { this._specKind = 'tone'; this._specEntry = this.rec.tone; return; }
      this._specKind = 'silver';
    }

    // 100W under-hood SGU horn-bell acoustic cabinet shaping (300Hz HP + warm 3.5kHz LP + driver saturation)
    applyHornCabinet(raw) {
      // Gentle high-pass to clear muddy sub rumble
      this.cabHpY = this.kCabHp * (this.cabHpY + raw - this.cabHpX);
      this.cabHpX = raw;
      // Amplifier / horn throat saturation
      const drive = this.sgu === 'hazard_silver' && this.silverOpts.analog ? 1.56 : 1.24;
      const sat = Math.tanh(this.cabHpY * drive) * 0.88;
      // 2-pole warm speaker roll-off above 3.5 kHz (zero harsh digital edge)
      this.cabLp1 += (sat - this.cabLp1) * this.kCabLp;
      this.cabLp2 += (this.cabLp1 - this.cabLp2) * this.kCabLp;
      return this.cabLp2;
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
        this.hornTapT = 0;
      }
      this.hornWas = !!hornT;

      if (s.tone || hornT || (s.manHeld && s.man !== 'wolf') || !s.power) {
        this.wolfPos = -1;
      }

      let wantKey = '';
      if (how === 1 && this.patName) {
        wantKey = this.patName;
      } else if (how === 2) {
        wantKey = 'manual';
      } else if (how === 4) {
        wantKey = 'short';
      }

      const pack =
        this.sgu === 'elina' || this.sgu === 'grach' || this.sgu === 'k13'
          ? this.packRec[this.sgu] || {}
          : null;
      const hornEntry = pack && pack.horn ? pack.horn : this.rec.horn || null;
      const ks = how === 1 && this.pat ? 1 - Math.exp(-dt / this.pat.smooth) : 0;
      const isSilver = this.sgu === 'hazard_silver';
      const isK13 = this.sgu === 'k13';
      const silverLevel = isSilver
        ? this.silverOpts.powerLevel <= 0
          ? 0
          : 0.34 + 0.66 * Math.min(1, Math.max(0, this.silverOpts.powerLevel / 100))
        : 1;

      const k13ShortMax =
        isK13 && this.packRec.k13 && this.packRec.k13.short
          ? Math.min(this.packRec.k13.short.pcm.length, Math.floor(sr * 0.095))
          : 0;
      const k13ShortFade = Math.floor(sr * 0.008);
      const kManSmooth = 1 - Math.exp(-dt / 0.006);

      let peak = 0;

      for (let i = 0; i < n; i++) {
        let activeWant = wantKey;
        let melAccent = 1;

        if (how === 1) {
          const p = this.pat;
          if (this.patName === 'melody') {
            if (this.melodyIsSweep) {
              if (this.mf < MAN.lo || this.mf > MAN.hi) this.mf = MAN.lo;
              if (this.manDir > 0) {
                this.mf *= Math.pow(MAN.hi / MAN.lo, dt / MAN.up);
                if (this.mf >= MAN.hi) {
                  this.mf = MAN.hi;
                  this.manDir = -1;
                }
              } else {
                this.mf /= Math.pow(MAN.hi / MAN.lo, dt / MAN.down);
                if (this.mf <= MAN.lo) {
                  this.mf = MAN.lo;
                  this.manDir = 1;
                }
              }
              this.tf = this.mf;
            } else {
              const notes = this.melodyNotes && this.melodyNotes.length >= 2 ? this.melodyNotes : DEFAULT_MELODY_NOTES;
              const stepDur = this.melodyStepDur > 0.05 ? this.melodyStepDur : DEFAULT_MELODY_STEP_DUR;
              const nLen = notes.length;
              const totalDur = nLen * stepDur;
              this.melodyT += dt;
              if (this.melodyT >= totalDur) {
                this.melodyT -= Math.floor(this.melodyT / totalDur) * totalDur;
              }
              const seg = Math.min(nLen - 1, (this.melodyT / stepDur) | 0);
              const u = (this.melodyT - seg * stepDur) / stepDur;
              if (this.melodySharp) {
                this.tf = notes[seg];
                melAccent = 0.88 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.15));
              } else {
                const ease = 0.5 - 0.5 * Math.cos(Math.PI * u);
                const f0 = notes[seg];
                const f1 = notes[(seg + 1) % nLen];
                this.tf = f0 * Math.pow(f1 / f0, ease);
              }
            }
          } else if (this.patName === 'hilo') {
            this.hiloT += dt;
            if (this.hiloT >= p.half) {
              this.hiloT -= p.half;
              this.tf = this.tf === p.hi ? p.lo : p.hi;
            }
          } else if (this.dir > 0) {
            // Exponential musical pitch curve for all SGU sirens (authentic WAIL / YELP / PHASER)
            this.tf *= Math.pow(p.hi / p.lo, dt / p.up);
            if (this.tf >= p.hi || !Number.isFinite(this.tf)) {
              this.tf = p.hi;
              this.dir = -1;
            }
          } else {
            this.tf /= Math.pow(p.hi / p.lo, dt / p.down);
            if (this.tf <= p.lo || !Number.isFinite(this.tf)) {
              this.tf = p.lo;
              this.dir = 1;
            }
          }
          this.f1 += (this.tf - this.f1) * ks;
          this.f += (this.f1 - this.f) * ks;
        } else if (how === 2) {
          if (this.melodyIsSweep) {
            if (this.manDir > 0) {
              this.mf *= Math.pow(MAN.hi / MAN.lo, dt / MAN.up);
              if (this.mf >= MAN.hi) {
                this.mf = MAN.hi;
                this.manDir = -1;
              }
            } else {
              this.mf /= Math.pow(MAN.hi / MAN.lo, dt / MAN.down);
              if (this.mf <= MAN.lo) {
                this.mf = MAN.lo;
                this.manDir = 1;
              }
            }
            this.f = this.mf;
          } else {
            const notes = this.melodyNotes && this.melodyNotes.length >= 2 ? this.melodyNotes : DEFAULT_MELODY_NOTES;
            const stepDur = this.melodyStepDur > 0.05 ? this.melodyStepDur : DEFAULT_MELODY_STEP_DUR;
            const nLen = notes.length;
            const totalDur = nLen * stepDur;
            this.melodyT += dt;
            if (this.melodyT >= totalDur) {
              this.melodyT -= Math.floor(this.melodyT / totalDur) * totalDur;
            }
            const seg = Math.min(nLen - 1, (this.melodyT / stepDur) | 0);
            const u = (this.melodyT - seg * stepDur) / stepDur;
            if (this.melodySharp) {
              this.tf = notes[seg];
              melAccent = 0.88 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.15));
            } else {
              const ease = 0.5 - 0.5 * Math.cos(Math.PI * u);
              const f0 = notes[seg];
              const f1 = notes[(seg + 1) % nLen];
              this.tf = f0 * Math.pow(f1 / f0, ease);
            }
            this.f1 += (this.tf - this.f1) * kManSmooth;
            this.f += (this.f1 - this.f) * kManSmooth;
          }
        } else if (how === 3) {
          activeWant = '';
          if (this.mf > MAN.lo) {
            this.mf = Math.max(MAN.lo, this.mf * Math.pow(0.92, dt));
          }
        } else if (how === 4) {
          const pNorm = Math.min(1, this.shortT / 0.21);
          this.f = 700 + 960 * Math.sin(pNorm * Math.PI * 0.5);
        }

        if (!Number.isFinite(this.f) || this.f < 0) this.f = 0;

        let targetAmp = 0;
        let ampRate = this.kAmpOff;

        if (activeWant !== this.curSrcKey) {
          if (this.curSrcKey === '' || this.amp <= 0.0006) {
            this.curSrcKey = activeWant;
            this.recPos = 0;
            if (activeWant) {
              targetAmp =
                how === 4 && !k13ShortMax && this.shortT >= 0.19
                  ? Math.max(0, 1 - (this.shortT - 0.19) / 0.05)
                  : 1;
              ampRate = this.kAmp;
            }
          } else {
            targetAmp = 0;
            ampRate = this.kFastSwitch;
          }
        } else if (this.curSrcKey !== '') {
          if (how === 4) {
            targetAmp = k13ShortMax ? 1 : this.shortT < 0.19 ? 1 : Math.max(0, 1 - (this.shortT - 0.19) / 0.05);
            ampRate = targetAmp > this.amp ? this.kAmp : this.kAmpCut;
          } else {
            targetAmp = 1;
            ampRate = targetAmp > this.amp ? this.kAmp : this.kAmpOff;
          }
        } else {
          targetAmp = 0;
          ampRate = this.cutFade ? this.kAmpCut : this.kAmpOff;
        }

        this.amp += (targetAmp - this.amp) * ampRate;
        if (this.amp <= 0.0004 && activeWant === '') {
          this.curSrcKey = '';
          this.amp = 0;
        }

        let y = 0;
        if (this.amp > 1e-5 && this.curSrcKey !== '') {
          this.resolveSampleForKey(this.curSrcKey);
          const sKind = this._specKind;
          const entry = this._specEntry;
          if (sKind === 'oneshot' && entry) {
            const pcm = entry.pcm;
            const limit = k13ShortMax > 0 ? k13ShortMax : pcm.length;
            if (this.shortPos >= 0 && this.shortPos < limit) {
              let env = 1;
              const rem = limit - this.shortPos;
              if (k13ShortFade > 0 && rem < k13ShortFade) {
                env = rem / k13ShortFade;
              }
              y = pcm[this.shortPos] * this.amp * env;
              this.shortPos++;
            }
            this.zcEstHz = 1380;
          } else if (sKind === 'clip' && entry) {
            const pcm = entry.pcm;
            const ls = entry.ls || 0;
            const le = Math.min(pcm.length, entry.le || pcm.length);
            y = readSeamless(pcm, this.recPos, ls, le, this._specXf) * this.amp;
            this.recPos = advanceLoop(this.recPos, 1, ls, le, this._specXf);
            if (entry.track && entry.track.length > 0) {
              const idx = Math.floor((this.recPos / sr) / entry.step) % entry.track.length;
              this.zcEstHz = entry.track[idx];
            } else {
              const sign = y >= 0 ? 1 : -1;
              this.zcSince++;
              if (this.zcLastSign < 0 && sign > 0 && this.zcSince > 10) {
                const est = sr / this.zcSince;
                if (est >= 220 && est <= 2300) {
                  this.zcEstHz += (est - this.zcEstHz) * 0.16;
                }
                this.zcSince = 0;
              }
              this.zcLastSign = sign;
            }
          } else if (sKind === 'tone' && entry && this.f > 40) {
            const pcm = entry.pcm;
            const tLs = entry.ls || 0;
            const tLe = Math.min(pcm.length, entry.le || pcm.length);
            const tXf = tLe - tLs > 600 ? 96 : 48;
            const step = this.f / entry.hz;
            if (this.tonePos < tLs && tLs > 0 && tLe - tLs > 256) this.tonePos = tLs;
            y = readSeamless(pcm, this.tonePos, tLs, tLe, tXf) * this.amp * melAccent;
            this.tonePos = advanceLoop(this.tonePos, step, tLs, tLe, tXf);
            this.zcEstHz = this.f;
          } else if (sKind === 'silver' && this.f > 40) {
            this.driftT += dt;
            const drift = isSilver && this.silverOpts.analog
              ? 1 + 0.0055 * Math.sin(2 * Math.PI * 1.45 * this.driftT) + 0.002 * Math.sin(2 * Math.PI * 5.2 * this.driftT)
              : 1;
            const fInst = this.f * drift;
            this.ph += fInst * dt;
            if (this.ph >= 1) this.ph -= Math.floor(this.ph);
            y = this.applyHornCabinet(readTbl(WAVE, this.ph)) * this.amp * melAccent;
            this.zcEstHz = fInst;
          } else if (this.f > 40) {
            this.ph += this.f * dt;
            if (this.ph >= 1) this.ph -= Math.floor(this.ph);
            y = this.applyHornCabinet(readTbl(WAVE, this.ph)) * this.amp * melAccent;
            this.zcEstHz = this.f;
          }
        }

        // HORN:
        // - Classic Hazard / Silver Hazard: real recorded horn.wav (fallback to HORN_WAVE before decode)
        // - K-13: real recorded k13/horn.wav + k13/pulsar.wav + k13/tone.wav adapted to selected MODE
        // - Elina / Grach: untouched genuine WAV clips
        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5) {
          this.hornTapT += dt;
          if (isSilver || this.sgu === 'hazard') {
            if (hornEntry) {
              const hPcm = hornEntry.pcm;
              const hLs = hornEntry.ls || 0;
              const hLe = Math.min(hPcm.length, hornEntry.le || hPcm.length);
              const rawH = readSeamless(hPcm, this.hornPos, hLs, hLe, 320);
              this.hornLp += (rawH - this.hornLp) * this.kHornLp;
              const h = this.hornLp * 0.96;
              this.hornModPh += 2.2 * dt;
              if (this.hornModPh >= 1) this.hornModPh -= 1;
              const mod = isSilver && this.silverOpts.analog ? 1 + 0.004 * Math.sin(2 * Math.PI * this.hornModPh) : 1;
              this.hornPos = advanceLoop(this.hornPos, mod, hLs, hLe, 320);
              y = y * (1 - this.hg) + h * this.hg;
            } else {
              this.hornModPh += 2.2 * dt;
              if (this.hornModPh >= 1) this.hornModPh -= 1;
              const mod = isSilver && this.silverOpts.analog ? 1 + 0.004 * Math.sin(2 * Math.PI * this.hornModPh) : 1;
              this.hornPh += HORN_BASE_HZ * mod * dt;
              if (this.hornPh >= 1) this.hornPh -= Math.floor(this.hornPh);
              const h = this.applyHornCabinet(readTbl(HORN_WAVE, this.hornPh)) * 0.96;
              y = y * (1 - this.hg) + h * this.hg;
            }
          } else if (isK13) {
            const kpack = this.packRec.k13 || {};
            const kMode = s.tone || s.selectedTone || 1;
            if (kMode === 4 && kpack.pulsar) {
              // K-13 PULSAR mode horn: genuine k13/pulsar.wav recording
              const pEntry = kpack.pulsar;
              const pPcm = pEntry.pcm;
              const pLs = pEntry.ls || 0;
              const pLe = Math.min(pPcm.length, pEntry.le || pPcm.length);
              const h = readSeamless(pPcm, this.hornPos, pLs, pLe, 260) * 0.94;
              this.hornPos = advanceLoop(this.hornPos, 1, pLs, pLe, 260);
              y = y * (1 - this.hg) + h * this.hg;
            } else if (hornEntry) {
              // Genuine K-13 horn.wav recording (zero silence gap), pitch-reactive to MODE
              const hPcm = hornEntry.pcm;
              const hLs = hornEntry.ls || 0;
              const hLe = Math.min(hPcm.length, hornEntry.le || hPcm.length);
              const rawH = readSeamless(hPcm, this.hornPos, hLs, hLe, 160);
              this.hornLp += (rawH - this.hornLp) * this.kHornLp;
              const h = this.hornLp * 0.96;
              let step = 1;
              if (kMode === 2) {
                const cPhase = (this.hornTapT % 0.16) / 0.16;
                step = 0.96 + 0.26 * Math.sin(cPhase * Math.PI * 0.5);
              } else if (kMode === 3) {
                const flip = (this.hornStepIdx + Math.floor(this.hornTapT / 0.26)) % 2;
                step = flip === 0 ? 0.94 : 1.22;
              } else if (kMode === 5) {
                const notes = this.melodyNotes && this.melodyNotes.length >= 2 ? this.melodyNotes : DEFAULT_MELODY_NOTES;
                const stepIdx = (this.hornStepIdx + Math.floor(this.hornTapT / Math.max(0.08, this.melodyStepDur))) % notes.length;
                step = Math.max(0.55, Math.min(1.65, notes[stepIdx] / 900));
              }
              this.hornPos = advanceLoop(this.hornPos, step, hLs, hLe, 160);
              y = y * (1 - this.hg) + h * this.hg;
            } else {
              this.hornPh += K13_HORN_BASE_HZ * dt;
              if (this.hornPh >= 1) this.hornPh -= Math.floor(this.hornPh);
              const h = this.applyHornCabinet(readTbl(K13_HORN_WAVE, this.hornPh)) * 0.92;
              y = y * (1 - this.hg) + h * this.hg;
            }
          } else if (hornEntry) {
            // Elina / Grach untouched genuine WAV clips
            const hPcm = hornEntry.pcm;
            const hLs = hornEntry.ls || 0;
            const hLe = Math.min(hPcm.length, hornEntry.le || hPcm.length);
            const rawH = readSeamless(hPcm, this.hornPos, hLs, hLe, 420);
            this.hornLp += (rawH - this.hornLp) * this.kHornLp;
            const h = this.hornLp * 0.94;
            this.hornPos = advanceLoop(this.hornPos, 1, hLs, hLe, 420);
            y = y * (1 - this.hg) + h * this.hg;
          } else {
            this.hornPh += HORN_BASE_HZ * dt;
            if (this.hornPh >= 1) this.hornPh -= Math.floor(this.hornPh);
            const h = readTbl(HORN_WAVE, this.hornPh) * 0.92;
            y = y * (1 - this.hg) + h * this.hg;
          }
        }

        if (this.wolfPos >= 0 && this.wolf) {
          y += this.wolf[this.wolfPos] * this.wolfGain;
          if (++this.wolfPos >= this.wolf.length) this.wolfPos = -1;
        }

        this.gm += (muteT - this.gm) * this.kMute;
        y *= this.gm * silverLevel;
        if (y > 0.96) y = 0.96;
        else if (y < -0.96) y = -0.96;
        out[i] = y;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
      }

      this.statPeak = Math.max(this.statPeak, peak);
      this.statN += n;
      if (this.statN >= sr / 25 && this.onStat) {
        const sounding = (this.amp > 0.05 || this.hg > 0.25) && this.gm > 0.05 && s.power;
        const outHz = this.hg > 0.5 ? 0 : sounding ? Math.round(this.zcEstHz || this.f) : 0;
        this.onStat({
          type: 'stat',
          f: outHz,
          horn: this.hg > 0.5,
          klaxon: false,
          wolf: this.wolfPos >= 0,
          sounding,
          lvl: this.statPeak,
          rec: this.useRec,
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
