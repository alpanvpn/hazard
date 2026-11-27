(function (root) {
  'use strict';

  // Exact Premier Hazard 7007 & K-13 HILO / MANUAL / SHORT sweep curves (rendered with real recorded tone.wav!)
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

  // Manual sweep parameters matching Video 1 (0:00, 0:04, 0:39-0:41):
  // - 1st MAN hold ramps up 520 -> 1805 Hz; release coasts down smoothly
  // - 2nd MAN press while coasting down above 720 Hz catches into PULSAR, stopping cleanly on release
  const MAN = { start: 520, max: 1805, rise: 660, tau: 1.45, cut: 295, burst: 720 };

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

  // Seamless cosine crossfade loop reader (zero wrap click/pop on real recordings & tone cycles)
  function readSeamless(pcm, pos, ls, maxXf) {
    const len = pcm.length;
    if (len === 0) return 0;
    const loopLen = Math.max(64, len - ls);
    const xf = Math.min(loopLen >> 2, maxXf || 700);
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
      this.wasFalling = false;
      this.manWasHeld = false;
      this.shortT = -1;
      this.cutFade = false;

      // Exclusive non-overlapping active source key ('', 'wail', 'yelp', 'hilo', 'phaser', 'manual', 'short')
      this.curSrcKey = '';
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
      this.kAmpCut = k(0.007); // crisp ~25ms cutoff for PULSAR release & clean non-overlapping switch
      this.kFastSwitch = k(0.0025); // ~8ms fast silent handoff between modes so two sirens NEVER collide
      this.kHornOn = k(0.003);
      this.kHornOff = k(0.014);
      this.kHornLp = k(1 / (2 * Math.PI * 5200));
      this.kMute = k(0.004);
      this.kMan = k(0.005);

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
        const next = m.id === 'k13' || m.id === 'elina' || m.id === 'grach' ? m.id : 'hazard';
        if (next !== this.sgu) {
          this.sgu = next;
          this.reset();
        }
      } else if (m.type === 'sample') {
        this.rec[m.name] = {
          pcm: m.pcm,
          ls: Math.round((m.loopStart || 0) * this.sr),
          hz: m.hz && m.hz > 20 ? m.hz : 904.4,
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
      this.curSrcKey = '';
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
      // - 2nd MAN press while spinning down above 720 Hz catches into crisp PULSAR, stopping cleanly on release
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

      // Releasing PULSAR stops cleanly within ~30ms (exact Video 1 0:41 behavior)
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
          // For Elina (which has no separate phaser WAV), use real Elina tone.wav swept at PULSAR cadence!
          if (pack.tone) return { kind: 'tone', entry: pack.tone };
        }
        if (key === 'manual' || key === 'short') {
          if (pack.tone) return { kind: 'tone', entry: pack.tone };
        }
        if (pack.tone) return { kind: 'tone', entry: pack.tone };
        return null;
      }

      // Premier Hazard 7007 & K-13: 100% genuine video-extracted recordings!
      if (key === 'wail' && this.rec.wail) return { kind: 'clip', entry: this.rec.wail, xf: 700 };
      if (key === 'yelp' && this.rec.yelp) return { kind: 'clip', entry: this.rec.yelp, xf: 320 };
      if (key === 'phaser' && this.rec.phaser) return { kind: 'clip', entry: this.rec.phaser, xf: 260 };
      if ((key === 'hilo' || key === 'manual' || key === 'short') && this.rec.tone) {
        return { kind: 'tone', entry: this.rec.tone };
      }
      if (this.rec.tone) return { kind: 'tone', entry: this.rec.tone };
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
        // Update frequency curve for tone-driven modes (HILO, MANUAL, SHORT, fallback)
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
            this.wasFalling = false;
            activeWant = '';
          }
        } else if (how === 4) {
          const pNorm = Math.min(1, this.shortT / 0.21);
          this.f = 700 + 960 * Math.sin(pNorm * Math.PI * 0.5);
        }

        if (!Number.isFinite(this.f) || this.f < 0) this.f = 0;

        // Clean non-overlapping switch: fade previous mode cleanly to near-zero BEFORE starting new mode
        let targetAmp = 0;
        let ampRate = this.kAmpOff;

        if (activeWant !== this.curSrcKey) {
          if (this.curSrcKey === '' || this.amp <= 0.015) {
            this.curSrcKey = activeWant;
            this.recPos = 0;
            if (activeWant) {
              targetAmp =
                how === 3 && this.mf > 0
                  ? Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190))
                  : how === 4 && this.shortT >= 0.2
                  ? Math.max(0, 1 - (this.shortT - 0.2) / 0.05)
                  : 1;
              ampRate = this.kAmp;
            }
          } else {
            // Smooth fast ~8ms silence handoff so two modes NEVER sound mixed together
            targetAmp = 0;
            ampRate = this.kFastSwitch;
          }
        } else if (this.curSrcKey !== '') {
          if (how === 3 && this.mf > 0) {
            targetAmp = Math.max(0, Math.min(1, (this.mf - MAN.cut) / 190));
            ampRate = this.kAmpOff;
          } else if (how === 4) {
            targetAmp = this.shortT < 0.2 ? 1 : Math.max(0, 1 - (this.shortT - 0.2) / 0.05);
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
        }

        // Render exclusive active audio using genuine recorded WAVs
        let y = 0;
        if (this.amp > 1e-5 && this.curSrcKey !== '') {
          const srcSpec = this.getSampleForKey(this.curSrcKey);
          if (srcSpec && srcSpec.kind === 'clip') {
            const entry = srcSpec.entry;
            const pcm = entry.pcm;
            const ls = entry.ls || 0;
            y = readSeamless(pcm, this.recPos, ls, srcSpec.xf) * this.amp;
            const span = Math.max(1, pcm.length - ls);
            this.recPos += 1;
            if (this.recPos >= pcm.length) {
              this.recPos = ls + ((this.recPos - pcm.length) % span);
            }
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
          } else if (srcSpec && srcSpec.kind === 'tone' && this.f > 40) {
            const entry = srcSpec.entry;
            const pcm = entry.pcm;
            const step = this.f / entry.hz;
            y = readSeamless(pcm, this.tonePos, 0, 48) * this.amp;
            this.tonePos += step;
            if (this.tonePos >= pcm.length) {
              this.tonePos %= pcm.length;
            }
            this.zcEstHz = this.f;
          } else if (this.f > 40) {
            this.ph += this.f * dt;
            if (this.ph >= 1) this.ph -= Math.floor(this.ph);
            y = readWave(this.ph) * this.amp;
            this.zcEstHz = this.f;
          }
        }

        // Authentic HORN (crossfade-looped real WAV recording, smoothly overrides siren)
        this.hg += (hornT - this.hg) * (hornT > this.hg ? this.kHornOn : this.kHornOff);
        if (this.hg > 1e-5 && hornEntry) {
          const hPcm = hornEntry.pcm;
          const hLs = hornEntry.ls || 0;
          const hLe = Math.min(hPcm.length, hornEntry.le || hPcm.length);
          const hSlice = hLe < hPcm.length ? hPcm.subarray(0, hLe) : hPcm;
          const rawH = readSeamless(hSlice, this.hornPos, hLs, 480);
          this.hornLp += (rawH - this.hornLp) * this.kHornLp;
          const h = this.hornLp * 0.94;
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
