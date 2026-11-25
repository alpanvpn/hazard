import React, { useMemo, useRef } from 'react';

interface RotaryKnobProps {
  label: string;
  displayValue: string;
  hint: string;
  value: number; // 0..1
  steps?: number; // 0 = continuous, >0 = discrete steps
  onTapStep?: () => void;
  onChange: (nextVal: number) => void;
  ariaLabel: string;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  displayValue,
  hint,
  value,
  steps = 0,
  onTapStep,
  onChange,
  ariaLabel,
}) => {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const movedRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastSnappedRef = useRef<number>(value);

  const angle = value * 270 - 135;

  const ticks = useMemo(() => {
    const count = steps > 0 ? steps + 1 : 17;
    return Array.from({ length: count }, (_, idx) => {
      const ratio = idx / (count - 1);
      const deg = ratio * 270 - 135;
      const major = steps > 0 || idx % 4 === 0;
      const lit = ratio <= value + 0.01;
      return { deg, major, lit };
    });
  }, [steps, value]);

  const updateCircular = (clientX: number, clientY: number) => {
    const el = dialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Ignore tiny jitter right on top of the center pivot
    if (Math.hypot(clientX - cx, clientY - cy) < 10) return;

    let ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
    if (ang > 180) ang -= 360;
    ang = Math.max(-135, Math.min(135, ang));
    let v = (ang + 135) / 270;
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
    e.currentTarget.setPointerCapture(e.pointerId);
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

  return (
    <div className="flex flex-col items-center text-center w-[47%] no-select">
      <span className="dial-label text-[11px] font-bold tracking-[0.14em] uppercase">{label}</span>
      <span className="mono-nums dial-readout text-xs font-extrabold mt-0.5 mb-2.5 tracking-wider">
        {displayValue}
      </span>

      <div className="dial-stage">
        <div className="dial-ticks" aria-hidden="true">
          {ticks.map((t, idx) => (
            <span
              key={idx}
              className={`dial-tick ${t.major ? 'major' : ''} ${t.lit ? 'lit' : ''}`}
              style={{ transform: `rotate(${t.deg}deg)` }}
            />
          ))}
        </div>

        <div
          ref={dialRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value * 100)}
          aria-valuetext={displayValue}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onKeyDown={onKeyDown}
          className="dial"
        >
          <div className="dial-knurl" aria-hidden="true" />
          <div className="dial-cap" aria-hidden="true" />
          <div className="dial-rotor" style={{ transform: `rotate(${angle}deg)` }}>
            <span className="dial-needle" />
          </div>
        </div>
      </div>

      <span className="mt-2 text-[11px] text-[var(--dim)]">{hint}</span>
    </div>
  );
};
