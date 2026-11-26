import React, { useEffect, useRef } from 'react';

interface TelemetrySubscriberProps {
  powered: boolean;
  volume: number;
  subscribe: (fn: (hz: number, level: number) => void) => () => void;
}

export const LiveHzReadout: React.FC<{
  powered: boolean;
  subscribe: (fn: (hz: number, level: number) => void) => () => void;
}> = React.memo(({ powered, subscribe }) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!powered && spanRef.current) {
      spanRef.current.textContent = '';
    }
    return subscribe((hz) => {
      if (!spanRef.current) return;
      spanRef.current.textContent = powered && hz > 0 ? `${hz} Гц` : '';
    });
  }, [powered, subscribe]);

  return (
    <span
      ref={spanRef}
      className="mono-nums text-xs sm:text-sm font-bold text-white/80 shrink-0"
    />
  );
});

LiveHzReadout.displayName = 'LiveHzReadout';

export const LiveLedBar: React.FC<TelemetrySubscriberProps> = React.memo(
  ({ powered, volume, subscribe }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const paint = (level: number) => {
      const container = containerRef.current;
      if (!container) return;
      const activeLeds = !powered
        ? 0
        : level > 0
        ? Math.min(16, Math.round((level / 10) * 16))
        : Math.round(volume * 16);

      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement;
        const lit = i < activeLeds;
        el.style.backgroundColor = !lit
          ? 'rgba(255,255,255,0.14)'
          : i >= 14
          ? '#ff495c'
          : i >= 12
          ? '#ffd46b'
          : '#90d65c';
      }
    };

    useEffect(() => {
      paint(0);
      return subscribe((_hz, level) => {
        paint(level);
      });
    }, [powered, volume, subscribe]);

    return (
      <div ref={containerRef} className="flex items-center gap-[2px] h-3.5" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, idx) => (
          <span key={idx} className="w-1.5 h-3.5 rounded-[1px]" style={{ backgroundColor: 'rgba(255,255,255,0.14)' }} />
        ))}
      </div>
    );
  }
);

LiveLedBar.displayName = 'LiveLedBar';
