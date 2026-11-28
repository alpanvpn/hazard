import React, { useMemo, useRef } from 'react';

interface RotaryKnobProps {
  size?: 'sm' | 'lg';
  value: number; // 0..1
  steps?: number; // 0 = continuous, >0 = discrete steps
  hideTicks?: boolean;
  onTapStep?: () => void;
  onChange: (nextVal: number) => void;
  ariaLabel: string;
  displayText?: string;
  variant?: 'dark' | 'silver';
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  size = 'lg',
  value,
  steps = 0,
  hideTicks = false,
  onTapStep,
  onChange,
  ariaLabel,
  displayText,
  variant = 'dark',
}) => {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const movedRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastSnappedRef = useRef<number>(value);

  // -135..+135 for volume; -125..+125 for 6-position circular horseshoe selector
  const maxArc = steps > 0 ? 125 : 135;
  const angle = value * (maxArc * 2) - maxArc;

  const ticks = useMemo(() => {
    if (hideTicks) return [];
    const count = steps > 0 ? steps + 1 : 13;
    return Array.from({ length: count }, (_, idx) => {
      const ratio = idx / (count - 1);
      const deg = ratio * (maxArc * 2) - maxArc;
      return { deg, lit: steps > 0 ? Math.abs(ratio - value) < 0.06 : ratio <= value + 0.01 };
    });
  }, [hideTicks, steps, value, maxArc]);

  const updateCircular = (clientX: number, clientY: number) => {
    const el = dialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (Math.hypot(clientX - cx, clientY - cy) < 8) return;

    let ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
    if (ang > 180) ang -= 360;
    ang = Math.max(-maxArc, Math.min(maxArc, ang));
    let v = (ang + maxArc) / (maxArc * 2);
    if (steps > 0) {
      v = Math.round(v * steps) / steps;
    }
    v = Math.max(0, Math.min(1, v));
    if (Math.abs(v - lastSnappedRef.current) > 0.002) {
      lastSnappedRef.current = v;
      onChange(v);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    activePointerId.current = e.pointerId;
    movedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    lastSnappedRef.current = value;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // iOS Safari may ignore synthetic capture
    }
    if (!onTapStep) {
      updateCircular(e.clientX, e.clientY);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    if (Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y) > 5) {
      movedRef.current = true;
    }
    if (movedRef.current || !onTapStep) {
      updateCircular(e.clientX, e.clientY);
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current === e.pointerId) {
      if (!movedRef.current && onTapStep) {
        onTapStep();
      }
      activePointerId.current = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release failures
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = steps > 0 ? 1 / steps : 0.05;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(1, Number((value + delta).toFixed(4))));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(0, Number((value - delta).toFixed(4))));
    }
  };

  const isSmall = size === 'sm';

  return (
    <div className={`dial-stage ${isSmall ? 'dial-sm' : 'dial-lg'} no-select`}>
      {ticks.length > 0 && (
        <div className="dial-ticks" aria-hidden="true">
          {ticks.map((t, idx) => (
            <span
              key={idx}
              className={`dial-tick ${t.lit ? 'lit' : ''}`}
              style={{ transform: `rotate(${t.deg}deg)` }}
            />
          ))}
        </div>
      )}

      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={displayText ?? `${Math.round(value * 100)}%`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onKeyDown={onKeyDown}
        className={`dial ${isSmall ? 'dial-sm' : 'dial-lg'} ${
          variant === 'silver' ? 'dial-silver' : ''
        }`}
      >
        <div className="dial-knurl" aria-hidden="true" />
        <div className="dial-cap" aria-hidden="true" />
        <div className="dial-rotor" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="dial-needle" />
        </div>
      </div>
    </div>
  );
};
