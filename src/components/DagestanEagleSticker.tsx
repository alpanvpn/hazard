import React from 'react';

interface DagestanEagleStickerProps {
  className?: string;
}

interface InlineWithSticker {
  eagleStickerUri?: string;
}

/**
 * Vinyl die-cut emblem sticker featuring the official Coat of Arms of Dagestan
 * provided by the user, framed cleanly without square white corners.
 */
export const DagestanEagleSticker: React.FC<DagestanEagleStickerProps> = ({ className = '' }) => {
  const inline = (typeof window !== 'undefined'
    ? (window as unknown as { __ALPAN_INLINE__?: InlineWithSticker }).__ALPAN_INLINE__
    : undefined);
  const src = inline?.eagleStickerUri || '/assets/aistudio/image_a1953bb7.png';

  return (
    <div
      className={`pointer-events-none select-none rounded-full bg-white p-[3px] border-[1.8px] border-[#eab308] overflow-hidden ${className}`}
      aria-hidden="true"
      style={{
        boxShadow:
          '0 4px 12px rgba(0, 0, 0, 0.85), 0 0 10px rgba(234, 179, 8, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.9)',
      }}
    >
      <div className="relative w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
        <img
          src={src}
          alt="Герб Дагестана — золотой орёл"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain scale-[1.03]"
          draggable={false}
        />
        {/* Subtle vinyl laminate sheen */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.06) 100%)',
          }}
        />
      </div>
    </div>
  );
};
