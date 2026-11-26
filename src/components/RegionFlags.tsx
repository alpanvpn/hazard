import React from 'react';

export const SITE_URL = 'https://alpanvpn.github.io/hazard/';

interface FlagSizeProps {
  compact?: boolean;
  className?: string;
}

export const RegionFlags: React.FC<FlagSizeProps> = ({ compact = false, className = '' }) => {
  const w = compact ? 26 : 32;
  const h = compact ? 17 : 21;

  return (
    <div
      className={`inline-flex items-center justify-center gap-1.5 shrink-0 ${className}`}
      aria-label="Флаги Дагестана, Чечни и Ингушетии"
    >
      {/* Флаг Республики Дагестан */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Дагестан"
      >
        <rect width="90" height="20" y="0" fill="#00923F" />
        <rect width="90" height="20" y="20" fill="#0039A6" />
        <rect width="90" height="20" y="40" fill="#D52B1E" />
      </svg>

      {/* Флаг Чеченской Республики */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Чечня"
      >
        <rect width="90" height="33" y="0" fill="#00923F" />
        <rect width="90" height="5" y="33" fill="#FFFFFF" />
        <rect width="90" height="22" y="38" fill="#D52B1E" />
        <rect width="12.5" height="60" x="0" y="0" fill="#FFFFFF" />
        {/* Традиционный золотой орнамент */}
        <path
          d="M3.5 7 C8.5 7 8.5 13 4 13 C8.5 13 8.5 20 3.5 20 M3.5 26 C8.5 26 8.5 33 4 33 C8.5 33 8.5 40 3.5 40 M3.5 46 C8.5 46 8.5 53 3.5 53"
          fill="none"
          stroke="#C89B2B"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>

      {/* Флаг Республики Ингушетия (точный симметричный солярный знак) */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 90 60"
        className="rounded-[3px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Ингушетия"
      >
        <rect width="90" height="60" fill="#FFFFFF" />
        <rect width="90" height="10" y="0" fill="#00923F" />
        <rect width="90" height="10" y="50" fill="#00923F" />
        <g transform="translate(45 30)">
          {/* Центральное кольцо */}
          <circle cx="0" cy="0" r="4.6" fill="none" stroke="#CE1126" strokeWidth="2.6" />
          {/* 3 симметричных луча солярного знака под 120° */}
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
    </div>
  );
};

export const BrandWatermark: React.FC<{ compact?: boolean; className?: string }> = ({
  compact = false,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${className}`}>
    <RegionFlags compact={compact} />
    <a
      href={SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mono-nums text-xs sm:text-sm font-bold tracking-wide text-white/75 hover:text-[var(--acc)] transition-colors no-underline break-all"
    >
      {SITE_URL}
    </a>
  </div>
);
