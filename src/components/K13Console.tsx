import React from 'react';
import type { SirenMode } from '../audio/sirenEngine';
import { K13_BUTTONS, K13ButtonConfig } from '../types/sgu';
import { FlagId, RegionFlags, SiteUrlLink } from './RegionFlags';

interface K13ConsoleProps {
  powered: boolean;
  mode: SirenMode;
  selectedMode: SirenMode;
  shortLit: boolean;
  hornLit: boolean;
  pulsarPressed: boolean;
  manIsLit: boolean;
  sirenActive: boolean;
  pttPressed: boolean;
  flags: FlagId[];
  onShort: () => void;
  onHornDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHornUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPulsarDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPulsarUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onToggleSiren: () => void;
  onManDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onManUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCycleMode: () => void;
  onPttDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPttUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

const MODE_LABELS: Record<SirenMode, string> = {
  standby: 'OFF',
  hilo: 'HILO',
  yelp: 'YELP',
  wail: 'WAIL',
  pa: 'PA',
  radio: 'RADIO',
  phaser: 'PULSAR',
  melody: 'МЭН',
};

export const K13Console: React.FC<K13ConsoleProps> = ({
  powered,
  mode,
  selectedMode,
  shortLit,
  hornLit,
  pulsarPressed,
  manIsLit,
  sirenActive,
  pttPressed,
  flags,
  onShort,
  onHornDown,
  onHornUp,
  onPulsarDown,
  onPulsarUp,
  onToggleSiren,
  onManDown,
  onManUp,
  onCycleMode,
  onPttDown,
  onPttUp,
}) => {
  const bySlot = (row: 'top' | 'bottom', col: 1 | 2 | 3 | 4): K13ButtonConfig | undefined =>
    K13_BUTTONS.find((b) => b.row === row && b.col === col);

  const bShort = bySlot('top', 1);
  const bHorn = bySlot('top', 2);
  const bSiren = bySlot('bottom', 1);
  const bManual = bySlot('bottom', 2);
  const bMode = bySlot('bottom', 3);
  const bPulsar = bySlot('bottom', 4);

  const activeModeLabel = MODE_LABELS[sirenActive ? mode : selectedMode];

  const renderSquareKey = (
    cfg: K13ButtonConfig | undefined,
    active: boolean,
    ledColor: 'amber' | 'red' | 'emerald' | 'none',
    handlers: {
      onTap?: () => void;
      onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
      onPointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void;
    }
  ) => {
    if (!cfg) return <div />;
    return (
      <button
        type="button"
        onPointerDown={(e) => {
          if (handlers.onTap) {
            e.preventDefault();
            handlers.onTap();
            return;
          }
          handlers.onPointerDown?.(e);
        }}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerUp}
        onLostPointerCapture={handlers.onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={cfg.label}
        aria-pressed={active}
        className={`k13-recessed-btn no-select ${active ? 'is-pressed' : ''}`}
      >
        <span
          className={`k13-thin-led ${
            active && ledColor === 'red'
              ? 'led-red'
              : active && ledColor === 'emerald'
              ? 'led-green'
              : active && ledColor === 'amber'
              ? 'led-amber'
              : ''
          }`}
          aria-hidden="true"
        />
      </button>
    );
  };

  return (
    <div className="k13-physical-body">
      {/* Upper Area: 2 Square Recessed Buttons + Top-Right Characteristic White K-13 Logo */}
      <div className="grid grid-cols-[1fr_1fr_1.45fr] gap-3 items-center px-1">
        <div className="flex justify-center">
          {renderSquareKey(bShort, shortLit, 'amber', { onTap: onShort })}
        </div>

        <div className="flex justify-center">
          {renderSquareKey(bHorn, hornLit, 'red', {
            onPointerDown: onHornDown,
            onPointerUp: onHornUp,
          })}
        </div>

        {/* Characteristic White K-13 Logo (top-right, angled K) */}
        <div className="flex items-center justify-end pr-2 select-none">
          <span className="k13-wordmark" aria-label="K-13">
            K-13
          </span>
        </div>
      </div>

      {/* Middle Printed Labels + Thin Light Horizontal Divider Line (matching Video 2) */}
      <div className="my-2.5">
        <div className="grid grid-cols-[1fr_1fr_0.95fr_0.5fr] gap-2 items-end pb-1 px-1">
          <span className="k13-micro-lbl">{bShort?.label ?? 'SHORT'}</span>
          <span className="k13-micro-lbl">{bHorn?.label ?? 'HORN'}</span>
          <button
            type="button"
            onPointerDown={onPulsarDown}
            onPointerUp={onPulsarUp}
            onPointerCancel={onPulsarUp}
            onLostPointerCapture={onPulsarUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`k13-micro-lbl cursor-pointer bg-transparent border-0 p-0 ${
              pulsarPressed ? 'text-amber-300' : ''
            }`}
          >
            {bPulsar?.label ?? 'PULSAR'}
          </button>
          <span className="text-[9px] font-bold tracking-wider text-amber-300/85 text-center truncate">
            {activeModeLabel}
          </span>
        </div>

        <div className="h-[1.5px] w-full bg-white/75 rounded-full" aria-hidden="true" />

        <div className="grid grid-cols-[1fr_1fr_0.95fr_0.5fr] gap-2 items-start pt-1 px-1">
          <span className="k13-micro-lbl">{bSiren?.label ?? 'SIREN'}</span>
          <span className="k13-micro-lbl">{bManual?.label ?? 'MANUAL'}</span>
          <span className="k13-micro-lbl">{bMode?.label ?? 'MODE'}</span>
          <span aria-hidden="true" />
        </div>
      </div>

      {/* Lower Row: 3 Square Recessed Buttons (SIREN, MANUAL, MODE) + Round Chrome/Brass PULSAR Trigger */}
      <div className="grid grid-cols-[1fr_1fr_0.95fr_0.5fr] gap-3 items-center px-1">
        <div className="flex justify-center">
          {renderSquareKey(bSiren, sirenActive, 'amber', { onTap: onToggleSiren })}
        </div>

        <div className="flex justify-center">
          {renderSquareKey(bManual, manIsLit, 'amber', {
            onPointerDown: onManDown,
            onPointerUp: onManUp,
          })}
        </div>

        <div className="flex justify-center">
          {renderSquareKey(bMode, sirenActive || selectedMode !== 'wail', 'emerald', { onTap: onCycleMode })}
        </div>

        {/* Round metallic PULSAR ring trigger from physical K-13 unit */}
        <div className="flex justify-center">
          <button
            type="button"
            onPointerDown={onPulsarDown}
            onPointerUp={onPulsarUp}
            onPointerCancel={onPulsarUp}
            onLostPointerCapture={onPulsarUp}
            aria-label={bPulsar?.label ?? 'PULSAR'}
            aria-pressed={pulsarPressed}
            className={`k13-round-metal no-select ${pulsarPressed ? 'is-pressed' : ''}`}
          >
            <span className="k13-round-core" />
          </button>
        </div>
      </div>

      {/* Bottom Strip: Compact ГГС + Region Flags + Compact Link */}
      <div className="grid grid-cols-[0.82fr_1.18fr] gap-2 items-center pt-3 mt-3 border-t border-white/10">
        <button
          type="button"
          onPointerDown={onPttDown}
          onPointerUp={onPttUp}
          onPointerCancel={onPttUp}
          onLostPointerCapture={onPttUp}
          aria-label="ГГС: удерживайте для громкой связи"
          aria-pressed={pttPressed}
          className={`hw-mic-socket no-select !min-h-[48px] !py-1.5 ${pttPressed ? 'lit pressed' : ''}`}
        >
          <div className="rj45-port !w-7 !h-5" aria-hidden="true">
            <span className="rj45-pin !h-2" />
            <span className="rj45-pin !h-2" />
            <span className="rj45-pin !h-2" />
            <span className="rj45-pin !h-2" />
            <span className="rj45-pin !h-2" />
            <span className="rj45-latch" />
          </div>
          <div className="text-left min-w-0">
            <span
              className="block text-xs font-extrabold tracking-wide leading-tight truncate"
              style={{ color: pttPressed ? '#fb7185' : '#f59e0b' }}
            >
              ГГС
            </span>
            <span className="block text-[9.5px] font-semibold text-white/65 leading-tight truncate">
              Микрофон
            </span>
          </div>
        </button>

        <div className="flex flex-col items-center justify-center min-w-0">
          <RegionFlags compact flags={flags} />
          <SiteUrlLink color="#f59e0b" className="mt-0.5" />
        </div>
      </div>
    </div>
  );
};
