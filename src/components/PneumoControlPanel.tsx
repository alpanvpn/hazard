import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Gauge } from 'lucide-react';
import type { PneumoAudioEngine } from '../audio/pneumoAudio';

interface PneumoControlPanelProps {
  audioEngine: PneumoAudioEngine | null;
  onHaptic: (pattern?: number | number[]) => void;
  stopSignal?: number;
}

export interface PneumoPressures {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

const MAX_BAR = 8.0;
const PRESET_1: PneumoPressures = { fl: 2.0, fr: 2.0, rl: 1.8, rr: 1.8 };
const PRESET_2: PneumoPressures = { fl: 6.3, fr: 6.3, rl: 5.8, rr: 5.8 };
const INITIAL_PRESSURES: PneumoPressures = { fl: 6.3, fr: 6.3, rl: 3.9, rr: 3.9 };

const clampBar = (v: number) => Math.max(0, Math.min(MAX_BAR, Math.round(v * 10) / 10));

const readSavedPressures = (): PneumoPressures => {
  try {
    const raw = window.localStorage.getItem('alpan_pneumo_bar');
    if (raw) {
      const p = JSON.parse(raw) as Partial<PneumoPressures>;
      if (
        typeof p.fl === 'number' &&
        typeof p.fr === 'number' &&
        typeof p.rl === 'number' &&
        typeof p.rr === 'number'
      ) {
        return {
          fl: clampBar(p.fl),
          fr: clampBar(p.fr),
          rl: clampBar(p.rl),
          rr: clampBar(p.rr),
        };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return INITIAL_PRESSURES;
};

interface CornerGaugeProps {
  label: string;
  value: number;
  active: boolean;
}

const CornerGauge: React.FC<CornerGaugeProps> = ({ label, value, active }) => {
  const ratio = Math.max(0, Math.min(1, value / MAX_BAR));
  const r = 24;
  const c = 2 * Math.PI * r;
  const arcLen = c * (250 / 360);
  const filled = arcLen * ratio;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[66px] h-[66px] sm:w-[74px] sm:h-[74px] flex items-center justify-center">
        <svg
          viewBox="0 0 64 64"
          className="w-full h-full overflow-visible"
          style={{ transform: 'rotate(145deg)' }}
          aria-hidden="true"
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${c}`}
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={active ? '#fde047' : 'var(--acc, #f0c419)'}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
            style={{
              filter: active
                ? 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.75))'
                : 'drop-shadow(0 0 4px rgba(240, 196, 25, 0.35))',
              transition: 'stroke-dasharray 85ms linear',
            }}
          />
        </svg>
        <span className="mono-nums absolute inset-0 flex items-center justify-center text-[15px] sm:text-base font-extrabold text-white pt-0.5">
          {value.toFixed(1)}
        </span>
      </div>
      <span className="text-[11px] font-extrabold tracking-wider text-[var(--dim)] mt-0.5">
        {label}
      </span>
    </div>
  );
};

export const PneumoControlPanel: React.FC<PneumoControlPanelProps> = ({
  audioEngine,
  onHaptic,
  stopSignal = 0,
}) => {
  const [pressures, setPressures] = useState<PneumoPressures>(readSavedPressures);
  const [compressorOn, setCompressorOn] = useState<boolean>(false);
  const [activeControl, setActiveControl] = useState<
    null | 'front-up' | 'front-down' | 'rear-up' | 'rear-down'
  >(null);
  const [activePreset, setActivePreset] = useState<1 | 2 | null>(null);

  const pressuresRef = useRef(pressures);
  pressuresRef.current = pressures;
  const holdTimerRef = useRef<number | null>(null);
  const presetTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const unloadOnStopRef = useRef(false);
  const hitLimitRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('alpan_pneumo_bar', JSON.stringify(pressures));
    } catch {
      // Ignore
    }
  }, [pressures]);

  const stopAxleHold = useCallback(() => {
    pointerIdRef.current = null;
    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setActiveControl(null);
    audioEngine?.stopAir(true);
  }, [audioEngine]);

  const clearPresetAnim = useCallback(() => {
    if (presetTimerRef.current !== null) {
      window.clearInterval(presetTimerRef.current);
      presetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (stopSignal > 0) {
      unloadOnStopRef.current = false;
      stopAxleHold();
      clearPresetAnim();
      setCompressorOn(false);
      void audioEngine?.setCompressorSound(false, false);
    }
  }, [stopSignal, stopAxleHold, clearPresetAnim, audioEngine]);

  useEffect(() => {
    const onGlobalUp = () => {
      if (pointerIdRef.current !== null || holdTimerRef.current !== null) {
        stopAxleHold();
      }
    };
    window.addEventListener('pointerup', onGlobalUp);
    window.addEventListener('pointercancel', onGlobalUp);
    window.addEventListener('blur', onGlobalUp);
    return () => {
      window.removeEventListener('pointerup', onGlobalUp);
      window.removeEventListener('pointercancel', onGlobalUp);
      window.removeEventListener('blur', onGlobalUp);
    };
  }, [stopAxleHold]);

  // Compressor gently raises low bags up toward working pressure (6.3 front / 5.8 rear)
  // and turns off automatically with a governor unloader sneeze ("пш-тсс") when finished
  useEffect(() => {
    const withUnload = unloadOnStopRef.current;
    unloadOnStopRef.current = false;
    void audioEngine?.setCompressorSound(compressorOn, !compressorOn && withUnload);
    if (!compressorOn) return;

    const id = window.setInterval(() => {
      let reached = true;
      setPressures((prev) => {
        const next: PneumoPressures = {
          fl: prev.fl < 6.3 ? clampBar(prev.fl + 0.1) : prev.fl,
          fr: prev.fr < 6.3 ? clampBar(prev.fr + 0.1) : prev.fr,
          rl: prev.rl < 5.8 ? clampBar(prev.rl + 0.1) : prev.rl,
          rr: prev.rr < 5.8 ? clampBar(prev.rr + 0.1) : prev.rr,
        };
        reached = next.fl >= 6.3 && next.fr >= 6.3 && next.rl >= 5.8 && next.rr >= 5.8;
        return next;
      });
      if (reached) {
        unloadOnStopRef.current = true;
        setCompressorOn(false);
      }
    }, 340);

    return () => {
      window.clearInterval(id);
    };
  }, [compressorOn, audioEngine]);

  useEffect(() => {
    return () => {
      clearPresetAnim();
      if (holdTimerRef.current !== null) window.clearInterval(holdTimerRef.current);
    };
  }, [clearPresetAnim]);

  const startAxleAction = (
    axle: 'front' | 'rear',
    dir: 'up' | 'down',
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    clearPresetAnim();
    setActivePreset(null);
    hitLimitRef.current = false;

    // Dropping air immediately cancels compressor so compressor never fights lowering
    if (dir === 'down' && compressorOn) {
      unloadOnStopRef.current = false;
      setCompressorOn(false);
    }

    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const key = `${axle}-${dir}` as 'front-up' | 'front-down' | 'rear-up' | 'rear-down';
    setActiveControl(key);
    onHaptic(12);

    const delta = dir === 'up' ? 0.2 : -0.2;
    const canMoveNow = () => {
      const cur = pressuresRef.current;
      if (axle === 'front') {
        return dir === 'up' ? cur.fl < MAX_BAR || cur.fr < MAX_BAR : cur.fl > 0 || cur.fr > 0;
      }
      return dir === 'up' ? cur.rl < MAX_BAR || cur.rr < MAX_BAR : cur.rl > 0 || cur.rr > 0;
    };

    const applyStep = () => {
      let moved = false;
      setPressures((prev) => {
        if (axle === 'front') {
          const nfl = clampBar(prev.fl + delta);
          const nfr = clampBar(prev.fr + delta);
          moved = nfl !== prev.fl || nfr !== prev.fr;
          return { ...prev, fl: nfl, fr: nfr };
        }
        const nrl = clampBar(prev.rl + delta);
        const nrr = clampBar(prev.rr + delta);
        moved = nrl !== prev.rl || nrr !== prev.rr;
        return { ...prev, rl: nrl, rr: nrr };
      });
      if (!moved && !hitLimitRef.current) {
        hitLimitRef.current = true;
        audioEngine?.stopAir(false);
        void audioEngine?.playLimitStop(dir);
      }
    };

    if (canMoveNow()) {
      void audioEngine?.startAir(dir === 'down' ? 'dump' : 'fill', true);
      applyStep();
    } else {
      hitLimitRef.current = true;
      void audioEngine?.playLimitStop(dir);
    }

    holdTimerRef.current = window.setInterval(() => {
      applyStep();
    }, 85);
  };

  const applyPreset = (num: 1 | 2) => {
    stopAxleHold();
    clearPresetAnim();
    if (num === 1 && compressorOn) {
      unloadOnStopRef.current = false;
      setCompressorOn(false);
    }
    onHaptic([12, 24, 12]);
    setActivePreset(num);

    const target = num === 1 ? PRESET_1 : PRESET_2;
    const cur = pressuresRef.current;
    const avgCur = (cur.fl + cur.fr + cur.rl + cur.rr) / 4;
    const avgTarget = (target.fl + target.fr + target.rl + target.rr) / 4;
    const dir: 'up' | 'down' = avgTarget >= avgCur ? 'up' : 'down';

    if (
      cur.fl === target.fl &&
      cur.fr === target.fr &&
      cur.rl === target.rl &&
      cur.rr === target.rr
    ) {
      void audioEngine?.playQuickBurst(num === 1 ? 'dump' : 'fill', 260);
      return;
    }

    void audioEngine?.playPresetTransition(dir, 650);

    presetTimerRef.current = window.setInterval(() => {
      let done = true;
      setPressures((prev) => {
        const stepToward = (a: number, b: number) => {
          if (Math.abs(a - b) <= 0.25) return b;
          done = false;
          return clampBar(a + (b > a ? 0.2 : -0.2));
        };
        const next: PneumoPressures = {
          fl: stepToward(prev.fl, target.fl),
          fr: stepToward(prev.fr, target.fr),
          rl: stepToward(prev.rl, target.rl),
          rr: stepToward(prev.rr, target.rr),
        };
        if (done) {
          clearPresetAnim();
        }
        return next;
      });
    }, 55);
  };

  const toggleCompressor = () => {
    onHaptic(14);
    setCompressorOn((prev) => {
      if (prev) {
        unloadOnStopRef.current = true;
      }
      return !prev;
    });
  };

  const handleQuickDump = () => {
    onHaptic([14, 18, 12]);
    void audioEngine?.playQuickBurst('dump', 420);
    setPressures((prev) => ({
      fl: clampBar(prev.fl > 0.2 ? prev.fl - 0.1 : prev.fl),
      fr: clampBar(prev.fr > 0.2 ? prev.fr - 0.1 : prev.fr),
      rl: clampBar(prev.rl > 0.2 ? prev.rl - 0.1 : prev.rl),
      rr: clampBar(prev.rr > 0.2 ? prev.rr - 0.1 : prev.rr),
    }));
  };

  const frontBusy = activeControl === 'front-up' || activeControl === 'front-down';
  const rearBusy = activeControl === 'rear-up' || activeControl === 'rear-down';

  return (
    <div className="panel-surface p-3.5 sm:p-4 space-y-3">
      {/* Clean Header matching reference video */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-4 h-4 text-[var(--acc)] shrink-0" aria-hidden="true" />
          <span className="text-sm font-extrabold tracking-wider text-[var(--acc)] truncate">
            ПНЕВМОПОДВЕСКА
          </span>
        </div>
        <span className="text-[11px] font-bold tracking-wider text-[var(--dim)] shrink-0">
          4-КОНТУРНАЯ
        </span>
      </div>

      {/* 4 Circular Corner Gauges */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 pt-0.5">
        <CornerGauge label="FL" value={pressures.fl} active={frontBusy || compressorOn} />
        <CornerGauge label="FR" value={pressures.fr} active={frontBusy || compressorOn} />
        <CornerGauge label="RL" value={pressures.rl} active={rearBusy || compressorOn} />
        <CornerGauge label="RR" value={pressures.rr} active={rearBusy || compressorOn} />
      </div>

      {/* ПЕРЕД (Front Axle) */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 space-y-2">
        <span className="block text-center text-[11px] font-extrabold tracking-[0.18em] text-[var(--dim)]">
          ПЕРЕД
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onPointerDown={(e) => startAxleAction('front', 'up', e)}
            onPointerUp={stopAxleHold}
            onPointerCancel={stopAxleHold}
            onLostPointerCapture={stopAxleHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={activeControl === 'front-up'}
            className={`siren-btn no-select py-2.5 px-3 text-xs sm:text-[13px] font-extrabold tracking-wide flex items-center justify-center gap-1.5 ${
              activeControl === 'front-up' ? 'active pressed' : ''
            }`}
          >
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>ПОДНЯТЬ</span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => startAxleAction('front', 'down', e)}
            onPointerUp={stopAxleHold}
            onPointerCancel={stopAxleHold}
            onLostPointerCapture={stopAxleHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={activeControl === 'front-down'}
            className={`siren-btn no-select py-2.5 px-3 text-xs sm:text-[13px] font-extrabold tracking-wide flex items-center justify-center gap-1.5 ${
              activeControl === 'front-down' ? 'horn-active pressed' : ''
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />
            <span>ОПУСТИТЬ</span>
          </button>
        </div>
      </div>

      {/* ЗАД (Rear Axle) */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 space-y-2">
        <span className="block text-center text-[11px] font-extrabold tracking-[0.18em] text-[var(--dim)]">
          ЗАД
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onPointerDown={(e) => startAxleAction('rear', 'up', e)}
            onPointerUp={stopAxleHold}
            onPointerCancel={stopAxleHold}
            onLostPointerCapture={stopAxleHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={activeControl === 'rear-up'}
            className={`siren-btn no-select py-2.5 px-3 text-xs sm:text-[13px] font-extrabold tracking-wide flex items-center justify-center gap-1.5 ${
              activeControl === 'rear-up' ? 'active pressed' : ''
            }`}
          >
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>ПОДНЯТЬ</span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => startAxleAction('rear', 'down', e)}
            onPointerUp={stopAxleHold}
            onPointerCancel={stopAxleHold}
            onLostPointerCapture={stopAxleHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={activeControl === 'rear-down'}
            className={`siren-btn no-select py-2.5 px-3 text-xs sm:text-[13px] font-extrabold tracking-wide flex items-center justify-center gap-1.5 ${
              activeControl === 'rear-down' ? 'horn-active pressed' : ''
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />
            <span>ОПУСТИТЬ</span>
          </button>
        </div>
      </div>

      {/* Presets & Compressor Row (Solid gold presets matching video in Alpan style) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => applyPreset(1)}
          aria-pressed={activePreset === 1}
          className={`siren-btn py-2.5 px-2 text-xs font-extrabold tracking-wide whitespace-nowrap ${
            activePreset === 1 ? 'gold-solid' : 'active'
          }`}
        >
          ПРЕСЕТ 1
        </button>
        <button
          type="button"
          onClick={() => applyPreset(2)}
          aria-pressed={activePreset === 2}
          className={`siren-btn py-2.5 px-2 text-xs font-extrabold tracking-wide whitespace-nowrap ${
            activePreset === 2 ? 'gold-solid' : 'active'
          }`}
        >
          ПРЕСЕТ 2
        </button>
        <button
          type="button"
          onClick={toggleCompressor}
          aria-pressed={compressorOn}
          className={`siren-btn py-2.5 px-2 text-xs font-extrabold tracking-wide whitespace-nowrap ${
            compressorOn ? 'gold-solid' : ''
          }`}
        >
          КОМПРЕССОР
        </button>
      </div>

      <button
        type="button"
        onClick={handleQuickDump}
        className="siren-btn w-full py-2 px-3 text-xs font-extrabold tracking-wider text-white/90"
      >
        ПШИК · СБРОС ВОЗДУХА
      </button>

      {compressorOn && (
        <p className="text-center text-xs font-extrabold tracking-widest text-[var(--acc)] pt-0.5">
          КОМПРЕССОР РАБОТАЕТ
        </p>
      )}
    </div>
  );
};
