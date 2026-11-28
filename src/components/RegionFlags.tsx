import React from 'react';

export const SITE_URL = 'https://alpanvpn.github.io/hazard/';

export type FlagId = 'dagestan' | 'chechnya' | 'ingushetia' | 'circassia';

export const FLAG_OPTIONS: Array<{ id: FlagId; label: string }> = [
  { id: 'dagestan', label: 'Дагестан' },
  { id: 'chechnya', label: 'Чечня' },
  { id: 'ingushetia', label: 'Ингушетия' },
  { id: 'circassia', label: 'Черкесия' },
];

export const DEFAULT_FLAGS: FlagId[] = ['dagestan', 'chechnya', 'ingushetia'];

interface FlagSizeProps {
  compact?: boolean;
  className?: string;
  flags?: FlagId[];
}

const CIRCASSIA_ARCH_STARS: Array<{ cx: number; cy: number }> = [
  { cx: 19, cy: 27 },
  { cx: 23, cy: 20 },
  { cx: 29, cy: 15 },
  { cx: 37, cy: 11.5 },
  { cx: 45, cy: 10 },
  { cx: 53, cy: 11.5 },
  { cx: 61, cy: 15 },
  { cx: 67, cy: 20 },
  { cx: 71, cy: 27 },
];

const CIRCASSIA_ROW_STARS: Array<{ cx: number; cy: number }> = [
  { cx: 33, cy: 23 },
  { cx: 45, cy: 20 },
  { cx: 57, cy: 23 },
];

function starPath(cx: number, cy: number, rOuter = 2.6, rInner = 1.05): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export const SingleFlagSvg: React.FC<{ id: FlagId; width: number; height: number }> = ({
  id,
  width,
  height,
}) => {
  if (id === 'dagestan') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Дагестан"
      >
        <rect width="90" height="20" y="0" fill="#00923F" />
        <rect width="90" height="20" y="20" fill="#0039A6" />
        <rect width="90" height="20" y="40" fill="#D52B1E" />
      </svg>
    );
  }

  if (id === 'chechnya') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Чечня"
      >
        <rect width="90" height="33" y="0" fill="#00923F" />
        <rect width="90" height="5" y="33" fill="#FFFFFF" />
        <rect width="90" height="22" y="38" fill="#D52B1E" />
        <rect width="12.5" height="60" x="0" y="0" fill="#FFFFFF" />
        <path
          d="M3.5 7 C8.5 7 8.5 13 4 13 C8.5 13 8.5 20 3.5 20 M3.5 26 C8.5 26 8.5 33 4 33 C8.5 33 8.5 40 3.5 40 M3.5 46 C8.5 46 8.5 53 3.5 53"
          fill="none"
          stroke="#C89B2B"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (id === 'ingushetia') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Ингушетия"
      >
        <rect width="90" height="60" fill="#FFFFFF" />
        <rect width="90" height="10" y="0" fill="#00923F" />
        <rect width="90" height="10" y="50" fill="#00923F" />
        <g transform="translate(45 30)">
          <circle cx="0" cy="0" r="4.6" fill="none" stroke="#CE1126" strokeWidth="2.6" />
          {[0, 120, 240].map((deg) => (
            <path
              key={deg}
              transform={`rotate(${deg})`}
              d="M 0 -4.8 L 0 -13.8 A 4.8 4.8 0 0 1 7.2 -10.5"
              fill="none"
              stroke="#CE1126"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      </svg>
    );
  }

  // Флаг Черкесии (Адыгеи): зелёное полотнище, 12 золотых звёзд и 3 перекрещённые стрелы
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 90 60"
      className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
      role="img"
      aria-label="Черкесия"
    >
      <rect width="90" height="60" fill="#006B3F" />
      <g fill="#F5C518">
        {CIRCASSIA_ARCH_STARS.map((s, idx) => (
          <path key={`a-${idx}`} d={starPath(s.cx, s.cy, 2.35, 0.95)} />
        ))}
        {CIRCASSIA_ROW_STARS.map((s, idx) => (
          <path key={`r-${idx}`} d={starPath(s.cx, s.cy, 2.35, 0.95)} />
        ))}
      </g>
      {/* 3 перекрещённые золотые стрелы */}
      <g stroke="#F5C518" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="#F5C518">
        {/* Центральная вертикальная стрела */}
        <line x1="45" y1="53" x2="45" y2="30" />
        <polygon points="45,27 42.5,32 47.5,32" stroke="none" />
        {/* Левая диагональная стрела */}
        <line x1="33" y1="51" x2="56" y2="32" />
        <polygon points="58,30.3 52.5,31.5 55.6,35.4" stroke="none" />
        {/* Правая диагональная стрела */}
        <line x1="57" y1="51" x2="34" y2="32" />
        <polygon points="32,30.3 34.4,35.4 37.5,31.5" stroke="none" />
      </g>
    </svg>
  );
};

export const RegionFlags: React.FC<FlagSizeProps> = ({
  compact = false,
  className = '',
  flags = DEFAULT_FLAGS,
}) => {
  if (!flags.length) return null;
  const w = compact ? 25 : 30;
  const h = compact ? 16 : 20;

  return (
    <div
      className={`inline-flex items-center justify-center gap-1.5 shrink-0 ${className}`}
      aria-label="Выбранные флаги"
    >
      {flags.map((id) => (
        <SingleFlagSvg key={id} id={id} width={w} height={h} />
      ))}
    </div>
  );
};

export const TELEGRAM_CHANNEL_URL = 'https://t.me/alpanhazard';

export const SiteUrlLink: React.FC<{
  color?: string;
  align?: 'center' | 'end' | 'start';
  className?: string;
}> = ({ color, align = 'center', className = '' }) => {
  const alignCls =
    align === 'end' ? 'items-end text-right' : align === 'start' ? 'items-start text-left' : 'items-center text-center';
  return (
    <div className={`flex flex-col ${alignCls} gap-0.5 leading-tight ${className}`}>
      <a
        href={SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-sans text-[9.5px] sm:text-[11px] font-semibold leading-tight tracking-[-0.015em] hover:underline no-underline whitespace-nowrap"
        style={color ? { color } : undefined}
      >
        {SITE_URL}
      </a>
      <a
        href={TELEGRAM_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-sans text-[9.5px] sm:text-[11px] font-bold leading-tight tracking-[-0.01em] hover:underline no-underline whitespace-nowrap opacity-90"
        style={color ? { color } : { color: '#56bfff' }}
      >
        {TELEGRAM_CHANNEL_URL}
      </a>
    </div>
  );
};

export const BrandWatermark: React.FC<{
  compact?: boolean;
  className?: string;
  flags?: FlagId[];
}> = ({ compact = false, className = '', flags = DEFAULT_FLAGS }) => (
  <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${className}`}>
    <RegionFlags compact={compact} flags={flags} />
    <SiteUrlLink className="text-white/75 hover:text-[var(--acc)] transition-colors" />
  </div>
);
