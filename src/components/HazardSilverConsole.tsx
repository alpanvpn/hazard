import React from 'react';
import { Music, Settings } from 'lucide-react';
import type { SirenMode } from '../audio/sirenEngine';
import { FlagId, RegionFlags, SiteUrlLink } from './RegionFlags';
import { RotaryKnob } from './RotaryKnob';

interface HazardSilverConsoleProps {
  powered: boolean;
  sounding: boolean;
  mode: SirenMode;
  altActive: boolean;
  altTargetMode?: SirenMode;
  volume: number;
  radioName: string | null;
  manPressed: boolean;
  hornPressed: boolean;
  hornActive: boolean;
  pulsarPressed: boolean;
  pttPressed: boolean;
  analog: boolean;
  powerSlider: number;
  melodyLabel: string;
  flags: FlagId[];
  onVolumeChange: (v: number) => void;
  onSelectMode: (mode: SirenMode) => void;
  onManDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onManUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHornDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHornUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPulsarDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPulsarUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPttDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPttUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onAnalogChange: (analog: boolean) => void;
  onPowerSliderChange: (val: number) => void;
  onOpenSettings: () => void;
  onPickRadioFile: () => void;
}

const SILVER_ARC_MODES: Array<{ mode: SirenMode; label: string; deg: number }> = [
  { mode: 'hilo', label: 'HILO', deg: -118 },
  { mode: 'yelp', label: 'YELP', deg: -72 },
  { mode: 'wail', label: 'WAIL', deg: -26 },
  { mode: 'standby', label: 'STBY', deg: 26 },
  { mode: 'pa', label: 'PA', deg: 72 },
  { mode: 'radio', label: 'RADIO', deg: 118 },
];

const MODE_SHORT: Record<SirenMode, string> = {
  standby: 'STBY',
  hilo: 'HILO',
  yelp: 'YELP',
  wail: 'WAIL',
  pa: 'PA',
  radio: 'RADIO',
  phaser: 'PULSAR',
  melody: 'МЭН',
};

export const HazardSilverConsole: React.FC<HazardSilverConsoleProps> = ({
  powered,
  sounding,
  mode,
  altActive,
  altTargetMode,
  volume,
  radioName,
  manPressed,
  hornPressed,
  hornActive,
  pulsarPressed,
  pttPressed,
  analog,
  powerSlider,
  melodyLabel,
  flags,
  onVolumeChange,
  onSelectMode,
  onManDown,
  onManUp,
  onHornDown,
  onHornUp,
  onPulsarDown,
  onPulsarUp,
  onPttDown,
  onPttUp,
  onAnalogChange,
  onPowerSliderChange,
  onOpenSettings,
  onPickRadioFile,
}) => {
  const modeIndex = Math.max(
    0,
    SILVER_ARC_MODES.findIndex((m) => m.mode === mode)
  );
  const modeKnobValue = modeIndex / (SILVER_ARC_MODES.length - 1);

  const handleModeKnob = (v: number) => {
    const idx = Math.min(
      SILVER_ARC_MODES.length - 1,
      Math.max(0, Math.round(v * (SILVER_ARC_MODES.length - 1)))
    );
    const next = SILVER_ARC_MODES[idx].mode;
    if (next !== mode || !powered) {
      onSelectMode(next);
    }
  };

  const hornLit = hornPressed || hornActive;
  const manLit = manPressed || (powered && altActive);
  const melodyLit = powered && mode === 'melody';
  const outLit =
    powered && (sounding || hornLit || pulsarPressed || manPressed || (mode !== 'standby' && mode !== 'radio' && mode !== 'pa'));

  const lcdModeText = !powered
    ? 'OFF'
    : hornLit
    ? 'HORN'
    : pulsarPressed
    ? 'PULSAR'
    : pttPressed
    ? 'PTT'
    : altActive && altTargetMode
    ? MODE_SHORT[altTargetMode]
    : manPressed && (mode === 'standby' || mode === 'radio' || mode === 'pa')
    ? 'MAN'
    : MODE_SHORT[mode];

  const lcdRightText = !powered
    ? 'питание выключено'
    : pttPressed
    ? 'микрофон в эфире · 100 Вт'
    : pulsarPressed
    ? 'пульсар · 100 Вт'
    : mode === 'melody' && !hornLit && !manPressed
    ? `${melodyLabel} · пресет МЭН`
    : mode === 'pa' && !hornLit && !manPressed
    ? 'нажмите PTT и говорите'
    : mode === 'radio' && !hornLit && !manPressed
    ? radioName
      ? `радио · ${radioName}`
      : 'вход пуст — подайте файл'
    : mode === 'standby' && !outLit
    ? 'режим ожидания'
    : 'тон на выходе · 100 Вт';

  return (
    <div className="space-y-3">
      {/* Top Big Stencil Title "HAZARD 7007" (HAZARD white, 7007 orange) */}
      <div className="text-center pt-0.5 pb-1 select-none">
        <span className="font-mono text-2xl sm:text-[28px] font-extrabold tracking-[0.1em] text-white">HAZARD </span>
        <span className="font-mono text-2xl sm:text-[28px] font-extrabold tracking-[0.1em] text-[#ff7a18]">7007</span>
      </div>

      {/* Silver Brushed-Metal Console Body (matching reference screenshot) */}
      <div className="silver-chassis">
        {/* Top Hardware Bar: Lying Wolf Emblem | PWR + OUT LEDs + Settings Gear */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="inline-flex items-center justify-start px-0.5 py-0.5 select-none">
            <svg
              width="76"
              height="38"
              viewBox="0 0 76 38"
              fill="none"
              aria-label="Эмблема волка Premier Hazard"
              className="text-[#181c24]"
            >
              <path
                d="M7 31 L20 31 L25.5 28 L27.5 18 L27 14.5 L24.5 13 L28 10.5 L29.2 4.5 L33 9 L36.8 4.5 L37.8 11.5 Q39.5 18.5 46.5 19.5 L55 19.5 Q59 19.5 62 24 L66.5 31 L71 31"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M28.5 29 L33 33.5 M50 29 L45.5 33.5"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
              />
              <line x1="6" y1="33.5" x2="25" y2="33.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="57" y1="33.5" x2="72" y2="33.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="4" y1="36" x2="73" y2="36" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  powered
                    ? 'bg-[#22c55e] shadow-[0_0_8px_#22c55e]'
                    : 'bg-[#4b5563] shadow-inner'
                }`}
              />
              <span className="font-mono text-[11.5px] font-bold tracking-[0.14em] text-[#1e232b]">PWR</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  outLit
                    ? 'bg-[#ff7a18] shadow-[0_0_9px_#ff7a18]'
                    : 'bg-[#2b303a] shadow-inner'
                }`}
              />
              <span className="font-mono text-[11.5px] font-bold tracking-[0.14em] text-[#1e232b]">OUT</span>
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Открыть настройки"
              className="w-8.5 h-8.5 rounded-full border border-black/25 bg-gradient-to-b from-[#d8dde5] to-[#a7afb9] text-[#222731] shadow-[0_2px_4px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.8)] flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
            >
              <Settings className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Dark Recessed LCD Bar */}
        <div
          onClick={mode === 'radio' ? onPickRadioFile : undefined}
          className={`silver-lcd mb-4 ${mode === 'radio' ? 'cursor-pointer' : ''}`}
        >
          <span className="font-mono text-[19px] sm:text-xl font-extrabold tracking-[0.06em] text-[#ff7a18] shrink-0">
            {lcdModeText}
          </span>
          <span className="font-mono text-[11.5px] sm:text-xs font-medium tracking-[0.02em] text-[#9ca3af] text-right truncate">
            {lcdRightText}
          </span>
        </div>

        {/* Dual Realistic Metallic Knobs */}
        <div className="grid grid-cols-[0.86fr_1.14fr] gap-3 items-center mb-4">
          {/* Left: OFF / VOL Smooth Knob */}
          <div className="flex flex-col items-center">
            <div className="relative h-[134px] w-[124px] flex items-center justify-center">
              <RotaryKnob
                size="sm"
                hideTicks
                value={powered ? volume : 0}
                onChange={onVolumeChange}
                ariaLabel="OFF / VOL"
                displayText={powered ? `${Math.round(volume * 100)}%` : 'OFF'}
                variant="silver"
              />
              <span className="font-mono absolute bottom-2 left-2 text-[10.5px] font-bold tracking-[0.12em] text-[#2b313b]">
                OFF
              </span>
              <span className="font-mono absolute bottom-2 right-2 text-[10.5px] font-bold tracking-[0.12em] text-[#2b313b]">
                VOL
              </span>
            </div>
            <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#353b47] mt-0.5">
              OFF / VOL
            </span>
          </div>

          {/* Right: 6-Position РЕЖИМ Knob */}
          <div className="flex flex-col items-center">
            <div className="relative h-[144px] w-full max-w-[228px]">
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: '50%', top: '56%' }}
              >
                <RotaryKnob
                  size="sm"
                  hideTicks
                  value={modeKnobValue}
                  steps={SILVER_ARC_MODES.length - 1}
                  onTapStep={() => {
                    const next = SILVER_ARC_MODES[(modeIndex + 1) % SILVER_ARC_MODES.length].mode;
                    onSelectMode(next);
                  }}
                  onChange={handleModeKnob}
                  ariaLabel="РЕЖИМ"
                  displayText={MODE_SHORT[mode]}
                  variant="silver"
                />
              </div>

              {SILVER_ARC_MODES.map((item) => {
                const rad = ((item.deg - 90) * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const left = 50 + 39 * cos;
                const top = 56 + 44 * sin;
                const active = powered && mode === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => onSelectMode(item.mode)}
                    aria-pressed={active}
                    style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
                    className={`silver-mode-pill ${active ? 'active' : ''}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#353b47] mt-0.5">
              РЕЖИМ
            </span>
          </div>
        </div>

        {/* 2x2 Left-Aligned Monospace Recessed Buttons: MAN | HORN | PTT | PULSAR */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onPointerDown={onManDown}
            onPointerUp={onManUp}
            onPointerCancel={onManUp}
            onLostPointerCapture={onManUp}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={manLit}
            className={`silver-well-btn no-select text-[#ff922b] ${
              manLit ? 'lit-amber pressed' : ''
            }`}
          >
            MAN
          </button>

          <button
            type="button"
            onPointerDown={onHornDown}
            onPointerUp={onHornUp}
            onPointerCancel={onHornUp}
            onLostPointerCapture={onHornUp}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={hornLit}
            className={`silver-well-btn no-select text-[#ff4d4f] ${
              hornLit ? 'lit-red pressed' : ''
            }`}
          >
            HORN
          </button>

          <button
            type="button"
            onPointerDown={onPttDown}
            onPointerUp={onPttUp}
            onPointerCancel={onPttUp}
            onLostPointerCapture={onPttUp}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={pttPressed}
            className={`silver-well-btn no-select text-[#38d97c] ${
              pttPressed ? 'lit-green pressed' : ''
            }`}
          >
            PTT
          </button>

          <button
            type="button"
            onPointerDown={onPulsarDown}
            onPointerUp={onPulsarUp}
            onPointerCancel={onPulsarUp}
            onLostPointerCapture={onPulsarUp}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={pulsarPressed}
            className={`silver-well-btn no-select text-[#3b82f6] ${
              pulsarPressed ? 'lit-blue pressed' : ''
            }`}
          >
            PULSAR
          </button>
        </div>

        {/* Screenshot-Matched Labeled Control Rows: РЕЖИМ MAN + ГРОМКОСТЬ */}
        <div className="grid grid-cols-[1.05fr_0.95fr] gap-3 items-end">
          <div>
            <span className="block font-mono text-[10.5px] font-bold tracking-[0.16em] text-[#2b313b] uppercase mb-1.5 px-0.5">
              РЕЖИМ MAN
            </span>
            <div className="silver-seg-track grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => onAnalogChange(false)}
                aria-pressed={!analog}
                className={`silver-seg-btn ${!analog ? 'active-slate' : ''}`}
              >
                Оригинал
              </button>
              <button
                type="button"
                onClick={() => onAnalogChange(true)}
                aria-pressed={analog}
                className={`silver-seg-btn ${analog ? 'active-amber' : ''}`}
              >
                Аналог
              </button>
            </div>
          </div>

          <div>
            <span className="block font-mono text-[10.5px] font-bold tracking-[0.16em] text-[#2b313b] uppercase mb-1.5 px-0.5">
              ГРОМКОСТЬ
            </span>
            <div className="silver-seg-track flex items-center gap-2 px-2.5 min-h-[42px]">
              <input
                type="range"
                min={0}
                max={100}
                value={powerSlider}
                aria-label="Громкость Hazard 7007"
                onChange={(e) => onPowerSliderChange(Number(e.target.value))}
                className="w-full accent-[#ff7a18] cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-white w-7 text-right shrink-0">
                {powerSlider}
              </span>
            </div>
          </div>
        </div>

        {/* MAN Button Presets (Customizable frequency curve & presets in Settings) */}
        <div className="mt-3.5">
          <span className="block font-mono text-[10.5px] font-bold tracking-[0.16em] text-[#2b313b] uppercase mb-1.5 px-0.5">
            ПРЕСЕТ КНОПКИ «МЭН» (MAN)
          </span>
          <div className="silver-seg-track flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectMode('melody')}
              aria-pressed={melodyLit}
              className={`silver-seg-btn flex-1 flex items-center justify-between gap-2 px-3 min-w-0 ${
                melodyLit ? 'active-amber' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 font-mono font-bold tracking-[0.06em] shrink-0">
                <Music className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>АВТО-МЭН</span>
              </span>
              <span className="font-mono text-[10.5px] opacity-85 truncate">
                {melodyLit ? `ИГРАЕТ · ${melodyLabel}` : melodyLabel}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Настроить пресеты кнопки Мэн"
              title="Настроить пресеты кнопки «Мэн»"
              className="silver-seg-btn px-2.5 flex items-center justify-center shrink-0 text-white/80 hover:text-white"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Balanced Footer Below Controls: Flags & Non-Clipped Links */}
        <div className="mt-4 pt-3 border-t border-black/15 flex items-center justify-between gap-3 flex-wrap">
          <RegionFlags compact flags={flags} />
          <SiteUrlLink color="#1e2430" align="end" />
        </div>
      </div>
    </div>
  );
};
