import React from 'react';

export const SITE_URL = 'https://alpanvpn.github.io/hazard/';

interface FlagSizeProps {
  compact?: boolean;
  className?: string;
}

export const RegionFlags: React.FC<FlagSizeProps> = ({ compact = false, className = '' }) => {
  const w = compact ? 20 : 25;
  const h = compact ? 13 : 16;

  return (
    <div
      className={`inline-flex items-center justify-center gap-1.5 shrink-0 ${className}`}
      aria-label="Флаги Дагестана, Чечни и Ингушетии"
    >
      {/* Флаг Республики Дагестан */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 30 20"
        className="rounded-[2px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Дагестан"
      >
        <rect width="30" height="6.67" y="0" fill="#00923F" />
        <rect width="30" height="6.67" y="6.66" fill="#0039A6" />
        <rect width="30" height="6.67" y="13.33" fill="#D52B1E" />
      </svg>

      {/* Флаг Чеченской Республики */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 30 20"
        className="rounded-[2px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Чечня"
      >
        <rect width="30" height="11.2" y="0" fill="#00923F" />
        <rect width="30" height="1.6" y="11.2" fill="#FFFFFF" />
        <rect width="30" height="7.2" y="12.8" fill="#D52B1E" />
        <rect width="4.2" height="20" x="0" y="0" fill="#FFFFFF" />
        {/* Традиционный золотой орнамент */}
        <path
          d="M1.2 2.2 C2.8 2.2 2.8 4.4 1.4 4.4 C2.8 4.4 2.8 6.8 1.2 6.8 M1.2 8.6 C2.8 8.6 2.8 11 1.4 11 C2.8 11 2.8 13.4 1.2 13.4 M1.2 15.2 C2.8 15.2 2.8 17.6 1.2 17.6"
          fill="none"
          stroke="#C89B2B"
          strokeWidth="0.95"
          strokeLinecap="round"
        />
      </svg>

      {/* Флаг Республики Ингушетия */}
      <svg
        width={w}
        height={h}
        viewBox="0 0 30 20"
        className="rounded-[2px] border border-white/25 shadow-sm shrink-0"
        role="img"
        aria-label="Ингушетия"
      >
        <rect width="30" height="20" fill="#FFFFFF" />
        <rect width="30" height="3.3" y="0" fill="#00923F" />
        <rect width="30" height="3.3" y="16.7" fill="#00923F" />
        {/* Солярный знак (трискелион) */}
        <g transform="translate(15 10)" fill="none" stroke="#CE1126" strokeWidth="1.25" strokeLinecap="round">
          <circle cx="0" cy="0" r="1.4" fill="#CE1126" stroke="none" />
          <path d="M0 -1.3 A 2.7 2.7 0 0 1 2.5 -4.1" />
          <path d="M1.12 0.65 A 2.7 2.7 0 0 1 2.3 4.2" />
          <path d="M-1.12 0.65 A 2.7 2.7 0 0 1 -4.7 0.1" />
        </g>
      </svg>
    </div>
  );
};

export const BrandWatermark: React.FC<{ compact?: boolean; className?: string }> = ({
  compact = false,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center gap-1 text-center ${className}`}>
    <RegionFlags compact={compact} />
    <a
      href={SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mono-nums text-[10px] tracking-wide text-white/55 hover:text-[var(--acc)] transition-colors no-underline break-all"
    >
      {SITE_URL}
    </a>
  </div>
);
