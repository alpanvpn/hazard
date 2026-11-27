(function (root) {
  'use strict';

  // Exact Premier Hazard 7007 & K-13 frequency curves matching Video 1 & Video 2:
  // WAIL:   520 <-> 1800 Hz (3.15s up, 3.65s down)
  // YELP:   540 <-> 1765 Hz (0.165s up, 0.170s down)
  // HILO:   675 / 1100 Hz   (0.545s each tone)
  // PULSAR: 560 <-> 1700 Hz (0.042s up, 0.046s down)
  const PAT = {
    wail:   { lo: 520, hi: 1800, up: 3.15,  down: 3.65,  smooth: 0.042,  a: 505, b: 1820 },
    yelp:   { lo: 540, hi: 1765, up: 0.165, down: 0.170, smooth: 0.004,  a: 520, b: 1790 },
    hilo:   { hi: 1100, lo: 675, half: 0.545, smooth: 0.003 },
    phaser: { lo: 560, hi: 1700, up: 0.042, down: 0.046, smooth: 0.0018, a: 545, b: 1720 },
  };

  // T: 0=OFF, 1=WAIL, 2=YELP, 3=HILO, 4=PULSAR
  const TONE_PAT = {
    1: 'wail',
    2: 'yelp',
    3: 'hilo',
    4: 'phaser',
  };

  // Manual sweep parameters matching Video 1 (0:00-0:06, 0:38-0:41):
  // Hold ramps up 520 -> 1805 Hz; release coasts smoothly down; re-pressing winds smoothly up from current pitch
  const MAN = { start: 520, max: 1805, rise: 640, tau: 1.45, cut: 295 };

  // Emergency fallback wavetable ONLY for the first ~20ms before WAV buffers finish decoding
  const TABLE_SIZE = 4096;
  const WAVE = new Float32Array(TABLE_SIZE);
  {
    let peak = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const th = (2 * Math.PI * i) / TABLE_SIZE;
      const v =
        1.000 * Math.sin(th) +
        0.015 * Math.sin(2 * th) +
        0.045 * Math.sin(3 * th) +
        0.025 * Math.sin(5 * th);
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

  function readLinearSpan(pcm, pos, ls, le) {
    const len = pcm.length;
    if (len === 0) return 0;
    const i = pos | 0;
    if (i < 0) return pcm[0];
    if (i >= le - 1) return pcm[Math.min(len - 1, Math.max(0, le - 1))];
    const fr = pos - i;
    const a = pcm[i];
    const b = i + 1 < le ? pcm[i + 1] : pcm[ls];
    return a + (b - a) * fr;
  }

  // Zero-allocation seamless cosine crossfade loop reader within [ls, le)
  function readSeamlessSpan(pcm, pos, ls, le, maxXf) {
    const len = pcm.length;
    if (len === 0) return 0;
    const safeLe = Math.min(len, le || len);
    const safeLs = Math.max(0, Math.min(safeLe - 2, ls || 0));
    const loopLen = Math.max(32, safeLe - safeLs);
    const xf = Math.min(loopLen >> 2, maxXf || 320);
    const s1 = readLinearSpan(pcm, pos, safeLs, safeLe);
    const distToEnd = safeLe - pos;
    if (xf > 8 && distToEnd > 0 && distToEnd < xf && pos >= safeLs) {
      const t = 1 - distToEnd / xf;
      const w1 = Math.cos(t * Math.PI * 0.5);
      const w2 = Math.sin(t * Math.PI * 0.5);
      const wrapPos = safeLs + (xf - distToEnd);
      const s2 = readLinearSpan(pcm, wrapPos, safeLs, safeLe);
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
      this.packRec = { elina: {}, grach: {} };

      this.ph = 0;
      this.tonePos = 0;
      this.recPos = 0;
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
      this.shortT = -1;
      this.cutFade = false;

      // Exclusive non-overlapping active source key ('', 'wail', 'yelp', 'hilo', 'phaser', 'manual', 'short')
      this.curSrcKey = '';
      this.curKind = '';
      this.zcEstHz = 0;
      this.zcLastSign = 0;
      this.zcSince = 0;

      this.hg = 0;
      this.hornWas = false;
      this.hornPos = 0;
      this.hornLp = 0;
      this.wolf = null;
      this.wolfPos = -1;
      this.wolfGain = 1;
      this.gm = 1;

      const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
      this.kAmp = k(0.004);
      this.kAmpOff = k(0.012);
      this.kAmpCut = k(0.006);     // crisp ~20ms cutoff for K-13 PULSAR & SHORT release
      this.kFastSwitch = k(0.0022); // ~7ms fast silent handoff between separate recorded clips
      this.kHornOn = k(0.003);
      this.kHornOff = k(0.014);
      this.kHornLp = k(1 / (2 * Math.PI * 5600));
      this.kMute = k(0.004);
      this.kMan = k(0.005);

      this.statN = 0;
      this.statPeak = 0;
      this.onStat = null;
    }

    get useRec() {
      return !!(this.rec.tone || this.rec.horn);
    }

    message(m) {
      if (!m) return;
      if (m.type === 'state') {
        Object.assign(this.s, m.s);
      } else if (m.type === 'sgu') {
        const next = m.id === 'k13' || m.id === 'elina' || m.id === 'grach' ? m.id : 'hazard';
        if (next !== this.sgu) {
          this.sgu = next;
          this.reset();
        }
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          le: m.loopEnd ? Math.round(m.loopEnd * this.sr) : m.pcm.length,
          hz: m.hz && m.hz > 20 ? m.hz : 900.0,
        };
      } else if (m.type === 'packSample') {
        if (!this.packRec[m.pack]) this.packRec[m.pack] = {};
        this.packRec[m.pack][m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          le: m.loopEnd ? Math.round(m.loopEnd * this.sr) : m.pcm.length,
          hz: m.hz && m.hz > 20 ? m.hz : 900.0,
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
      this.wolfPos = -1;
      this.shortT = -1;
      this.cutFade = false;
      this.curSrcKey = '';
      this.curKind = '';
      this.recPos = 0;
      this.tonePos = 0;
      this.hornWas = false;
      this.hornPos = 0;
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
        // Keep frequency phase-continuous from current pitch when switching modes (e.g. WAIL <-> YELP, HI-LO <-> WAIL)
        const cur = this.f > 180 ? this.f : p.lo;
        this.tf = Math.max(p.a, Math.min(p.b, cur));
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
        return 0;
      }

      // K-13 SHORT quick chirp (~0.24s crisp upward chirp)
      if (this.shortT >= 0) {
        this.shortT += blockDur;
        if (this.shortT > 0.24) {
          this.shortT = -1;
          this.cutFade = true;
        } else {
          this.cutFade = false;
          return 4;
        }
      }

      // K-13 MANUAL held while SIREN active -> smooth manual sweep override
      if (s.man === 'manualOverride' && s.manHeld) {
        if (this.mode === 'pat') {
          this.mf = silent ? MAN.start : Math.max(MAN.start, this.f || MAN.start);
          this.mode = 'manual';
        }
        this.trill = false;
        this.cutFade = false;
        return 2;
      }

      // Active automatic siren pattern (WAIL / YELP / HILO / PULSAR)
      if (s.tone) {
        const name = TONE_PAT[s.tone] || 'wail';
        if (this.mode !== 'pat' || this.patName !== name) {
          const fromSilence = silent || this.mode === 'idle';
          if (this.mode === 'manual' && this.mf > 180) {
            this.f = this.mf;
          }
          this.enterPat(name, fromSilence);
        }
        this.trill = false;
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
          this.cutFade = false;
          return 1;
        }
        if (this.trill) {
          this.trill = false;
          this.mf = 0;
          this.mode = 'idle';
          this.cutFade = true;
        }
        return 0;
      }

      // Releasing PULSAR stops cleanly
      if (this.trill) {
        this.trill = false;
        this.mf = 0;
        this.mode = 'idle';
        this.cutFade = true;
        return 0;
      }

      // STANDBY / PA / RADIO mode:
      // Hold MAN -> smooth manual wind-up (520 -> 1805 Hz); release -> smooth coast-down.
      // Re-pressing while coasting down smoothly winds back UP from current pitch (exact Video 1 0:04 & 0:40-0:41).
      if (this.mode === 'pat') {
        this.mf = silent ? 0 : this.f;
        this.mode = 'manual';
      }
      if (this.mode === 'idle') this.mode = 'manual';

      if ((s.man === 'manual' || s.man === 'pa' || s.man === 'manualOverride') && s.manHeld) {
        this.cutFade = false;
        return 2;
      }

      this.cutFade = false;
      return 3;
    }

    getSampleForKey(key) {
      if (this.sgu === 'elina' || this.sgu === 'grach') {
        const pack = this.packRec[this.sgu] || {};
        if (key === 'wail' && pack.wail) return { kind: 'clip', entry: pack.wail, xf: 650 };
        if (key === 'yelp' && pack.yelp) return { kind: 'clip', entry: pack.yelp, xf: 360 };
        if (key === 'hilo') {
          if (pack.hilo) return { kind: 'clip', entry: pack.hilo, xf: 300 };
          if (pack.phaser) return { kind: 'clip', entry: pack.phaser, xf: 300 };
        }
        if (key === 'phaser') {
          if (pack.phaser) return { kind: 'clip', entry: pack.phaser, xf: 300 };
          if (pack.tone) return { kind: 'tone', entry: pack.tone };
        }
        if (pack.tone) return { kind: 'tone', entry: pack.tone };
        return null;
      }

      // Premier Hazard 7007 & K-13:
      // Render all siren modes with genuine phase-locked Premier Hazard 7007 speaker recording (tone.wav)
      // following exact Video 1 / Video 2 frequency curves (full 520-1800 Hz WAIL, clean YELP, HI-LO, PULSAR, MAN)
      if (this.rec.tone) {
        return { kind: 'tone', entry: this.rec.tone };
      }
      return null;
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

      // Wolf one-shot NEVER overlaps active siren, manual sweep, or horn
      if (s.tone || hornT || (s.manHeld && s.man !== 'wolf') || !s.power) {
        this.wolfPos = -1;
      }

      // Determine exclusive target source key
      let wantKey = '';
      if (how === 1 && this.patName) {
        wantKey = this.patName;
      } else if (how === 2 || (how === 3 && this.mf > 0)) {
        wantKey = 'manual';
      } else if (how === 4) {
        wantKey = 'short';
      }

      const pack = this.sgu === 'elina' || this.sgu === 'grach' ? this.packRec[this.sgu] || {} : null;
      const hornEntry = pack && pack.horn ? pack.horn : this.rec.horn || null;
      const decay = Math.exp(-dt / MAN.tau);
      const ks = how === 1 && this.pat ? 1 - Math.exp(-dt / this.pat.smooth) : 0;

      let peak = 0;

      for (let i = 0; i < n; i++) {
        let activeWant = wantKey;
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
        } else if (how === 2) {
          if (this.mf < MAN.start) this.mf = MAN.start;
          const room = Math.max(0.18, Math.min(1, (MAN.max - this.mf) / 160));
          this.mf = Math.min(MAN.max, this.mf + MAN.rise * dt * room);
          this.f += (this.mf - this.f) * this.kMan;
        } else if (how === 3 && this.mf > 0) {
          this.mf *= decay;
          this.f += (this.mf - this.f) * this.kMan;
          if (this.mf < MAN.cut * 0.88) {
            this.mf = 0;
            activeWant = '';
          }
        } else if (how === 4) {
          const pNorm = Math.min(1, this.shortT / 0.19);
          this.f = 720 + 960 * Math.sin(pNorm * Math.PI * 0.5);
        }

        if (!Number.isFinite(this.f) || this.f < 0) this.f = 0;

        // Smooth source switching:
        // - For tone-driven Hazard/K-13 modes, stay phase-continuous without cutting to silence when switching tones
        // - For recorded clips (Elina/Grach), fade previous clip cleanly to near-zero BEFORE starting new clip
        const wantSpec = activeWant ? this.getSampleForKey(activeWant) : null;
        const wantKind = wantSpec ? wantSpec.kind : activeWant ? 'wave' : '';
        const bothTone = this.curKind === 'tone' && wantKind === 'tone';

        let targetAmp = 0;
        let ampRate = this.kAmpOff;

        if (activeWant !== this.curSrcKey) {
          if (bothTone) {
            this.curSrcKey = activeWant;
            targetAmp =
              how === 3 && this.mf > 0
                ? Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190))
                : how === 4 && this.shortT >= 0.19
                ? Math.max(0, 1 - (this.shortT - 0.19) / 0.05)
                : 1;
            ampRate = this.kAmp;
          } else if (this.curSrcKey === '' || this.amp <= 0.015) {
            this.curSrcKey = activeWant;
            this.curKind = wantKind;
            this.recPos = 0;
            if (activeWant) {
              targetAmp =
                how === 3 && this.mf > 0
                  ? Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190))
                  : how === 4 && this.shortT >= 0.19
                  ? Math.max(0, 1 - (this.shortT - 0.19) / 0.05)
                  : 1;
              ampRate = this.kAmp;
            }
          } else {
            targetAmp = 0;
            ampRate = this.kFastSwitch;
          }
        } else if (this.curSrcKey !== '') {
          this.curKind = wantKind;
          if (how === 3 && this.mf > 0) {
            targetAmp = Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190));
            ampRate = this.kAmpOff;
          } else if (how === 4) {
            targetAmp = this.shortT < 0.19 ? 1 : Math.max(0, 1 - (this.shortT - 0.19) / 0.05);
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
        if (this.amp <= 0.005 && activeWant === '') {
          this.curSrcKey = '';
          this.curKind = '';
        }

        // Render exclusive active siren
        let y = 0;
        if (this.amp > 1e-5 && this.curSrcKey !== '') {
          const srcSpec = this.getSampleForKey(this.curSrcKey);
          if (srcSpec && srcSpec.kind === 'clip') {
            const entry = srcSpec.entry;
            const pcm = entry.pcm;
            const ls = entry.ls || 0;
            const le = Math.min(pcm.length, entry.le || pcm.length);
            y = readSeamlessSpan(pcm, this.recPos, ls, le, srcSpec.xf) * this.amp;
            const span = Math.max(1, le - ls);
            this.recPos += 1;
            if (this.recPos >= le) {
              this.recPos = ls + ((this.recPos - le) % span);
            }
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
          } else if (srcSpec && srcSpec.kind === 'tone' && this.f > 40) {
            const entry = srcSpec.entry;
            const pcm = entry.pcm;
            const tLs = entry.ls || 0;
            const tLe = Math.min(pcm.length, entry.le || pcm.length);
            const tSpan = Math.max(32, tLe - tLs);
            if (this.tonePos < tLs) this.tonePos = tLs;
            const step = this.f / entry.hz;
            y = readSeamlessSpan(pcm, this.tonePos, tLs, tLe, 24) * this.amp;
            this.tonePos += step;
            if (this.tonePos >= tLe) {
              this.tonePos = tLs + ((this.tonePos - tLe) % tSpan);
            }
            this.zcEstHz = this.f;
          } else if (this.f > 40) {
            this.ph += this.f * dt;
            if (this.ph >= 1) this.ph -= Math.floor(this.ph);
            y = readWave(this.ph) * this.amp;
            this.zcEstHz = this.f;
          }
        }

        // Authentic HORN (phase-locked seamless loop of real WAV recording, zero allocation)
        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5 && hornEntry) {
          const hPcm = hornEntry.pcm;
          const hLs = hornEntry.ls || 0;
          const hLe = Math.min(hPcm.length, hornEntry.le || hPcm.length);
          const rawH = readSeamlessSpan(hPcm, this.hornPos, hLs, hLe, 160);
          this.hornLp += (rawH - this.hornLp) * this.kHornLp;
          const h = this.hornLp * 0.96;
          const hSpan = Math.max(1, hLe - hLs);
          this.hornPos += 1;
          if (this.hornPos >= hLe) {
            this.hornPos = hLs + ((this.hornPos - hLe) % hSpan);
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
        const outHz = this.hg > 0.5 ? 0 : sounding ? Math.round(this.zcEstHz || this.f) : 0;
        this.onStat({
          type: 'stat',
          f: outHz,
          horn: this.hg > 0.5,
          wolf: this.wolfPos >= 0,
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
